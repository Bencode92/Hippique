#!/usr/bin/env python3
"""
Test n°1 de l'expert : le ratio Dr Z transposé au COUPLÉ PLACÉ.

    python3 bench/drz_couple_place.py

PROTOCOLE FIGÉ avant d'avoir les données de pools combinés en base.

Modèle de probabilité — Harville corrigé à la Henery/Stern. Harville pur
surestime les favoris en 2e et 3e position. On élève les probabilités à une
puissance λ < 1 pour les positions suivantes :
    P(1er = a)        = p_a
    P(2e = b | a)     = p_b^λ / Σ_{k≠a} p_k^λ
    P(3e = c | a,b)   = p_c^λ / Σ_{k≠a,b} p_k^λ
λ est estimé par maximum de vraisemblance sur les arrivées 2022-2023, puis
FIGÉ pour le test. Attendu autour de 0,8 en plat.

Probabilité qu'une PAIRE soit « placée » = les deux chevaux dans les 3 premiers,
soit la somme sur toutes les permutations de (i, j, k) en positions 1-2-3.

Ratio = part implicite de la paire (depuis le pool GAGNANT) / part de la paire
dans le pool COUPLÉ PLACÉ. Les deux parts sont normalisées sur le MÊME
sous-ensemble de paires — l'API ne liste que les 12 combinaisons les plus
chargées — ce qui rend le ratio sans échelle et comparable au seuil de 1,15.

Univers    : plat, 8 partants et plus, paires dont la masse CP dépasse 30 €
Seuil      : 1,15, repris du placé, non réoptimisé
Référence  : toutes les paires de l'univers, pondération égale
Découpage  : par ratio, ET par tranche de dividende théorique (l'expert prédit
             que l'edge, s'il existe, est sur les paires à 8-20 €, pas courtes)

Apprentissage 2022-2023, test 2024-2025. 2026 est gardé INTACT comme troisième
regard unique, à n'utiliser qu'une fois.

Le TRIO sert de thermomètre, pas de candidat : s'il ressort positif, c'est plus
probablement un artefact du modèle de reconstruction que de l'argent gratuit.
"""
import json, glob, math, sys
from itertools import permutations

def charge(annees):
    M, R = {}, {}
    for f in sorted(glob.glob('data/masses2/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l)
            if d['date'][:4] in annees: M[(d['date'], d['r'], d['c'])] = d['pools']
    for f in sorted(glob.glob('data/rapports/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l)
            if d['date'][:4] in annees: R[(d['date'], d['r'], d['c'])] = d['paris']
    out = []
    for f in sorted(glob.glob('data/histo/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            r = json.loads(l); k = (r['date'], r['r'], r['c'])
            if k not in M or k not in R or r['date'][:4] not in annees: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 8: continue
            pg = M[k].get('E_SIMPLE_GAGNANT') or {}
            sg = sum(pg.values())
            if sg <= 0: continue
            prob = {str(p['n']): pg[str(p['n'])] / sg for p in ps if str(p['n']) in pg}
            if len(prob) < 8: continue
            arr = {str(p['n']): p.get('a') for p in ps}
            out.append({'date': r['date'], 'p': prob, 'arr': arr,
                        'cp': M[k].get('E_COUPLE_PLACE') or {},
                        'trio': M[k].get('E_TRIO') or {},
                        'paris': R[k]})
    return out

def logL_lambda(cs, lam):
    """Vraisemblance des arrivées 1-2-3 sous le modèle de Stern."""
    tot = 0.0
    for c in cs:
        ordre = sorted([n for n, a in c['arr'].items() if a in (1, 2, 3)],
                       key=lambda n: c['arr'][n])
        # un dead heat rend plus de trois chevaux dans les trois premiers ;
        # le modèle suppose un ordre strict, on écarte ces courses
        if len(ordre) != 3 or any(n not in c['p'] for n in ordre): continue
        a, b, d = ordre
        pw = c['p']
        if pw[a] <= 0: continue
        tot += math.log(max(pw[a], 1e-12))
        rest = {n: v ** lam for n, v in pw.items() if n != a}
        s = sum(rest.values())
        if s <= 0: continue
        tot += math.log(max(rest.get(b, 1e-12) / s, 1e-12))
        rest2 = {n: v for n, v in rest.items() if n != b}
        s2 = sum(rest2.values())
        if s2 <= 0: continue
        tot += math.log(max(rest2.get(d, 1e-12) / s2, 1e-12))
    return tot

def p_paire(pw, i, j, lam):
    """P(i et j tous deux dans les 3 premiers), modèle de Stern."""
    tot = 0.0
    for k in pw:
        if k in (i, j): continue
        for o in permutations((i, j, k)):
            a, b, d = o
            r1 = {n: v ** lam for n, v in pw.items() if n != a}
            s1 = sum(r1.values())
            if s1 <= 0: continue
            r2 = {n: v for n, v in r1.items() if n != b}
            s2 = sum(r2.values())
            if s2 <= 0: continue
            tot += pw[a] * (r1.get(b, 0) / s1) * (r2.get(d, 0) / s2)
    return tot

def evalue(cs, lam, seuil=1.15, masse_min=3000):
    """masse_min en centimes (30 €). Retourne la liste des paris simulés."""
    out = []
    for c in cs:
        cp = {k: v for k, v in c['cp'].items() if v >= masse_min and '-' in k}
        if len(cp) < 4: continue
        scp = sum(cp.values())
        imp = {}
        for k in cp:
            i, j = k.split('-')
            if i not in c['p'] or j not in c['p']: continue
            imp[k] = p_paire(c['p'], i, j, lam)
        if len(imp) < 4: continue
        si = sum(imp.values())
        if si <= 0: continue
        div = {}
        for x in (c['paris'].get('E_COUPLE_PLACE') or []):
            if 'NP' in x['comb'] or not x.get('div'): continue
            div['-'.join(sorted(x['comb'].split('-')))] = x['div'] / 100.0
        for k in imp:
            part_i = imp[k] / si
            part_r = cp[k] / scp
            if part_r <= 0: continue
            out.append({'ratio': part_i / part_r, 'gain': div.get(k, 0.0),
                        'div_theo': 1 / part_i if part_i > 0 else 0})
    return out

def st(S):
    n = len(S)
    if n < 200: return None
    g = [x['gain'] for x in S]; mu = sum(g) / n
    se = (sum((y - mu) ** 2 for y in g) / n) ** 0.5 / math.sqrt(n)
    return n, (mu - 1) * 100, se * 100, sum(1 for x in S if x['gain'] > 0) / n * 100

if __name__ == '__main__':
    A = charge({'2022', '2023'})
    print(f"\nApprentissage 2022-2023 : {len(A)} courses")
    if len(A) < 200: sys.exit("collecte incomplète")
    best, bl = None, -1e18
    for lam in [x / 20 for x in range(8, 25)]:
        v = logL_lambda(A, lam)
        if v > bl: bl, best = v, lam
    print(f"λ estimé par maximum de vraisemblance : {best:.2f}   (Harville pur = 1,00)\n")
    B = charge({'2024', '2025'})
    print(f"Test 2024-2025 : {len(B)} courses\n")
    for nom, cs in (('APPRENTISSAGE 2022-2023', A), ('TEST 2024-2025', B)):
        S = evalue(cs, best)
        r = st(S)
        if not r: print(f"{nom} — trop peu de paires"); continue
        print(f"── {nom} — {r[0]} paires simulées")
        print(f"{'':>24}{'paires':>9}{'touche':>9}{'ROI':>9}{'± SE':>7}")
        print(f"{'référence (toutes)':>24}{r[0]:>9}{r[3]:>8.1f}%{r[1]:>8.1f}%{r[2]:>7.1f}")
        for lo, hi, lab in [(0, .85, 'ratio < 0,85'), (.85, 1, '0,85 – 1'), (1, 1.15, '1 – 1,15'),
                            (1.15, 1.4, '1,15 – 1,4'), (1.4, 99, '>= 1,4')]:
            q = st([x for x in S if lo <= x['ratio'] < hi])
            if q: print(f"{lab:>24}{q[0]:>9}{q[3]:>8.1f}%{q[1]:>8.1f}%{q[2]:>7.1f}")
        reg = st([x for x in S if x['ratio'] >= 1.15])
        if reg:
            ec = reg[1] - r[1]; se = math.sqrt(reg[2] ** 2 + r[2] ** 2)
            print(f"{'RÈGLE ratio >= 1,15':>24}{reg[0]:>9}{reg[3]:>8.1f}%{reg[1]:>8.1f}%{reg[2]:>7.1f}")
            print(f"    écart règle − référence : {ec:+.1f} pts ± {se:.1f}   t = {ec/se:.2f}")
        print("    par tranche de dividende théorique, dans l'univers ratio >= 1,15")
        for lo, hi, lab in [(0, 5, 'div théo < 5 €'), (5, 8, '5 – 8 €'), (8, 20, '8 – 20 €'), (20, 1e9, '>= 20 €')]:
            q = st([x for x in S if x['ratio'] >= 1.15 and lo <= x['div_theo'] < hi])
            if q: print(f"{lab:>24}{q[0]:>9}{q[3]:>8.1f}%{q[1]:>8.1f}%{q[2]:>7.1f}")
        print()
