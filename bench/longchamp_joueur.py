#!/usr/bin/env python3
"""Le joueur à Longchamp : quand le favori, quand pas, et les outsiders.

data/histo + data/rapports (dividendes réels, simple gagnant et simple placé),
FR plat, 2022 → 2026. Mise plate 1 €. Chaque case donne ROI ± erreur-type et n.
Rien n'est optimisé ici : ce sont les découpes naturelles du joueur (taille du
champ, cote du favori, dérive, catégorie), lues telles quelles.

    python3 bench/longchamp_joueur.py                 # ParisLongchamp
    python3 bench/longchamp_joueur.py SAINT-CLOUD     # un autre hippodrome
    python3 bench/longchamp_joueur.py TOUS
"""
import json, glob, sys, math, collections
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
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        r = rap.get((d['date'], d['hip'], d['r'], d['c'])) or {}
        divG = {x['comb']: x['div'] / 100 for x in r.get('E_SIMPLE_GAGNANT', [])}
        divP = {x['comb']: x['div'] / 100 for x in r.get('E_SIMPLE_PLACE', [])}
        d['ps'] = sorted(ps, key=lambda p: p['c']); d['divG'] = divG; d['divP'] = divP; d['inv'] = inv
        courses.append(d)
print(f"{HIP} : {len(courses)} courses, {courses[0]['date']} → {courses[-1]['date']}, dividendes réels sur {sum(1 for c in courses if c['divG'])} courses\n")

def gain_g(c, p):  # simple gagnant, mise 1 €, dividende réel sinon cote
    if p.get('a') != 1: return -1.0
    return (c['divG'].get(str(p['n'])) or p['c']) - 1
def gain_p(c, p):  # simple placé (top 3 si 8+ partants, top 2 sinon)
    n = len(c['ps']); k = 3 if n >= 8 else 2
    if not p.get('a') or p['a'] > k: return -1.0
    dv = c['divP'].get(str(p['n']))
    if dv is None: return None
    return dv - 1
def ligne(lib, gains):
    g = np.array([x for x in gains if x is not None])
    if len(g) < 20: print(f"   {lib:46s} n={len(g)} (trop peu)"); return
    print(f"   {lib:46s} ROI {100*g.mean():+6.1f} % ± {100*g.std(ddof=1)/math.sqrt(len(g)):4.1f}   n={len(g):5d}   touche {100*np.mean(g>0):4.1f} %")

fav = lambda c: c['ps'][0]
champ = lambda c: '5-9 partants' if len(c['ps']) <= 9 else '10-13 partants' if len(c['ps']) <= 13 else '14 partants et plus'
tranche = lambda x: 'cote < 2,5' if x < 2.5 else 'cote 2,5-4' if x < 4 else 'cote 4-6' if x < 6 else 'cote 6 et plus'
derive = lambda p: 'cote a baissé' if p.get('cr') and p['c'] < p['cr'] else 'cote a monté' if p.get('cr') and p['c'] > p['cr'] else 'stable/inconnu'
cat = lambda c: 'handicap' if 'HANDICAP' in ((c.get('cat') or '') + (c.get('lib') or '')).upper() else 'réclamer' if 'RECLAMER' in ((c.get('cat') or '') + (c.get('lib') or '')).upper() else 'conditions / groupes'

print("══ LE FAVORI, simple gagnant")
ligne('toutes courses', [gain_g(c, fav(c)) for c in courses])
for k in ['5-9 partants', '10-13 partants', '14 partants et plus']: ligne(k, [gain_g(c, fav(c)) for c in courses if champ(c) == k])
for k in ['cote < 2,5', 'cote 2,5-4', 'cote 4-6', 'cote 6 et plus']: ligne('favori ' + k, [gain_g(c, fav(c)) for c in courses if tranche(fav(c)['c']) == k])
for k in ['cote a baissé', 'cote a monté']: ligne('favori dont la ' + k, [gain_g(c, fav(c)) for c in courses if derive(fav(c)) == k])
for k in ['handicap', 'réclamer', 'conditions / groupes']: ligne(k, [gain_g(c, fav(c)) for c in courses if cat(c) == k])
print("   — croisements —")
for k in ['5-9 partants', '10-13 partants', '14 partants et plus']:
    for dv in ['cote a baissé', 'cote a monté']: ligne(f'{k}, {dv}', [gain_g(c, fav(c)) for c in courses if champ(c) == k and derive(fav(c)) == dv])
for an in ['2022', '2023', '2024', '2025', '2026']: ligne(f'année {an}', [gain_g(c, fav(c)) for c in courses if c['date'].startswith(an)])

print("\n══ LE FAVORI, simple placé (dividendes réels seulement)")
ligne('toutes courses', [gain_p(c, fav(c)) for c in courses])
for k in ['5-9 partants', '10-13 partants', '14 partants et plus']: ligne(k, [gain_p(c, fav(c)) for c in courses if champ(c) == k])
for k in ['cote a baissé', 'cote a monté']: ligne('favori dont la ' + k, [gain_p(c, fav(c)) for c in courses if derive(fav(c)) == k])

print("\n══ LE 2e ET LE 3e DU MARCHÉ, simple gagnant")
ligne('2e favori', [gain_g(c, c['ps'][1]) for c in courses])
ligne('3e favori', [gain_g(c, c['ps'][2]) for c in courses])
ligne('2e favori, 14 partants et plus', [gain_g(c, c['ps'][1]) for c in courses if champ(c) == '14 partants et plus'])

print("\n══ LES OUTSIDERS, simple gagnant (un pari par cheval de la tranche)")
for lo, hi in [(6, 10), (10, 20), (20, 50), (50, 999)]:
    sel = [gain_g(c, p) for c in courses for p in c['ps'] if lo <= p['c'] < hi]
    ligne(f'cote {lo}-{hi if hi < 999 else "+"}', sel)
    ligne(f'   dont cote a baissé', [gain_g(c, p) for c in courses for p in c['ps'] if lo <= p['c'] < hi and derive(p) == 'cote a baissé'])
print("\n══ LES OUTSIDERS, simple placé")
for lo, hi in [(6, 10), (10, 20), (20, 50)]:
    ligne(f'cote {lo}-{hi}', [gain_p(c, p) for c in courses for p in c['ps'] if lo <= p['c'] < hi])
    ligne(f'   dont cote a baissé', [gain_p(c, p) for c in courses for p in c['ps'] if lo <= p['c'] < hi and derive(p) == 'cote a baissé'])

print("\n══ Combien de fois le gagnant est-il… (part des courses)")
n = len(courses)
for k, lib in [(1, 'le favori'), (2, 'dans les 2 premiers du marché'), (3, 'dans les 3 premiers'), (4, 'dans les 4 premiers')]:
    print(f"   {lib:46s} {100*sum(1 for c in courses if any(p.get('a') == 1 for p in c['ps'][:k]))/n:4.1f} %")
print(f"   {'à 10 contre 1 ou plus':46s} {100*sum(1 for c in courses if any(p.get('a') == 1 and p['c'] >= 10 for p in c['ps']))/n:4.1f} %")
print(f"   {'à 20 contre 1 ou plus':46s} {100*sum(1 for c in courses if any(p.get('a') == 1 and p['c'] >= 20 for p in c['ps']))/n:4.1f} %")
