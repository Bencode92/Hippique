#!/usr/bin/env python3
"""
Les leviers améliorent-ils la PROBABILITÉ, et sur quelles courses ?

    python3 bench/proba_par_segment.py

Logit conditionnel : la probabilité implicite du marché entre comme variable,
les leviers de la course s'ajoutent, et on mesure ce qu'ils apportent HORS
ÉCHANTILLON — en log-vraisemblance par course, métrique bien plus sensible que
le ROI (une observation par partant au lieu d'une par course).

Entraînement 2022-2023, test 2024-2025. Un modèle est ajusté PAR SEGMENT, de
sorte qu'un apport limité à certaines courses ne soit pas noyé dans la moyenne.

Lecture : Δ logL > 0 = les leviers apportent. Un gain de 0,01 nat/course est
déjà notable ; 0,001 est du bruit.
"""
import json, glob, math, re
import numpy as np
from scipy.optimize import minimize

NOMS = ['log p marché', 'Valeur FG', 'Musique', 'TauxV indiv', 'TauxP indiv',
        'Gains (log)', 'Expérience', 'Âge', 'Corde', 'Dérive cote']

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
    cs = []
    for f in sorted(glob.glob('data/histo/*.jsonl')):
        for line in open(f, encoding='utf-8'):
            r = json.loads(line)
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 6: continue
            if sum(1 for p in ps if p.get('a') == 1) != 1: continue
            inv = sum(1 / p['c'] for p in ps)
            X, y = [], []
            for p in ps:
                nc = p.get('nc') or 0; nv = p.get('nv') or 0; npl = p.get('np') or 0
                cr = p.get('cr') or 0
                X.append([math.log((1 / p['c']) / inv),
                          (p.get('p') or 0) / 10 or 50.0,
                          musique(p.get('m')),
                          nv / nc * 100 if nc >= 2 else 8.0,
                          npl / nc * 100 if nc >= 2 else 30.0,
                          math.log10((p.get('g') or 0) + 1),
                          float(nc), float(p.get('ag') or 4), float(p.get('co') or 0),
                          (cr - p['c']) / cr * 100 if cr > 1 else 0.0])
                y.append(1 if p.get('a') == 1 else 0)
            cs.append({'X': np.array(X), 'k': int(np.argmax(y)), 'n': len(ps),
                       'an': r['date'][:4], 'd': r.get('dist') or 0})
    return cs

def ajuste(cs, cols, mu, sd, l2=2.0):
    Xs = [(c['X'][:, cols] - mu[cols]) / sd[cols] for c in cs]
    ks = [c['k'] for c in cs]
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
    A = [c for c in CS if c['an'] in ('2022', '2023')]
    B = [c for c in CS if c['an'] in ('2024', '2025')]
    print(f"\nApprentissage 2022-2023 : {len(A)} courses   |   Test 2024-2025 : {len(B)} courses\n")
    SEG = [('toutes', lambda c: True),
           ('6-8 partants',  lambda c: 6 <= c['n'] <= 8),
           ('9-11 partants',  lambda c: 9 <= c['n'] <= 11),
           ('12-14 partants', lambda c: 12 <= c['n'] <= 14),
           ('15-17 partants', lambda c: 15 <= c['n'] <= 17),
           ('18+ partants',   lambda c: c['n'] >= 18),
           ('sprint < 1400m', lambda c: c['d'] < 1400),
           ('mile 1400-1699', lambda c: 1400 <= c['d'] < 1700),
           ('middle 1700-2199', lambda c: 1700 <= c['d'] < 2200),
           ('staying >= 2200', lambda c: c['d'] >= 2200)]
    print(f"{'segment':>20}{'appr.':>8}{'test':>7}{'logL marché':>13}{'+ leviers':>11}{'Δ':>9}")
    print('-' * 70)
    for lab, f in SEG:
        a = [c for c in A if f(c)]; b = [c for c in B if f(c)]
        if len(a) < 400 or len(b) < 400: continue
        allX = np.vstack([c['X'] for c in a]); mu, sd = allX.mean(0), allX.std(0); sd[sd == 0] = 1
        w0 = ajuste(a, [0], mu, sd); l0 = logL(b, [0], w0, mu, sd)
        cols = list(range(len(NOMS)))
        w1 = ajuste(a, cols, mu, sd); l1 = logL(b, cols, w1, mu, sd)
        flag = '  ←' if l1 - l0 > 0.005 else ''
        print(f"{lab:>20}{len(a):>8}{len(b):>7}{l0:>13.4f}{l1:>11.4f}{l1-l0:>+9.4f}{flag}")
