#!/usr/bin/env python3
"""
Verdict sur l'hypothèse pré-spécifiée (commit b18e29bc).

    python3 bench/verdict_couple.py

HYPOTHÈSE, figée avant de voir les données de test :
  pari       couplé gagnant
  sélection  les 2 plus fortes dérives de cote parmi le top-4 du marché
  univers    courses FR plat, 8 partants et plus
  référence  le top-2 du marché
  critère    écart apparié > 0 avec t > 1,96

Elle a été formulée sur 2025 (+8,8 points, t = 1,15). L'ensemble de test est
donc 2022-2024 : trois années collectées après coup, jamais examinées.
Aucun paramètre n'est ajusté ici — ni le levier, ni la taille du pool, ni le
seuil de partants.
"""
import json, glob, math

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
            for p in ps:
                cr = p.get('cr') or 0
                p['dv'] = (cr - p['c']) / cr * 100 if cr > 1 else 0.0
            cs.append({'ps': sorted(ps, key=lambda p: p['c']),
                       'paris': rap[k], 'an': r['date'][:4]})
    return cs

def couple(paris, sel):
    s = {str(p['n']) for p in sel}
    for r in paris.get('E_COUPLE_GAGNANT', []):
        c = r['comb']
        if 'NP' in c: continue
        if set(c.split('-')) == s: return (r['div'] or 0) / 100.0
    return 0.0

def bloc(cs, titre):
    if len(cs) < 100:
        print(f"{titre:>22} : trop peu de courses ({len(cs)})"); return
    ga = [couple(c['paris'], c['ps'][:2]) for c in cs]
    gb = [couple(c['paris'], sorted(c['ps'][:4], key=lambda p: -p['dv'])[:2]) for c in cs]
    d = [y - x for x, y in zip(ga, gb)]
    n = len(cs)
    def st(g):
        mu = sum(g) / n
        se = (sum((x - mu) ** 2 for x in g) / n) ** 0.5 / math.sqrt(n)
        return (mu - 1) * 100, se * 100, sum(1 for x in g if x > 0) / n * 100
    ra, sa, ta = st(ga); rb, sb, tb = st(gb)
    mu = sum(d) / n
    sd = (sum((x - mu) ** 2 for x in d) / n) ** 0.5 / math.sqrt(n)
    t = mu / sd if sd else 0
    print(f"{titre:>22}{n:>8}{ra:>9.1f}%{rb:>9.1f}%{mu*100:>+9.1f}{sd*100:>7.1f}{t:>7.2f}")
    return t

if __name__ == '__main__':
    CS = charge()
    TEST = [c for c in CS if c['an'] in ('2022', '2023', '2024')]
    FORM = [c for c in CS if c['an'] == '2025']
    print(f"\nCorpus : {len(CS)} courses avec rapports (>= 8 partants)")
    print(f"  formulation 2025 : {len(FORM)}   |   TEST 2022-2024 : {len(TEST)}\n")
    print(f"{'':>22}{'courses':>8}{'marché':>10}{'dérive':>10}{'écart':>9}{'± SE':>7}{'t':>7}")
    print('-' * 73)
    for an in ('2022', '2023', '2024'):
        bloc([c for c in CS if c['an'] == an], an)
    print('-' * 73)
    t = bloc(TEST, 'TEST 2022-2024')
    bloc(FORM, 'formulation 2025')
    bloc(CS, 'tout 2022-2025')
    print()
    if t is not None:
        if t > 1.96:   print("  ✅ CONFIRMÉ — écart significatif à 95% sur données jamais vues")
        elif t > 0:    print(f"  ◻️  NON CONFIRMÉ — écart positif mais t = {t:.2f} < 1,96")
        else:          print(f"  ❌ INFIRMÉ — l'écart change de signe (t = {t:.2f})")
