#!/usr/bin/env python3
"""Les combinés par type de course, sur la base de Benoit : depuis le 16/04/2026.

Pour chaque type de course (catégorie, distance, taille du champ), sur les
hippodromes premium puis toute la France : simple gagnant sur le favori,
couplé gagnant / placé favori + 2e, trio des 3 premiers du marché, 2 sur 4.
Dividendes réels. Cinq mois : lire les directions, pas les décimales.

    python3 bench/combines_par_type.py [PREMIUM|TOUS] [depuis=2026-04-16]
"""
import json, glob, sys, math, itertools, collections
import numpy as np
UNIV = (sys.argv[1] if len(sys.argv) > 1 else 'PREMIUM').upper()
DEPUIS = next((a.split('=')[1] for a in sys.argv if a.startswith('depuis=')), '2026-04-16')
PREMIUM = {'PARISLONGCHAMP', 'SAINT-CLOUD', 'CHANTILLY', 'DEAUVILLE', 'FONTAINEBLEAU', 'LYON-PARILLY'}
rap = {}
for f in glob.glob('data/rapports/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rap[(d['date'], d['hip'], d['r'], d['c'])] = d['paris']
courses = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT' or d['date'] < DEPUIS: continue
        hip = (d['hip'] or '').upper()
        if UNIV == 'PREMIUM' and hip not in PREMIUM: continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 8 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        r = rap.get((d['date'], d['hip'], d['r'], d['c'])) or {}
        if not r.get('E_SIMPLE_GAGNANT'): continue
        d['ps'] = sorted(ps, key=lambda p: p['c'])
        d['sg'] = {x['comb']: x['div'] / 100 for x in r.get('E_SIMPLE_GAGNANT', [])}
        d['cg'] = {frozenset(x['comb'].split('-')): x['div'] / 100 for x in r.get('E_COUPLE_GAGNANT', [])}
        d['cp'] = {frozenset(x['comb'].split('-')): x['div'] / 100 for x in r.get('E_COUPLE_PLACE', [])}
        d['trio'] = {frozenset(x['comb'].split('-')): x['div'] / 100 for x in r.get('E_TRIO', [])}
        d['d24'] = {frozenset(x['comb'].split('-')): x['div'] / 100 for x in r.get('E_DEUX_SUR_QUATRE', [])}
        txt = ((d.get('cat') or '') + ' ' + (d.get('lib') or '')).upper(); dist = d.get('dist') or 0; n = len(ps)
        d['type'] = 'handicap' if 'HANDICAP' in txt else 'réclamer' if 'RECLAMER' in txt else 'groupe/listed' if any(k in txt for k in ('GROUPE', 'LISTED', 'GR.')) else 'inédits/maiden' if any(k in txt for k in ('INEDIT', 'MAIDEN', 'JAMAIS COURU')) else 'conditions'
        d['dist'] = 'sprint <1400' if dist < 1400 else 'mile 1400-1900' if dist < 1900 else 'intermédiaire 1900-2400' if dist < 2400 else 'tenue 2400+'
        d['champ'] = '8-9' if n <= 9 else '10-13' if n <= 13 else '14+'
        d['ouv'] = 'favori < 4' if d['ps'][0]['c'] < 4 else 'favori ≥ 4'
        courses.append(d)
print(f"{UNIV}, depuis le {DEPUIS} : {len(courses)} courses de 8 partants et plus avec rapports\n")
def g_sg(c): p = c['ps'][0]; return (c['sg'].get(str(p['n']), p['c']) - 1) if p.get('a') == 1 else -1.0
def g_c(c, table, i=0, j=1): return c[table].get(frozenset([str(c['ps'][i]['n']), str(c['ps'][j]['n'])]), 0.0) - 1
def g_trio(c): return c['trio'].get(frozenset(str(c['ps'][i]['n']) for i in range(3)), 0.0) - 1 if c['trio'] else None
def g_24(c): return c['d24'].get(frozenset([str(c['ps'][0]['n']), str(c['ps'][1]['n'])]), 0.0) - 1 if c['d24'] else None
PARIS = [('favori simple gagnant', g_sg), ('couplé gagnant fav+2e', lambda c: g_c(c, 'cg')), ('couplé placé fav+2e', lambda c: g_c(c, 'cp')), ('trio 3 premiers', g_trio), ('2 sur 4 fav+2e', g_24)]
def cell(vals):
    v = [x for x in vals if x is not None]
    if len(v) < 15: return f"{'—':>16s}"
    a = np.array(v); return f"{100*a.mean():+6.1f} ±{100*a.std(ddof=1)/math.sqrt(len(a)):4.0f}"
for cle, lib in [('type', 'catégorie'), ('champ', 'taille du champ'), ('ouv', 'ouverture'), ('dist', 'distance')]:
    groupes = collections.defaultdict(list)
    for c in courses: groupes[c[cle]].append(c)
    print(f"══ par {lib}".ljust(28) + ''.join(f"{p[0]:>22s}" for p in PARIS))
    for k, cs in sorted(groupes.items(), key=lambda kv: -len(kv[1])):
        print(f"   {k:<22s} n={len(cs):3d}" + ''.join(f"{cell([fn(c) for c in cs]):>22s}" for _, fn in PARIS))
    print()

# ── croisement taille du champ × distance ──────────────────────────────
print("══ taille du champ × distance".ljust(36) + ''.join(f"{p[0]:>22s}" for p in PARIS))
for champ in ['8-9', '10-13', '14+']:
    for dist in ['sprint <1400', 'mile 1400-1900', 'intermédiaire 1900-2400', 'tenue 2400+']:
        cs = [c for c in courses if c['champ'] == champ and c['dist'] == dist]
        if len(cs) < 15: continue
        print(f"   {champ:<6s} {dist:<24s} n={len(cs):3d}" + ''.join(f"{cell([fn(c) for c in cs]):>22s}" for _, fn in PARIS))
    print()
