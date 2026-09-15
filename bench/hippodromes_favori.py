#!/usr/bin/env python3
"""Le favori, simple gagnant, hippodrome par hippodrome — dividendes réels 2022-2026.

Tous champs et 14 partants et plus. Attention : 40 hippodromes = 40 tirages ;
à ± 8 points, deux ou trois seront positifs par hasard. Longchamp a été trouvé
comme ça. Un hippodrome ne « tient » que s'il est positif chaque année ET qu'il
survit à un test écrit d'avance sur des paris à venir.

    python3 bench/hippodromes_favori.py
"""
import json, glob, math, collections
import numpy as np
rap = {}
for f in glob.glob('data/rapports/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rap[(d['date'], d['hip'], d['r'], d['c'])] = {x['comb']: x['div'] / 100 for x in d['paris'].get('E_SIMPLE_GAGNANT', [])}
G = collections.defaultdict(list); G14 = collections.defaultdict(list); AN = collections.defaultdict(lambda: collections.defaultdict(list))
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        fav = min(ps, key=lambda p: p['c']); sg = rap.get((d['date'], d['hip'], d['r'], d['c'])) or {}
        g = (sg.get(str(fav['n']), fav['c']) - 1) if fav.get('a') == 1 else -1.0
        h = (d['hip'] or '').upper()
        G[h].append(g); AN[h][d['date'][:4]].append(g)
        if len(ps) >= 14: G14[h].append(g)
def cell(v):
    if len(v) < 30: return f"{'—':>15s}"
    a = np.array(v); return f"{100*a.mean():+6.1f} ±{100*a.std(ddof=1)/math.sqrt(len(a)):4.0f} n={len(a):4d}"
rows = sorted(G.items(), key=lambda kv: -len(kv[1]))
print(f"{'hippodrome':22s} {'favori, tous champs':>26s} {'favori, 14+ partants':>26s}   années positives (tous champs)")
for h, v in rows[:28]:
    ans = AN[h]; pos = sum(1 for a, g in ans.items() if len(g) >= 20 and np.mean(g) > 0); tot = sum(1 for a, g in ans.items() if len(g) >= 20)
    print(f"{h:22s} {cell(v):>26s} {cell(G14[h]):>26s}   {pos}/{tot}")
allg = [g for v in G.values() for g in v]
print(f"\n{'NATIONAL':22s} {cell(allg):>26s} {cell([g for v in G14.values() for g in v]):>26s}")
