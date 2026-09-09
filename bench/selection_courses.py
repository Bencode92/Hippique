#!/usr/bin/env python3
"""
Sélection de courses : existe-t-il une poche exploitable ?

    python3 bench/selection_courses.py

On ne parie plus toutes les courses. On balaie des filtres (taille du peloton,
cote du favori, distance, allocation, type de course, dérive maximale du top-4)
seuls puis croisés deux à deux, sur QUATRE stratégies de pari.

Protocole : recherche sur 2025 uniquement, puis les meilleures candidates sont
confrontées à 2022-2024, jamais regardées. Le nombre de combinaisons testées
est affiché — avec N essais, le meilleur ROI d'un jeu de bruit pur monte
mécaniquement, et c'est le test hors échantillon qui tranche.
"""
import json, glob, math
from collections import defaultdict

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
            ps.sort(key=lambda p: p['c'])
            cs.append({'ps': ps, 'paris': rap[k], 'an': r['date'][:4],
                       'n': len(ps), 'd': r.get('dist') or 0,
                       'al': r.get('alloc') or 0, 'cat': r.get('cat') or 'INCONNU',
                       'dvmax': max(p['dv'] for p in ps[:4])})
    return cs

def gain(paris, t, sel):
    s = {str(p['n']) for p in sel}
    for r in paris.get(t, []):
        c = r['comb']
        if 'NP' in c: continue
        if set(c.split('-')) == s: return (r['div'] or 0) / 100.0
    return 0.0

STRATS = {
 'couplé marché':  ('E_COUPLE_GAGNANT', lambda c: c['ps'][:2]),
 'couplé dérive':  ('E_COUPLE_GAGNANT', lambda c: sorted(c['ps'][:4], key=lambda p: -p['dv'])[:2]),
 'gagnant favori': ('E_SIMPLE_GAGNANT', lambda c: c['ps'][:1]),
 'gagnant dérive': ('E_SIMPLE_GAGNANT', lambda c: sorted(c['ps'][:4], key=lambda p: -p['dv'])[:1]),
}

def roi(cs, strat):
    t, sel = STRATS[strat]
    g = [gain(c['paris'], t, sel(c)) for c in cs]
    n = len(g)
    if n < 60: return None
    mu = sum(g) / n
    se = (sum((x - mu) ** 2 for x in g) / n) ** 0.5 / math.sqrt(n)
    return n, (mu - 1) * 100, se * 100

def filtres(CS):
    als = sorted(c['al'] for c in CS if c['al'])
    q = [als[int(len(als) * x)] for x in (0.25, 0.5, 0.75)]
    F = {}
    for lo, hi, lab in [(8,11,'8-11 partants'),(12,15,'12-15 partants'),(16,99,'16+ partants')]:
        F[lab] = (lambda c, lo=lo, hi=hi: lo <= c['n'] <= hi)
    for lo, hi, lab in [(0,2.5,'favori < 2,5'),(2.5,4,'favori 2,5-4'),(4,99,'favori > 4')]:
        F[lab] = (lambda c, lo=lo, hi=hi: lo <= c['ps'][0]['c'] < hi)
    for lo, hi, lab in [(0,1499,'< 1500 m'),(1500,2099,'1500-2099 m'),(2100,9999,'>= 2100 m')]:
        F[lab] = (lambda c, lo=lo, hi=hi: lo <= c['d'] <= hi)
    F['alloc basse'] = lambda c: 0 < c['al'] < q[0]
    F['alloc haute'] = lambda c: c['al'] >= q[2]
    for cat in ('COURSE_A_CONDITIONS', 'HANDICAP_DIVISE', 'A_RECLAMER'):
        F[cat.lower().replace('_', ' ')] = (lambda c, k=cat: c['cat'] == k)
    for s, lab in [(10, 'dérive max > 10%'), (25, 'dérive max > 25%'), (50, 'dérive max > 50%')]:
        F[lab] = (lambda c, s=s: c['dvmax'] > s)
    return F

if __name__ == '__main__':
    CS = charge()
    FORM = [c for c in CS if c['an'] == '2025']
    TEST = [c for c in CS if c['an'] in ('2022', '2023', '2024')]
    F = filtres(CS)
    noms = list(F)
    combis = [(n,) for n in noms] + [(a, b) for i, a in enumerate(noms) for b in noms[i+1:]]
    print(f"\nRecherche sur 2025 ({len(FORM)} courses) — {len(combis)} filtres × {len(STRATS)} stratégies "
          f"= {len(combis)*len(STRATS)} essais")
    print(f"Test sur 2022-2024 ({len(TEST)} courses)\n")
    res = []
    for cb in combis:
        sub = [c for c in FORM if all(F[k](c) for k in cb)]
        if len(sub) < 150: continue
        for s in STRATS:
            r = roi(sub, s)
            if r: res.append((r[1], cb, s, r[0], r[2]))
    res.sort(reverse=True)
    print(f"{'rang':>5}{'ROI 2025':>10}{'n':>7}  {'stratégie':<16}{'filtre'}")
    print('-' * 88)
    for i, (r, cb, s, n, se) in enumerate(res[:12], 1):
        print(f"{i:>5}{r:>9.1f}%{n:>7}  {s:<16}{' + '.join(cb)}")
    print(f"\n{'':>5}{'ROI 2025':>10}{'ROI 2022-2024':>15}{'± SE':>7}{'':>3}{'stratégie':<16}{'filtre'}")
    print('-' * 96)
    for r, cb, s, n, se in res[:8]:
        sub = [c for c in TEST if all(F[k](c) for k in cb)]
        t = roi(sub, s)
        if not t: print(f"{'':>5}{r:>9.1f}%{'trop peu':>15}{'':>10}{s:<16}{' + '.join(cb)}"); continue
        print(f"{'':>5}{r:>9.1f}%{t[1]:>14.1f}%{t[2]:>7.1f}{'':>3}{s:<16}{' + '.join(cb)}   (n={t[0]})")
