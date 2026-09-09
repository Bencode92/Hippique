#!/usr/bin/env python3
"""
Verdict sur l'hypothèse Dr Z (Hausch-Ziemba), pré-spécifiée avant de voir 2024-2025.

HYPOTHÈSE, figée le 9 septembre 2026 sur exploration de la seule année 2022 :
  pari       simple placé
  ratio      part du cheval dans le pool GAGNANT / sa part dans le pool PLACÉ
  règle      jouer placé quand ratio >= 1,15
  univers    FR plat, 8 partants et plus, 3 places payées
  référence  jouer placé tous les chevaux du même univers
  critère    ROI de la règle > ROI de la référence, écart significatif (t > 1,96)

APPRENTISSAGE 2022-2023.  TEST 2024-2025, jamais examiné au moment d'écrire ceci.
Aucun paramètre n'est ajusté après coup : ni le seuil de 1,15, ni les bornes de
cote, ni le minimum de partants.

RÉSERVE consignée d'avance : les masses lues sont les masses FINALES, connues
après la fermeture des paris. Une stratégie réelle utiliserait les masses à
T−2 min. Ce test est donc optimiste et ne vaut pas validation opérationnelle.
"""
import json, glob, math

def charge():
    M = {}
    for f in sorted(glob.glob('data/masses/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); M[(d['date'], d['r'], d['c'])] = d['pools']
    R = {}
    for f in sorted(glob.glob('data/rapports/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); R[(d['date'], d['r'], d['c'])] = d['paris']
    B = []
    for f in sorted(glob.glob('data/histo/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            r = json.loads(l); k = (r['date'], r['r'], r['c'])
            if k not in M or k not in R: continue
            divs = {}
            for x in (R[k].get('E_SIMPLE_PLACE') or []):
                if 'NP' in x['comb'] or not x.get('div'): continue
                divs[x['comb']] = x['div'] / 100.0
            if len(divs) < 3: continue
            pg = M[k].get('E_SIMPLE_GAGNANT') or {}
            pp = M[k].get('E_SIMPLE_PLACE') or {}
            sg, sp = sum(pg.values()), sum(pp.values())
            if sg <= 0 or sp <= 0: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 8: continue
            for p in ps:
                n = str(p['n'])
                if n not in pg or n not in pp or pp[n] <= 0: continue
                B.append({'ratio': (pg[n] / sg) / (pp[n] / sp), 'c': p['c'],
                          'an': r['date'][:4], 'pl': divs.get(n, 0.0)})
    return B

def st(S):
    n = len(S)
    if n < 200: return None
    mu = sum(x['pl'] for x in S) / n
    se = (sum((x['pl'] - mu) ** 2 for x in S) / n) ** 0.5 / math.sqrt(n)
    return n, (mu - 1) * 100, se * 100, sum(1 for x in S if x['pl'] > 0) / n * 100

if __name__ == '__main__':
    B = charge()
    A = [x for x in B if x['an'] in ('2022', '2023')]
    T = [x for x in B if x['an'] in ('2024', '2025')]
    print(f"\nAPPRENTISSAGE 2022-2023 : {len(A)} chevaux   |   TEST 2024-2025 : {len(T)} chevaux\n")
    print(f"{'':>26}{'chevaux':>9}{'placé':>9}{'ROI':>9}{'± SE':>7}")
    for nom, S in (('— APPRENTISSAGE —', A), ('— TEST —', T)):
        print(f"\n{nom}")
        print('-' * 60)
        for lo, hi, lab in [(0, .85, 'ratio < 0,85'), (.85, 1.0, 'ratio 0,85–1,0'),
                            (1.0, 1.15, 'ratio 1,0–1,15'), (1.15, 1.3, 'ratio 1,15–1,3'),
                            (1.3, 99, 'ratio >= 1,3')]:
            r = st([x for x in S if lo <= x['ratio'] < hi])
            if r: print(f"{lab:>26}{r[0]:>9}{r[3]:>8.1f}%{r[1]:>8.1f}%{r[2]:>7.1f}")
        ref = st(S); reg = st([x for x in S if x['ratio'] >= 1.15])
        if ref and reg:
            print(f"{'référence (tous)':>26}{ref[0]:>9}{ref[3]:>8.1f}%{ref[1]:>8.1f}%{ref[2]:>7.1f}")
            print(f"{'RÈGLE ratio >= 1,15':>26}{reg[0]:>9}{reg[3]:>8.1f}%{reg[1]:>8.1f}%{reg[2]:>7.1f}")
    # verdict
    ref = st(T); reg = st([x for x in T if x['ratio'] >= 1.15])
    if ref and reg:
        ec = reg[1] - ref[1]; se = math.sqrt(reg[2] ** 2 + ref[2] ** 2); t = ec / se
        print(f"\nVERDICT sur le TEST 2024-2025")
        print(f"  écart règle − référence : {ec:+.1f} points  ± {se:.1f}   t = {t:.2f}")
        print(f"  ROI de la règle         : {reg[1]:+.1f}% ± {reg[2]:.1f}")
        if t > 1.96 and reg[1] > 0: print("  ✅ CONFIRMÉ et ROI positif")
        elif t > 1.96:              print("  ◻️  écart confirmé, mais ROI toujours négatif")
        else:                       print(f"  ❌ NON CONFIRMÉ (t = {t:.2f} < 1,96)")
