#!/usr/bin/env python3
"""
ROI réel de stratégies de pari, tous types confondus.

    python3 bench/strategies.py            # tout ce qui est collecté
    python3 bench/strategies.py 2025-0     # un préfixe de mois

Croise data/histo/ (cotes, arrivées, leviers) et data/rapports/ (dividendes
définitifs PMU). Chaque stratégie = une règle de sélection + un type de pari.
Le ROI est calculé sur les VRAIS dividendes, pas déduit des cotes gagnant.

Convention : mise 1 € par combinaison jouée. dividendePourUnEuro est en
centimes, donc retour = div/100 par euro misé sur la combinaison gagnante.
"""
import json, glob, math, re, sys
from itertools import combinations

def musique(m):
    if not m: return 50.0
    pos = re.findall(r'(\d+|[DRT])[a-z]', re.sub(r'\(\d+\)', '', m))
    if len(pos) < 2: return 50.0
    l = [12 if v in 'DRT' else (12 if int(v) == 0 else int(v)) for v in pos[:5]]
    s = w = 0.0
    for i, ps in enumerate(l):
        wt = (len(l) - i) / len(l)
        v = 100 if ps == 1 else 80 if ps == 2 else 65 if ps == 3 else 45 if ps <= 5 else 25 if ps <= 8 else 10
        s += v * wt; w += wt
    return s / w

def charge(pref=""):
    rap = {}
    for f in sorted(glob.glob('data/rapports/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); rap[(d['date'], d['r'], d['c'])] = d['paris']
    out = []
    for f in sorted(glob.glob('data/histo/*.jsonl')):
        if pref and pref not in f: continue
        for l in open(f, encoding='utf-8'):
            r = json.loads(l)
            k = (r['date'], r['r'], r['c'])
            if k not in rap: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 5: continue
            for p in ps:
                nc = p.get('nc') or 0; nv = p.get('nv') or 0; npl = p.get('np') or 0
                cr = p.get('cr') or 0
                p['F'] = {
                    'cote':        -p['c'],
                    'dérive':      (cr - p['c']) / cr * 100 if cr > 1 else 0.0,
                    'Valeur FG':   (p.get('p') or 0) / 10 or 50.0,
                    'Musique':     musique(p.get('m')),
                    'TauxV indiv': nv / nc * 100 if nc >= 2 else 8.0,
                    'TauxP indiv': npl / nc * 100 if nc >= 2 else 30.0,
                    'Gains':       math.log10((p.get('g') or 0) + 1),
                }
            out.append({'ps': sorted(ps, key=lambda p: p['c']), 'paris': rap[k], 'd': r['date']})
    return out

def div(paris, type_, comb):
    """Dividende (en € pour 1 € misé) si `comb` (set de n° en str) gagne, sinon 0."""
    for r in paris.get(type_, []):
        c = r['comb']
        if 'NP' in c: continue
        if set(c.split('-')) == comb:
            return (r['div'] or 0) / 100.0
    return 0.0

def stats(gains, mises):
    n = len(gains)
    roi = (sum(gains) / mises - 1) * 100 if mises else 0
    par_pari = [g - (mises / n) for g in gains]
    se = (sum((x - sum(par_pari)/n)**2 for x in par_pari)/n)**0.5 / math.sqrt(n) / (mises/n) * 100 if n else 0
    return n, sum(1 for g in gains if g > 0) / n * 100, roi, se

def joue(cs, nom, selecteur, type_, taille):
    """selecteur(course) -> liste ordonnée de chevaux ; on joue toutes les
    combinaisons de `taille` parmi les `k` premiers retournés."""
    gains, mises = [], 0.0
    for c in cs:
        sel = selecteur(c)
        if not sel or len(sel) < taille: continue
        combos = list(combinations([str(p['n']) for p in sel], taille))
        g = 0.0
        for cb in combos:
            g += div(c['paris'], type_, set(cb))
        gains.append(g); mises += len(combos)
    if not gains: return None
    return (nom,) + stats(gains, mises)

if __name__ == '__main__':
    pref = sys.argv[1] if len(sys.argv) > 1 else ""
    CS = charge(pref)
    print(f"\n{len(CS)} courses avec rapports définitifs\n")
    par_marche = lambda k: (lambda c: c['ps'][:k])
    def par_levier(F, k, pool=4):
        return lambda c: sorted(c['ps'][:pool], key=lambda p: -p['F'][F])[:k]
    LEV = ['dérive', 'Valeur FG', 'Musique', 'TauxV indiv', 'TauxP indiv', 'Gains']

    PLANS = [
        ("SIMPLE GAGNANT",  'E_SIMPLE_GAGNANT', 1,
            [("favori", par_marche(1))] + [(f"top-4 → max {F}", par_levier(F,1)) for F in LEV]),
        ("COUPLÉ GAGNANT",  'E_COUPLE_GAGNANT', 2,
            [("top-2 marché", par_marche(2)), ("top-3 marché (3 combis)", par_marche(3))]
            + [(f"top-4 → 2 meilleurs {F}", par_levier(F,2)) for F in LEV]),
        ("TRIO",            'E_TRIO', 3,
            [("top-3 marché", par_marche(3)), ("top-4 marché (4 combis)", par_marche(4))]
            + [(f"top-5 → 3 meilleurs {F}", par_levier(F,3,5)) for F in LEV]),
    ]
    for titre, type_, taille, variantes in PLANS:
        print(f"── {titre} " + "─"*(56-len(titre)))
        print(f"{'stratégie':>28}{'courses':>9}{'touche':>9}{'ROI':>9}{'± SE':>7}")
        res = [joue(CS, n, s, type_, taille) for n, s in variantes]
        for r in sorted([x for x in res if x], key=lambda x: -x[3]):
            print(f"{r[0]:>28}{r[1]:>9}{r[2]:>8.1f}%{r[3]:>8.1f}%{r[4]:>7.1f}")
        print()
