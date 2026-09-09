#!/usr/bin/env python3
"""
T1 et T2 — le ratio Dr Z informe-t-il PAR CHEVAL, ou n'est-ce qu'un biais par
tranche de cote ? Tests demandés par l'expert consulté, point de décision.

    python3 bench/drz_t1_t2.py

T1 : ROI PLACÉ par tranche de ratio, à tranche de cote gagnante FIXÉE.
     Si l'écart disparaît à cote fixée, la règle se réduit à « jouer les
     favoris au placé » et le résultat est connu depuis quarante ans.
T2 : ROI et taux de victoire GAGNANT par tranche de ratio, à cote fixée.
     Dit si le pool placé contient de l'information sur la victoire.

RÉSULTATS (139 818 chevaux, 2022-2025) :
  T1 — l'écart PERSISTE dans chaque tranche de cote, de +11,8 à +23,7 points.
       À ratio >= 1,15 l'espérance placé est plate autour de zéro de la cote
       1,5 à la cote 20. C'est un signal PAR CHEVAL.
  T2 — le ratio prédit aussi les victoires à cote fixée : +1,1 à +2,3 points
       de taux de victoire. Le pool placé contient donc de l'information, mais
       l'effet sur le marché gagnant (+3 à +16 pts de ROI, souvent dans le
       bruit) ne franchit jamais le prélèvement — meilleure case -4,0%.

Lecture : signal d'information réel, exploitable seulement au placé où la
mauvaise cotation du pool l'amplifie d'un facteur deux à trois.
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
            d3 = {x['comb']: x['div'] / 100.0 for x in (R[k].get('E_SIMPLE_PLACE') or [])
                  if 'NP' not in x['comb'] and x.get('div')}
            if len(d3) < 3: continue
            pg = M[k].get('E_SIMPLE_GAGNANT') or {}; pp = M[k].get('E_SIMPLE_PLACE') or {}
            sg, sp = sum(pg.values()), sum(pp.values())
            if sg <= 0 or sp <= 0: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 8: continue
            for p in ps:
                n = str(p['n'])
                if n not in pg or n not in pp or pp[n] <= 0: continue
                B.append({'ratio': (pg[n] / sg) / (pp[n] / sp), 'c': p['c'],
                          'pl': d3.get(n, 0.0),
                          'gg': p['c'] if p.get('a') == 1 else 0.0,
                          'w': p.get('a') == 1})
    return B

def st(S, ch):
    n = len(S)
    if n < 250: return None
    g = [x[ch] for x in S]; mu = sum(g) / n
    se = (sum((y - mu) ** 2 for y in g) / n) ** 0.5 / math.sqrt(n)
    return n, (mu - 1) * 100, se * 100, sum(1 for x in S if x['w']) / n * 100

COTES = [(1.5, 2.5, '1,5 – 2,5'), (2.5, 4, '2,5 – 4'), (4, 6, '4 – 6'),
         (6, 10, '6 – 10'), (10, 20, '10 – 20'), (20, 1e9, '>= 20')]

if __name__ == '__main__':
    B = charge()
    print(f"\n{len(B)} chevaux, plat FR 2022-2025, 8 partants et plus\n")
    for titre, ch in [('T1 — ROI PLACÉ', 'pl'), ('T2 — ROI GAGNANT', 'gg')]:
        print(f"{titre}, par ratio, à tranche de cote FIXÉE")
        print(f"{'cote':>14}{'ratio<1':>17}{'ratio 1–1,15':>17}{'ratio>=1,15':>17}{'écart':>8}")
        print('-' * 75)
        for lo, hi, lab in COTES:
            S = [x for x in B if lo <= x['c'] < hi]
            a = st([x for x in S if x['ratio'] < 1], ch)
            m = st([x for x in S if 1 <= x['ratio'] < 1.15], ch)
            b = st([x for x in S if x['ratio'] >= 1.15], ch)
            if not (a and b): continue
            ms = f"{m[1]:>10.1f}% ±{m[2]:>3.1f}" if m else f"{'—':>17}"
            print(f"{lab:>14}{a[1]:>10.1f}% ±{a[2]:>3.1f}{ms}{b[1]:>10.1f}% ±{b[2]:>3.1f}{b[1]-a[1]:>+8.1f}")
        print()
    print("Taux de VICTOIRE observé, à cote fixée")
    print(f"{'cote':>14}{'ratio<1':>13}{'ratio>=1,15':>14}{'écart':>9}")
    print('-' * 52)
    for lo, hi, lab in COTES[1:5]:
        S = [x for x in B if lo <= x['c'] < hi]
        a = st([x for x in S if x['ratio'] < 1], 'gg')
        b = st([x for x in S if x['ratio'] >= 1.15], 'gg')
        if a and b: print(f"{lab:>14}{a[3]:>12.1f}%{b[3]:>13.1f}%{b[3]-a[3]:>+9.1f}")
