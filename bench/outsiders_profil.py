#!/usr/bin/env python3
"""Où les non-favoris gagnent-ils plus souvent que leur cote ne le promet ?

Chevaux à cote 5 → 30 qui ne sont PAS le favori. Pour chaque segment :
chevaux, gagnants, proba réelle / proba promise (1/cote), ROI réel (dividende
PMU). Un segment « qui revient » est un segment où réel/promis dépasse
nettement la moyenne de la zone (≈ 0,83) — pas un segment où il y a
« beaucoup de gagnants » (il y en a partout, c'est le nombre de chevaux qui
change). FR plat 2022-2026.

    python3 bench/outsiders_profil.py [HIPPODROME|TOUS] [cote_min cote_max]
"""
import json, glob, sys, math, collections
import numpy as np
HIP = (sys.argv[1] if len(sys.argv) > 1 else 'TOUS').upper()
LO, HI = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (5.0, 30.0)
rap = {}
for f in glob.glob('data/rapports/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rap[(d['date'], d['hip'], d['r'], d['c'])] = {x['comb']: x['div'] / 100 for x in d['paris'].get('E_SIMPLE_GAGNANT', [])}
R = []
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
        fav = min(p['c'] for p in ps); n = len(ps); dist = d.get('dist') or 0
        txt = ((d.get('cat') or '') + ' ' + (d.get('lib') or '')).upper()
        cat = 'handicap' if 'HANDICAP' in txt else 'réclamer' if 'RECLAMER' in txt else 'groupe/listed' if any(k in txt for k in ('GROUPE', 'LISTED', 'GR.', 'GROUP')) else 'inédits/maiden' if any(k in txt for k in ('INEDIT', 'MAIDEN', 'JAMAIS COURU')) else 'conditions'
        for p in ps:
            if p['c'] == fav or not (LO <= p['c'] < HI): continue
            win = p.get('a') == 1
            mus = p.get('m') or ''
            der = (p['c'] - p['cr']) / p['cr'] if p.get('cr') and p['cr'] > 1 else None
            R.append(dict(
                date=d['date'], c=p['c'], win=win, gain=(sg.get(str(p['n']), p['c']) - 1) if win else -1.0,
                seg=dict(
                    distance='sprint <1400' if dist < 1400 else 'mile 1400-1900' if dist < 1900 else 'intermédiaire 1900-2400' if dist < 2400 else 'tenue 2400+',
                    partants='5-9' if n <= 9 else '10-13' if n <= 13 else '14-17' if n <= 17 else '18+',
                    catégorie=cat,
                    âge=str(p.get('ag')) if p.get('ag') and p['ag'] <= 6 else '7+',
                    sexe=p.get('sx') or '?',
                    dérive='baisse forte (−20 %+)' if der is not None and der <= -0.2 else 'baisse' if der is not None and der < -0.05 else 'stable' if der is not None and der <= 0.05 else 'hausse' if der is not None and der <= 0.3 else 'hausse forte (+30 %+)' if der is not None else 'inconnue',
                    corde='intérieur (1-3)' if (p.get('co') or 0) in (1, 2, 3) else 'extérieur (≥ 12)' if (p.get('co') or 0) >= 12 else 'milieu',
                    expérience='inédit' if not p.get('nc') else '1-3 courses' if p['nc'] <= 3 else '4-10' if p['nc'] <= 10 else '11+',
                    dernière=('gagné' if mus.startswith('1') else 'placé 2-3' if mus[:1] in '23' else '4-5' if mus[:1] in '45' else 'battu loin' if mus[:1].isdigit() else 'autre/inconnue') if mus else 'inconnue',
                    mois=d['date'][5:7], hippodrome=(d['hip'] or '?').upper(), jockey=p.get('jk') or '?', entraîneur=p.get('en') or '?',
                    allocation='< 20 k€' if (d.get('alloc') or 0) < 20000 else '20-40 k€' if (d.get('alloc') or 0) < 40000 else '40 k€+',
                    tranche='5-8' if p['c'] < 8 else '8-12' if p['c'] < 12 else '12-20' if p['c'] < 20 else '20-30',
                )))
n = len(R); wins = sum(r['win'] for r in R); prom = sum(1 / r['c'] for r in R)
print(f"{HIP}, non-favoris à cote {LO:g}-{HI:g} : {n} chevaux, {wins} gagnants, réel/promis global {wins/prom:.2f}, ROI {100*np.mean([r['gain'] for r in R]):+.1f} %\n")
def table(cle, nmin, top=None):
    g = collections.defaultdict(list)
    for r in R: g[r['seg'][cle]].append(r)
    lignes = []
    for k, rs in g.items():
        if len(rs) < nmin: continue
        w = sum(r['win'] for r in rs); pr = sum(1 / r['c'] for r in rs); ga = np.array([r['gain'] for r in rs])
        se_ratio = math.sqrt(w) / pr if w else 0
        lignes.append((w / pr, k, len(rs), w, ga.mean(), ga.std(ddof=1) / math.sqrt(len(rs)), se_ratio))
    lignes.sort(reverse=True)
    if top: lignes = lignes[:top]
    print(f"── {cle}")
    for ratio, k, nn, w, roi, se, ser in lignes:
        flag = ' ◄' if ratio - 1.96 * ser > 0.83 and nn >= nmin else ''
        print(f"   {str(k):26s} {nn:6d} chevaux {w:5d} gagn.  réel/promis {ratio:.2f} ± {ser:.2f}   ROI {100*roi:+6.1f} % ± {100*se:4.1f}{flag}")
for cle, nmin in [('tranche', 500), ('distance', 500), ('partants', 500), ('catégorie', 500), ('allocation', 500), ('âge', 500), ('sexe', 500), ('dérive', 500), ('corde', 500), ('expérience', 500), ('dernière', 500), ('mois', 500)]:
    table(cle, nmin)
print("\n(◄ = réel/promis significativement au-dessus de la moyenne de la zone, à 2 erreurs-types)\n")
table('hippodrome', 800, top=12)
table('jockey', 400, top=15)
table('entraîneur', 300, top=15)

# ── les critères qui ressortent, croisés (déclarés ici, pas cherchés) ──────
print("\n══ croisements des critères ressortis (âge 5-6, baisse forte, corde extérieure, dernière battu loin)")
def sel(lib, f):
    rs = [r for r in R if f(r['seg'])]
    if len(rs) < 200: print(f"   {lib:60s} n={len(rs)} (trop peu)"); return
    w = sum(r['win'] for r in rs); pr = sum(1 / r['c'] for r in rs); ga = np.array([r['gain'] for r in rs])
    print(f"   {lib:60s} {len(rs):6d} chevaux  réel/promis {w/pr:.2f} ± {math.sqrt(w)/pr:.2f}   ROI {100*ga.mean():+6.1f} % ± {100*ga.std(ddof=1)/math.sqrt(len(rs)):4.1f}")
a56 = lambda s: s['âge'] in ('5', '6'); bf = lambda s: s['dérive'] == 'baisse forte (−20 %+)'; ext = lambda s: s['corde'] == 'extérieur (≥ 12)'; bl = lambda s: s['dernière'] == 'battu loin'
sel('âge 5-6 ET baisse forte', lambda s: a56(s) and bf(s))
sel('âge 5-6 ET baisse forte ET dernière battu loin', lambda s: a56(s) and bf(s) and bl(s))
sel('âge 5-6 ET corde extérieure', lambda s: a56(s) and ext(s))
sel('baisse forte ET corde extérieure', lambda s: bf(s) and ext(s))
sel('âge 5-6 ET baisse forte ET corde extérieure', lambda s: a56(s) and bf(s) and ext(s))
sel('les quatre à la fois', lambda s: a56(s) and bf(s) and ext(s) and bl(s))
sel('âge 5-6, baisse forte, handicap', lambda s: a56(s) and bf(s) and s['catégorie'] == 'handicap')
sel('âge 5-6, baisse forte, cote 5-8', lambda s: a56(s) and bf(s) and s['tranche'] == '5-8')
sel('âge 5-6, baisse forte, cote 12-30', lambda s: a56(s) and bf(s) and s['tranche'] in ('12-20', '20-30'))

# ── tenue dans le temps : les mêmes croisements, 2022-2024 puis 2025-2026 ─
print("\n══ les mêmes croisements, par période (2022-2024 = où on a regardé ; 2025-2026 = contrôle)")
def sel2(lib, f):
    for per, fp in [('2022-24', lambda d: d < '2025'), ('2025-26', lambda d: d >= '2025')]:
        rs = [r for r in R if f(r['seg']) and fp(r['date'])]
        if len(rs) < 150: print(f"   {lib:52s} {per}  n={len(rs)} (trop peu)"); continue
        w = sum(r['win'] for r in rs); pr = sum(1 / r['c'] for r in rs); ga = np.array([r['gain'] for r in rs])
        print(f"   {lib:52s} {per}  {len(rs):6d} chevaux  réel/promis {w/pr:.2f} ± {math.sqrt(w)/pr:.2f}   ROI {100*ga.mean():+6.1f} % ± {100*ga.std(ddof=1)/math.sqrt(len(rs)):4.1f}")
for lib, f in [('âge 5-6 (seul)', a56), ('baisse forte (seule)', bf), ('corde extérieure (seule)', ext), ('dernière battu loin (seule)', bl),
               ('âge 5-6 ET baisse forte', lambda s: a56(s) and bf(s)), ('âge 5-6 ET corde extérieure', lambda s: a56(s) and ext(s)),
               ('baisse forte ET corde extérieure', lambda s: bf(s) and ext(s)), ('âge 5-6 ET baisse forte ET corde extérieure', lambda s: a56(s) and bf(s) and ext(s)),
               ('les quatre à la fois', lambda s: a56(s) and bf(s) and ext(s) and bl(s))]:
    sel2(lib, f)
