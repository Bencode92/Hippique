#!/usr/bin/env python3
"""Probabilité réelle de gagner par tranche de cote, contre ce que la cote promet.

Pour chaque tranche : nombre de chevaux, part qui a gagné (proba observée),
proba impliquée par la cote (1/cote), rapport observé / promis, et ROI réel
au simple gagnant (dividende PMU réel). FR plat 2022-2026.

    python3 bench/calibrage_cotes.py [HIPPODROME|TOUS]
"""
import json, glob, sys, math
import numpy as np
HIP = (sys.argv[1] if len(sys.argv) > 1 else 'PARISLONGCHAMP').upper()
rap = {}
for f in glob.glob('data/rapports/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rap[(d['date'], d['hip'], d['r'], d['c'])] = {x['comb']: x['div'] / 100 for x in d['paris'].get('E_SIMPLE_GAGNANT', [])}
rows = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        if HIP != 'TOUS' and (d['hip'] or '').upper() != HIP: continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        sg = rap.get((d['date'], d['hip'], d['r'], d['c'])) or {}
        fav = min(p['c'] for p in ps)
        for p in ps:
            win = p.get('a') == 1
            rows.append((p['c'], win, (sg.get(str(p['n']), p['c']) - 1) if win else -1.0, p['c'] == fav, len(ps)))
C = np.array([r[0] for r in rows]); W = np.array([r[1] for r in rows]); G = np.array([r[2] for r in rows]); F = np.array([r[3] for r in rows]); N = np.array([r[4] for r in rows])
print(f"{HIP} : {len(rows)} chevaux, {int(W.sum())} courses\n")
T = [(1, 1.5), (1.5, 2), (2, 2.5), (2.5, 3), (3, 4), (4, 5), (5, 6), (6, 8), (8, 10), (10, 15), (15, 20), (20, 30), (30, 50), (50, 100), (100, 9999)]
def table(masque, titre):
    print(f"══ {titre}")
    print(f"   {'cote':10s} {'chevaux':>8s} {'gagnants':>9s} {'proba réelle':>13s} {'promise':>8s} {'réel/promis':>12s} {'ROI réel':>18s}")
    for lo, hi in T:
        m = masque & (C >= lo) & (C < hi)
        n = m.sum()
        if n < 30: continue
        pr = W[m].mean(); pp = (1 / C[m]).mean(); g = G[m]
        lib = f"{lo}-{hi}" if hi < 9999 else f"{lo}+"
        print(f"   {lib:10s} {n:8d} {int(W[m].sum()):9d} {100*pr:12.1f} % {100*pp:7.1f} % {pr/pp:12.2f} {100*g.mean():+8.1f} % ± {100*g.std(ddof=1)/math.sqrt(n):4.1f}")
    print()
table(np.ones(len(C), bool), 'tous les chevaux')
table(F, 'le favori seulement')
table(~F, 'les non-favoris')
table(N >= 14, 'grands champs (14 partants et plus), tous chevaux')
