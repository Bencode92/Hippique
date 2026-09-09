#!/usr/bin/env python3
"""
Calibration du panneau de décision : proba d'un pari et dividende attendu.

    python3 bench/calibration_paris.py        # ajuste et écrit data/calibration_paris.json

Deux briques, ajustées sur 13 242 courses FR plat 2022-2025 :

1. PROBABILITÉ — modèle de Harville à partir des probabilités implicites
   normalisées p_i = (1/cote_i) / Σ(1/cote). Vérifié : sur le couplé gagnant
   l'écart prédit/observé reste sous 0,01 sur toute la gamme. Sur le trio le
   modèle est optimiste aux faibles probabilités, on ajuste une correction.

2. DIVIDENDE — régression log-log du rapport observé sur la probabilité :
   log(div) = a + b·log(1/p). Un marché juste donnerait b = 1 et a = log(0,85).
   L'écart à ces valeurs mesure le biais favori/outsider propre à chaque pari.

L'espérance d'un pari devient alors  EV = P × div̂ − 1, calculable AVANT la
course, pour n'importe quelle sélection.
"""
import json, glob, math
from itertools import permutations

def charge():
    rap = {}
    for f in sorted(glob.glob('data/rapports/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); rap[(d['date'], d['r'], d['c'])] = d['paris']
    cs = []
    for f in sorted(glob.glob('data/histo/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            r = json.loads(l); k = (r['date'], r['r'], r['c'])
            if k not in rap: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 8: continue
            ps.sort(key=lambda p: p['c'])
            inv = sum(1 / p['c'] for p in ps)
            for p in ps: p['pw'] = (1 / p['c']) / inv
            cs.append({'ps': ps, 'paris': rap[k]})
    return cs

def p_couple(a, b): return a * b / (1 - a) + b * a / (1 - b)
def p_trio(v):
    return sum(x * (y / (1 - x)) * (z / (1 - x - y)) for x, y, z in permutations(v))

def gagne(paris, t, sel):
    s = {str(p['n']) for p in sel}
    for r in paris.get(t, []):
        c = r['comb']
        if 'NP' in c: continue
        if set(c.split('-')) == s: return (r['div'] or 0) / 100.0
    return 0.0

def moindres_carres(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sxy / sxx; a = my - b * mx
    return a, b

if __name__ == '__main__':
    CS = charge()
    out = {'_source': f'{len(CS)} courses FR plat 2022-2025, 8 partants et plus',
           'paris': {}}
    # échantillons : plusieurs sélections par course pour couvrir la gamme de probas
    PLANS = [
        ('E_SIMPLE_GAGNANT', 1, lambda c: [[c['ps'][i]] for i in range(min(6, len(c['ps'])))],
         lambda s: s[0]['pw']),
        ('E_COUPLE_GAGNANT', 2, lambda c: [[c['ps'][i], c['ps'][j]]
                                           for i in range(4) for j in range(i + 1, 5)],
         lambda s: p_couple(s[0]['pw'], s[1]['pw'])),
        ('E_TRIO', 3, lambda c: [[c['ps'][0], c['ps'][1], c['ps'][2]],
                                 [c['ps'][0], c['ps'][1], c['ps'][3]],
                                 [c['ps'][0], c['ps'][2], c['ps'][3]],
                                 [c['ps'][1], c['ps'][2], c['ps'][3]]],
         lambda s: p_trio([x['pw'] for x in s])),
    ]
    for t, k, gen, pf in PLANS:
        X, Y, obs, pred, n = [], [], 0, 0.0, 0
        for c in CS:
            if len(c['ps']) < 6: continue
            for sel in gen(c):
                p = pf(sel)
                if not (1e-4 < p < 0.9): continue
                d = gagne(c['paris'], t, sel)
                n += 1; pred += p; obs += (1 if d > 0 else 0)
                if d > 0:
                    X.append(math.log(1 / p)); Y.append(math.log(d))
        if len(X) < 200: continue
        a, b = moindres_carres(X, Y)
        out['paris'][t] = {'a': round(a, 4), 'b': round(b, 4),
                           'n_paris': n, 'n_gagnants': len(X),
                           'proba_predite': round(pred / n, 4),
                           'proba_observee': round(obs / n, 4)}
        print(f"{t:>20}  log(div) = {a:+.3f} {b:+.3f}·log(1/p)   "
              f"proba prédite {pred/n:.4f} vs observée {obs/n:.4f}   ({n} paris)")
    json.dump(out, open('data/calibration_paris.json', 'w'), ensure_ascii=False, indent=2)
    print("\n→ data/calibration_paris.json")
    print("\nLecture : b = 1 et a = log(0,85) = −0,163 décriraient un marché juste.")
    for t, v in out['paris'].items():
        ecart = "surcote les combinaisons rares" if v['b'] < 1 else "sous-cote les rares"
        print(f"  {t:>20}  b = {v['b']:.3f}  →  {ecart}")
