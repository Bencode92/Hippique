#!/usr/bin/env python3
"""Le couplé « quand on doute », à Longchamp — dividendes réels 2022-2026.

Couplé gagnant : les 2 chevaux finissent 1er et 2e (ordre indifférent).
Couplé placé  : les 2 chevaux dans les 3 premiers (8 partants et plus).
Combinaisons naturelles du joueur qui hésite : favori + 2e favori,
favori + 3e, favori avec chacun des 3 suivants (3 tickets), tous les couples
des 3 ou 4 premiers du marché (3 ou 6 tickets). Mise 1 € par ticket.

    python3 bench/longchamp_couple.py [HIPPODROME|TOUS]
"""
import json, glob, sys, math, itertools
import numpy as np
HIP = (sys.argv[1] if len(sys.argv) > 1 else 'PARISLONGCHAMP').upper()
rap = {}
for f in glob.glob('data/rapports/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rap[(d['date'], d['hip'], d['r'], d['c'])] = d['paris']
courses = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        if HIP != 'TOUS' and (d['hip'] or '').upper() != HIP: continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 8 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        r = rap.get((d['date'], d['hip'], d['r'], d['c'])) or {}
        if not r.get('E_COUPLE_GAGNANT'): continue
        d['ps'] = sorted(ps, key=lambda p: p['c'])
        d['cg'] = {frozenset(x['comb'].split('-')): x['div'] / 100 for x in r.get('E_COUPLE_GAGNANT', [])}
        d['cp'] = {frozenset(x['comb'].split('-')): x['div'] / 100 for x in r.get('E_COUPLE_PLACE', [])}
        d['sg'] = {x['comb']: x['div'] / 100 for x in r.get('E_SIMPLE_GAGNANT', [])}
        courses.append(d)
print(f"{HIP} : {len(courses)} courses de 8 partants et plus avec rapports couplé, {courses[0]['date']} → {courses[-1]['date']}\n")

def gain_couple(c, i, j, table):
    k = frozenset([str(c['ps'][i]['n']), str(c['ps'][j]['n'])])
    return c[table].get(k, 0.0) - 1
def gain_simple(c, i):
    p = c['ps'][i]; return (c['sg'].get(str(p['n']), p['c']) - 1) if p.get('a') == 1 else -1.0
def ligne(lib, gains, tickets=1):
    g = np.array(gains)
    print(f"   {lib:48s} ROI {100*g.mean():+6.1f} % ± {100*g.std(ddof=1)/math.sqrt(len(g)):4.1f}   n={len(g):5d} tickets   touche {100*np.mean(g>0):4.1f} %")
derive = lambda p: p.get('cr') and p['c'] < p['cr']
grand = lambda c: len(c['ps']) >= 14

for table, nom in [('cg', 'COUPLÉ GAGNANT'), ('cp', 'COUPLÉ PLACÉ')]:
    print(f"══ {nom}")
    ligne('favori + 2e favori', [gain_couple(c, 0, 1, table) for c in courses])
    ligne('favori + 3e favori', [gain_couple(c, 0, 2, table) for c in courses])
    ligne('2e + 3e favoris', [gain_couple(c, 1, 2, table) for c in courses])
    ligne('favori avec chacun des 3 suivants (3 tickets)', [gain_couple(c, 0, j, table) for c in courses for j in (1, 2, 3)])
    ligne('tous les couples des 3 premiers (3 tickets)', [gain_couple(c, i, j, table) for c in courses for i, j in itertools.combinations(range(3), 2)])
    ligne('tous les couples des 4 premiers (6 tickets)', [gain_couple(c, i, j, table) for c in courses for i, j in itertools.combinations(range(4), 2)])
    ligne('favori + 2e, grands champs (14+)', [gain_couple(c, 0, 1, table) for c in courses if grand(c)])
    ligne('favori + 2e, favori dont la cote a baissé', [gain_couple(c, 0, 1, table) for c in courses if derive(c['ps'][0])])
    ligne('favori + 2e, les deux cotes ont baissé', [gain_couple(c, 0, 1, table) for c in courses if derive(c['ps'][0]) and derive(c['ps'][1])])
    ligne('favori + 1 outsider 10-20 (1 ticket par outsider)', [gain_couple(c, 0, j, table) for c in courses for j in range(1, len(c['ps'])) if 10 <= c['ps'][j]['c'] < 20])
    print()
print("══ RÉFÉRENCE, simple gagnant sur les mêmes courses")
ligne('favori', [gain_simple(c, 0) for c in courses])
ligne('favori, grands champs (14+)', [gain_simple(c, 0) for c in courses if grand(c)])
ligne('favori dont la cote a baissé', [gain_simple(c, 0) for c in courses if derive(c['ps'][0])])
