#!/usr/bin/env python3
"""
Classements d'acteurs DATÉS, reconstruits depuis les arrivées, et leur apport.

    python3 bench/acteurs_dates.py

Pour chaque course, on calcule le taux de victoire et de placement du jockey et
de l'entraîneur sur les 365 jours PRÉCÉDENTS, en n'utilisant que des courses
déjà courues. Aucune fuite possible : le futur n'entre jamais dans le calcul —
contrairement aux fichiers *_latest.json qui imposaient TRAINING_START_DATE.

Puis logit conditionnel : marché seul, marché + leviers de course, marché +
leviers + acteurs datés. Apprentissage 2022-2023, test 2024-2025.
"""
import json, glob, math, re
from collections import defaultdict, deque
from datetime import date
import numpy as np
from scipy.optimize import minimize

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

def jours(s): 
    a, m, j = map(int, s.split('-')); return date(a, m, j).toordinal()

NOMS = ['log p marché', 'Valeur FG', 'Musique', 'TauxV indiv', 'TauxP indiv',
        'Gains (log)', 'Expérience', 'Âge', 'Corde', 'Dérive cote',
        'Jk TauxV 12m', 'Jk TauxP 12m', 'Jk volume', 'En TauxV 12m', 'En TauxP 12m', 'En volume']
CŒUR = list(range(10))          # marché + leviers de course
TOUT = list(range(len(NOMS)))   # + acteurs datés

def charge():
    lignes = []
    for f in sorted(glob.glob('data/histo/*.jsonl')):
        for l in open(f, encoding='utf-8'):
            r = json.loads(l)
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 6 or sum(1 for p in ps if p.get('a') == 1) != 1: continue
            lignes.append((r['date'], ps))
    lignes.sort(key=lambda x: x[0])

    # historique glissant par acteur : file de (jour, gagné, placé)
    HJ, HE = defaultdict(deque), defaultdict(deque)
    def stat(h, cle, j0):
        q = h[cle]
        while q and q[0][0] < j0 - 365: q.popleft()
        if not q: return 8.0, 30.0, 0.0
        n = len(q); v = sum(x[1] for x in q); p = sum(x[2] for x in q)
        return v / n * 100, p / n * 100, math.log10(n + 1)

    cs = []
    for d, ps in lignes:
        j0 = jours(d)
        inv = sum(1 / p['c'] for p in ps)
        X, y = [], []
        for p in ps:
            nc = p.get('nc') or 0; nv = p.get('nv') or 0; npl = p.get('np') or 0
            cr = p.get('cr') or 0
            jk = (p.get('jk') or '').upper().strip()
            en = (p.get('en') or '').upper().strip()
            jv, jp, jn = stat(HJ, jk, j0) if jk else (8.0, 30.0, 0.0)
            ev, ep, en_ = stat(HE, en, j0) if en else (8.0, 30.0, 0.0)
            X.append([math.log((1 / p['c']) / inv),
                      (p.get('p') or 0) / 10 or 50.0, musique(p.get('m')),
                      nv / nc * 100 if nc >= 2 else 8.0,
                      npl / nc * 100 if nc >= 2 else 30.0,
                      math.log10((p.get('g') or 0) + 1),
                      float(nc), float(p.get('ag') or 4), float(p.get('co') or 0),
                      (cr - p['c']) / cr * 100 if cr > 1 else 0.0,
                      jv, jp, jn, ev, ep, en_])
            y.append(1 if p.get('a') == 1 else 0)
        cs.append({'X': np.array(X), 'k': int(np.argmax(y)), 'n': len(ps),
                   'an': d[:4], 'd': 0})
        # la course entre dans l'historique APRÈS avoir servi
        for p in ps:
            g = 1 if p.get('a') == 1 else 0
            pl = 1 if p.get('a') in (1, 2, 3) else 0
            jk = (p.get('jk') or '').upper().strip()
            en = (p.get('en') or '').upper().strip()
            if jk: HJ[jk].append((j0, g, pl))
            if en: HE[en].append((j0, g, pl))
    return cs

def ajuste(cs, cols, mu, sd, l2=2.0):
    Xs = [(c['X'][:, cols] - mu[cols]) / sd[cols] for c in cs]; ks = [c['k'] for c in cs]
    def nll(w):
        tot = 0.0; g = np.zeros(len(cols))
        for X, k in zip(Xs, ks):
            u = X @ w; u -= u.max(); e = np.exp(u); p = e / e.sum()
            tot -= math.log(max(p[k], 1e-12)); g += X.T @ p - X[k]
        return tot + l2 * (w @ w), g + 2 * l2 * w
    return minimize(nll, np.zeros(len(cols)), jac=True, method='L-BFGS-B').x

def logL(cs, cols, w, mu, sd):
    t = 0.0
    for c in cs:
        X = (c['X'][:, cols] - mu[cols]) / sd[cols]
        u = X @ w; u -= u.max(); e = np.exp(u); p = e / e.sum()
        t += math.log(max(p[c['k']], 1e-12))
    return t / len(cs)

if __name__ == '__main__':
    CS = charge()
    # on écarte 2022 : l'historique glissant y est encore vide
    A = [c for c in CS if c['an'] == '2023']
    B = [c for c in CS if c['an'] in ('2024', '2025')]
    print(f"\nApprentissage 2023 : {len(A)} courses   |   Test 2024-2025 : {len(B)} courses")
    print("(2022 sert uniquement à amorcer l'historique glissant des acteurs)\n")
    allX = np.vstack([c['X'] for c in A]); mu, sd = allX.mean(0), allX.std(0); sd[sd == 0] = 1
    res = {}
    for lab, cols in [('marché seul', [0]), ('+ leviers de course', CŒUR), ('+ acteurs datés', TOUT)]:
        w = ajuste(A, cols, mu, sd); res[lab] = (logL(B, cols, w, mu, sd), w, cols)
        print(f"  {lab:>22} : logL hors échantillon {res[lab][0]:>9.4f}")
    base = res['marché seul'][0]
    print(f"\n  apport des leviers de course : {res['+ leviers de course'][0]-base:+.4f}")
    print(f"  apport des acteurs datés     : {res['+ acteurs datés'][0]-res['+ leviers de course'][0]:+.4f}")
    print("\n  Poids appris (variables standardisées, modèle complet) :")
    w, cols = res['+ acteurs datés'][1], res['+ acteurs datés'][2]
    for n, v in sorted(zip([NOMS[i] for i in cols], w), key=lambda x: -abs(x[1]))[:8]:
        print(f"    {n:>16} {v:>+8.3f}")
