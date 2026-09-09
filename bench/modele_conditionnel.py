#!/usr/bin/env python3
"""
Logit conditionnel sur les courses FR plat — le marché comme point de départ.

    python3 bench/modele_conditionnel.py

Question posée : les leviers apportent-ils une information QUE LA COTE N'A PAS
DÉJÀ ? Le modèle prend le log de la probabilité implicite du marché comme
première variable, puis on regarde si les autres améliorent quelque chose
HORS ÉCHANTILLON. Entraînement sur le 1er semestre 2025, test sur le second.

Un logit conditionnel modélise le choix d'un gagnant PARMI les partants d'une
course (softmax intra-course), au lieu de traiter chaque cheval comme un tirage
indépendant. C'est le modèle standard de la littérature hippique.
"""
import json, glob, math, re, sys
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

NOMS = ['log p marché', 'dérive cote', 'Valeur FG', 'Musique', 'TauxV indiv',
        'TauxP indiv', 'Gains (log)', 'Expérience', 'Âge', 'Corde']

def charge():
    courses = []
    for f in sorted(glob.glob('data/histo/2025-*.jsonl')):
        for line in open(f, encoding='utf-8'):
            r = json.loads(line)
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
            inv = sum(1 / p['c'] for p in ps)
            X, y, cotes = [], [], []
            for p in ps:
                nc = p.get('nc') or 0; nv = p.get('nv') or 0; npl = p.get('np') or 0
                cr = p.get('cr') or 0
                X.append([
                    math.log((1 / p['c']) / inv),                       # le marché
                    (cr - p['c']) / cr * 100 if cr > 1 else 0.0,        # dérive
                    (p.get('p') or 0) / 10 or 50.0,                     # Valeur FG
                    musique(p.get('m')),
                    nv / nc * 100 if nc >= 2 else 8.0,
                    npl / nc * 100 if nc >= 2 else 30.0,
                    math.log10((p.get('g') or 0) + 1),
                    float(nc),
                    float(p.get('ag') or 4),
                    float(p.get('co') or 0),
                ])
                y.append(1 if p.get('a') == 1 else 0)
                cotes.append(p['c'])
            if sum(y) != 1: continue          # dead heats écartés
            courses.append({'d': r['date'], 'X': np.array(X), 'y': np.array(y),
                            'c': np.array(cotes)})
    return courses

def ajuste(cs, cols, mu, sd, l2=1.0):
    """Logit conditionnel : softmax intra-course. Retourne les poids."""
    Xs = [ (c['X'][:, cols] - mu[cols]) / sd[cols] for c in cs ]
    ys = [ int(np.argmax(c['y'])) for c in cs ]
    def nll(w):
        tot = 0.0; grad = np.zeros(len(cols))
        for X, k in zip(Xs, ys):
            u = X @ w; u -= u.max()
            e = np.exp(u); p = e / e.sum()
            tot -= math.log(max(p[k], 1e-12))
            grad += X.T @ p - X[k]
        return tot + l2 * (w @ w), grad + 2 * l2 * w
    r = minimize(nll, np.zeros(len(cols)), jac=True, method='L-BFGS-B')
    return r.x

def evalue(cs, cols, w, mu, sd):
    ll = 0.0; mises = 0; gains = 0.0; ok = 0; profits = []
    for c in cs:
        X = (c['X'][:, cols] - mu[cols]) / sd[cols]
        u = X @ w; u -= u.max(); e = np.exp(u); p = e / e.sum()
        k = int(np.argmax(c['y']))
        ll += math.log(max(p[k], 1e-12))
        j = int(np.argmax(p))
        mises += 1
        g = (c['c'][j] if j == k else 0.0)
        gains += g; ok += (j == k)
        profits.append(g - 1)
    roi = (gains / mises - 1) * 100
    se = np.std(profits) / math.sqrt(len(profits)) * 100
    return ll / len(cs), ok / mises * 100, roi, se, profits

if __name__ == '__main__':
    cs = charge()
    A = [c for c in cs if c['d'] < '2025-07-01']
    B = [c for c in cs if c['d'] >= '2025-07-01']
    allX = np.vstack([c['X'] for c in A])
    mu, sd = allX.mean(0), allX.std(0); sd[sd == 0] = 1
    print(f"\nApprentissage S1 : {len(A)} courses   |   Test S2 : {len(B)} courses\n")

    MODELES = [('marché seul', [0]), ('marché + dérive', [0, 1]),
               ('marché + tous leviers', list(range(len(NOMS))))]
    print(f"{'modèle':>24}{'logL/course':>13}{'top1':>8}{'ROI':>9}{'± SE':>7}")
    print('-' * 62)
    sorties = {}
    for nom, cols in MODELES:
        w = ajuste(A, cols, mu, sd)
        ll, top1, roi, se, pr = evalue(B, cols, w, mu, sd)
        sorties[nom] = (w, cols, pr)
        print(f"{nom:>24}{ll:>13.4f}{top1:>7.1f}%{roi:>8.1f}%{se:>7.1f}")
    fav = []
    for c in B:
        j = int(np.argmax(c['X'][:, 0])); k = int(np.argmax(c['y']))
        fav.append((c['c'][j] if j == k else 0.0) - 1)
    print(f"{'— favori (référence) —':>24}{'':>13}{sum(1 for x in fav if x>0)/len(fav)*100:>7.1f}%"
          f"{(np.mean(fav))*100:>8.1f}%{np.std(fav)/math.sqrt(len(fav))*100:>7.1f}")

    print("\nPoids appris (variables standardisées, modèle complet) :")
    w, cols, _ = sorties['marché + tous leviers']
    for n, v in sorted(zip([NOMS[i] for i in cols], w), key=lambda x: -abs(x[1])):
        print(f"  {n:>16} {v:>+8.3f}")

    print("\nTest apparié contre le favori (test S2) :")
    for nom in ('marché + dérive', 'marché + tous leviers'):
        d = np.array(sorties[nom][2]) - np.array(fav)
        t = d.mean() / (d.std() / math.sqrt(len(d)))
        print(f"  {nom:>24} : {d.mean()*100:>+6.1f}%  ± {d.std()/math.sqrt(len(d))*100:.1f}   t = {t:>5.2f}")
