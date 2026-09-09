#!/usr/bin/env python3
"""
ROI réel par type de pari GAGNANT, discipline train/test (S1 2025 → S2 2025).

    python3 bench/paris_gagnants.py

Types couverts, avec la bonne comptabilité de mise :
  SIMPLE GAGNANT   1 cheval, doit gagner
  COUPLÉ GAGNANT   2 chevaux, les 2 premiers dans le désordre
  TRIO             3 chevaux, les 3 premiers dans le désordre
  2 SUR 4          2 chevaux, tous deux dans les 4 premiers
  MULTI en N       N chevaux (4→7), les 4 premiers tous dedans

dividendePourUnEuro est rapporté À LA MISE du pari : pour le Multi en 5, qui
coûte 5 fois le Multi en 4, le dividende par euro est divisé d'autant. On
raisonne donc partout en « 1 € misé » et le ROI est directement comparable.

Le SUPER 4 et le TIERCÉ sont exclus : ils se jouent dans l'ordre exact, donc
une sélection de k chevaux coûte k! combinaisons — mon évaluateur ne paie
qu'une mise et gonflerait le ROI d'un facteur 6 à 24.
"""
import json, glob, math, re
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

def charge():
    rap = {}
    for f in sorted(glob.glob('data/rapports/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); rap[(d['date'], d['r'], d['c'])] = d['paris']
    cs = []
    for f in sorted(glob.glob('data/histo/2025-*.jsonl')):
        for l in open(f, encoding='utf-8'):
            r = json.loads(l); k = (r['date'], r['r'], r['c'])
            if k not in rap: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 8: continue
            for p in ps:
                nc = p.get('nc') or 0; nv = p.get('nv') or 0; npl = p.get('np') or 0
                cr = p.get('cr') or 0
                p['F'] = {'dérive': (cr - p['c']) / cr * 100 if cr > 1 else 0.0,
                          'Valeur FG': (p.get('p') or 0) / 10 or 50.0,
                          'Musique': musique(p.get('m')),
                          'TauxV indiv': nv / nc * 100 if nc >= 2 else 8.0,
                          'TauxP indiv': npl / nc * 100 if nc >= 2 else 30.0,
                          'Gains': math.log10((p.get('g') or 0) + 1)}
            cs.append({'ps': sorted(ps, key=lambda p: p['c']), 'paris': rap[k], 'd': r['date']})
    return cs

def gain_desordre(paris, t, sel):
    """Paris où la combinaison gagnante doit être EXACTEMENT la sélection."""
    s = {str(p['n']) for p in sel}
    for r in paris.get(t, []):
        c = r['comb']
        if 'NP' in c: continue
        if set(c.split('-')) == s: return (r['div'] or 0) / 100.0
    return 0.0

def gain_2sur4(paris, sel):
    """La liste des rapports énumère toutes les paires gagnantes (les 6 paires
    des 4 premiers). On gagne si notre paire y figure."""
    s = {str(p['n']) for p in sel}
    for r in paris.get('E_DEUX_SUR_QUATRE', []):
        c = r['comb']
        if 'NP' in c: continue
        if set(c.split('-')) == s: return (r['div'] or 0) / 100.0
    return 0.0

def gain_multi(paris, sel, n):
    """Multi « en n » : les 4 premiers doivent tous être dans la sélection.

    Le libellé n'ayant pas été collecté, on retrouve le palier par le dividende :
    le total reversé est constant et la mise vaut 3€ × C(N,4), donc le dividende
    par euro décroît strictement avec N. Trié en décroissant, le i-ème rapport
    correspond au palier « en 4+i ». Ratios observés 5 et 3 = C(5,4)/C(4,4) et
    C(6,4)/C(5,4) — la mécanique est confirmée par les données.
    """
    s = {str(p['n']) for p in sel}
    for t in ('E_MINI_MULTI', 'E_MULTI'):
        rs = [r for r in paris.get(t, []) if r['comb'] and 'NP' not in r['comb'] and r.get('div')]
        if not rs: continue
        rs.sort(key=lambda r: -r['div'])
        i = n - 4
        if i < 0 or i >= len(rs): continue
        r = rs[i]
        if set(r['comb'].split('-')) <= s: return r['div'] / 100.0
        return 0.0
    return 0.0

def stats(g):
    n = len(g)
    if n < 60: return None
    roi = (sum(g) / n - 1) * 100
    mu = sum(g) / n
    se = (sum((x - mu) ** 2 for x in g) / n) ** 0.5 / math.sqrt(n) * 100
    return n, sum(1 for x in g if x > 0) / n * 100, roi, se

if __name__ == '__main__':
    CS = charge()
    A = [c for c in CS if c['d'] < '2025-07-01']; B = [c for c in CS if c['d'] >= '2025-07-01']
    print(f"\nS1 {len(A)} courses  |  S2 {len(B)} courses   (>= 8 partants, rapports dispo)\n")
    LEV = ['dérive', 'Valeur FG', 'Musique', 'TauxV indiv', 'TauxP indiv', 'Gains']
    marche = lambda k: (lambda c: c['ps'][:k])
    lev = lambda F, k, pool: (lambda c: sorted(c['ps'][:pool], key=lambda p: -p['F'][F])[:k])

    PLANS = [
        ('SIMPLE GAGNANT', lambda c, s: gain_desordre(c['paris'], 'E_SIMPLE_GAGNANT', s), 1, 4),
        ('COUPLÉ GAGNANT', lambda c, s: gain_desordre(c['paris'], 'E_COUPLE_GAGNANT', s), 2, 4),
        ('TRIO',           lambda c, s: gain_desordre(c['paris'], 'E_TRIO', s), 3, 5),
        ('2 SUR 4',        lambda c, s: gain_2sur4(c['paris'], s), 2, 5),
        ('MULTI EN 4',     lambda c, s: gain_multi(c['paris'], s, 4), 4, 6),
        ('MULTI EN 5',     lambda c, s: gain_multi(c['paris'], s, 5), 5, 7),
        ('MULTI EN 6',     lambda c, s: gain_multi(c['paris'], s, 6), 6, 8),
    ]
    for titre, payer, taille, pool in PLANS:
        variantes = [(f'top-{taille} marché', marche(taille))] + \
                    [(f'top-{pool} → {taille} max {F}', lev(F, taille, pool)) for F in LEV]
        lignes = []
        for nom, sel in variantes:
            ga = [payer(c, sel(c)) for c in A if len(sel(c)) == taille]
            gb = [payer(c, sel(c)) for c in B if len(sel(c)) == taille]
            sa, sb = stats(ga), stats(gb)
            if sa and sb: lignes.append((sb[2], nom, sa[2], sa[3], sb[2], sb[3], sb[1]))
        if not lignes: continue
        print(f"── {titre} " + "─" * (70 - len(titre)))
        print(f"{'stratégie':>26}{'S1 ROI':>10}{'± SE':>7}   {'S2 ROI':>9}{'± SE':>7}{'S2 touche':>11}")
        for _, nom, a2, a3, b2, b3, b1 in sorted(lignes, reverse=True):
            print(f"{nom:>26}{a2:>9.1f}%{a3:>7.1f}   {b2:>8.1f}%{b3:>7.1f}{b1:>10.1f}%")
        print()
