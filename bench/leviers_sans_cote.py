#!/usr/bin/env python3
"""Les leviers valent-ils quelque chose SEULS, sans la cote PMU ?

Reprend la mesure du 11/09 (logit conditionnel, tous les leviers ensemble,
données point-in-time) mais sur la table construite avec le rattachement
réparé (bench/features_pit.mjs), et pose trois questions distinctes :

  M0  la cote seule                        — la référence, c'est le marché
  M1  les leviers seuls, SANS la cote      — « ma cote »
  M2  la cote + les leviers                — les leviers ajoutent-ils au marché ?

Protocole, écrit avant de regarder :
  train avril-mai, validation juin (choix de la régularisation), test
  juillet-septembre, jamais touché. Critères : Top1 / Top2 / Top3, log-vraisemblance
  par course. Puis, pour M1 seulement : quand ma cote s'écarte de la cote PMU,
  est-ce que ça paie (ROI au simple gagnant, dividende ≈ cote finale) ?

    python3 bench/leviers_sans_cote.py
"""
import json, math, sys
import numpy as np
from scipy.optimize import minimize

L = [json.loads(l) for l in open('bench/out/features_pit.jsonl', encoding='utf-8')]

def lg(x): return math.log1p(max(x or 0, 0))
def v(x, defaut): return defaut if x is None else x

NOMS = ['jk tauxV', 'jk tauxP', 'jk gain/part', 'jk activité',
        'ent tauxV', 'ent tauxP', 'ent gain/part',
        'élev gain/part', 'prop gain/part',
        'ch tauxV (FG)', 'ch tauxP (FG)', 'ch gain moyen (FG)', 'ch valeur (FG)',
        'valeur hcp', 'poids', 'corde', 'âge', 'femelle',
        'gain/course', 'tauxV indiv', 'tauxP indiv', 'nb courses',
        'musique moy', 'forme récente', 'équipement']
def leviers(r):
    jk, en, el, pr, ch = r['jk'] or {}, r['en'] or {}, r['el'] or {}, r['pr'] or {}, r['ch'] or {}
    nc = r['nb_courses'] or 0
    return [
        v(jk.get('tv'), 0.09), v(jk.get('tp'), 0.30), lg(jk.get('gp')), lg(jk.get('pa')),
        v(en.get('tv'), 0.09), v(en.get('tp'), 0.30), lg(en.get('gp')),
        lg(el.get('gp')), lg(pr.get('gp')),
        v(ch.get('tv'), 0.09), v(ch.get('tp'), 0.30), lg(ch.get('gm')), v(ch.get('val'), 0),
        v(r['valeur'], 0), v(r['poids'], 55), -v(r['corde'], 8), v(r['age'], 4), 1.0 if r['sexe'] == 'F' else 0.0,
        lg(r['gains'] / nc) if nc else 0.0, r['nb_victoires'] / nc if nc >= 2 else 0.09, r['nb_places'] / nc if nc >= 2 else 0.30, lg(nc),
        -v(r['mus_moy'], 8), -v(r['mus_rec'], 8), 1.0 if r['equipement'] else 0.0,
    ]

courses = []
for c in L:
    inv = c['overround']
    X = np.array([leviers(r) for r in c['rows']], float)
    mk = np.array([[math.log((1 / r['cote']) / inv)] for r in c['rows']], float)
    courses.append(dict(date=c['date'], X=X, mk=mk, g=c['gagnant'], n=c['partants'],
                        cotes=np.array([r['cote'] for r in c['rows']]), typ=c['type'], dist=c['distance']))
tr = [c for c in courses if c['date'] < '2026-06-01']
va = [c for c in courses if '2026-06-01' <= c['date'] < '2026-07-01']
te = [c for c in courses if c['date'] >= '2026-07-01']
print(f"{len(courses)} courses · train {len(tr)} (avril-mai) · valid {len(va)} (juin) · test {len(te)} (juillet-sept.)\n")

def matrice(c, mode):
    if mode == 'M0': return c['mk']
    if mode == 'M1': return c['X']
    return np.hstack([c['mk'], c['X']])
def standardise(jeu_ref, mode):
    A = np.vstack([matrice(c, mode) for c in jeu_ref]); mu, sd = A.mean(0), A.std(0); sd[sd == 0] = 1
    return mu, sd
def Z(c, mode, mu, sd): return (matrice(c, mode) - mu) / sd

def negll(w, jeu, mode, mu, sd, lam):
    s = 0.0
    for c in jeu:
        u = Z(c, mode, mu, sd) @ w; u -= u.max(); e = np.exp(u)
        s -= u[c['g']] - math.log(e.sum())
    return s / len(jeu) + lam * float(w @ w)
def grad(w, jeu, mode, mu, sd, lam):
    g = np.zeros_like(w)
    for c in jeu:
        z = Z(c, mode, mu, sd); u = z @ w; u -= u.max(); p = np.exp(u); p /= p.sum()
        g -= z[c['g']] - p @ z
    return g / len(jeu) + 2 * lam * w
def ajuste(jeu, mode, mu, sd, lam):
    k = matrice(jeu[0], mode).shape[1]
    r = minimize(negll, np.zeros(k), args=(jeu, mode, mu, sd, lam), jac=grad, method='L-BFGS-B')
    return r.x
def ll(jeu, w, mode, mu, sd): return -negll(w, jeu, mode, mu, sd, 0.0)
def topk(jeu, w, mode, mu, sd, K):
    ok = 0
    for c in jeu:
        u = Z(c, mode, mu, sd) @ w; g = c['g']
        mieux = sum(1 for i in range(len(u)) if i != g and (u[i] > u[g] or (u[i] == u[g] and c['cotes'][i] < c['cotes'][g])))
        ok += mieux < K
    return ok / len(jeu)
def se(p, n): return math.sqrt(p * (1 - p) / n)

resultats = {}
for mode, nom in [('M0', 'cote seule'), ('M1', 'leviers seuls, sans la cote'), ('M2', 'cote + leviers')]:
    mu, sd = standardise(tr, mode)
    lams = [0.0] if mode == 'M0' else [0.001, 0.003, 0.01, 0.03, 0.1]
    best = max(lams, key=lambda l: ll(va, ajuste(tr, mode, mu, sd, l), mode, mu, sd))
    # ré-ajustement sur train+valid avec le λ retenu, puis test
    mu, sd = standardise(tr + va, mode)
    w = ajuste(tr + va, mode, mu, sd, best)
    resultats[mode] = dict(w=w, mu=mu, sd=sd, lam=best)
    t1, t2, t3 = (topk(te, w, mode, mu, sd, K) for K in (1, 2, 3))
    print(f"{mode} {nom:32s} λ={best:<6g} test : Top1 {100*t1:4.1f} ± {100*se(t1,len(te)):.1f}   Top2 {100*t2:4.1f}   Top3 {100*t3:4.1f}   LL/course {ll(te, w, mode, mu, sd):+.4f}")

print("\nPoids appris (M1, variables standardisées), par valeur absolue :")
w1 = resultats['M1']['w']
for i in np.argsort(-np.abs(w1))[:12]: print(f"   {NOMS[i]:22s} {w1[i]:+.3f}")
print("\nPoids appris (M2) :")
w2 = resultats['M2']['w']
for i in np.argsort(-np.abs(w2))[:8]: print(f"   {(['log p marché'] + NOMS)[i]:22s} {w2[i]:+.3f}")

# ── « ma cote » contre la cote PMU, sur le test seulement ───────────────
print("\n══ M1 comme cote maison, test juillet-septembre, simple gagnant, dividende ≈ cote finale")
m = resultats['M1']; paris = []
for c in te:
    u = Z(c, 'M1', m['mu'], m['sd']) @ m['w']; u -= u.max(); p = np.exp(u); p /= p.sum()
    pm = (1 / c['cotes']); pm /= pm.sum()
    ordre = np.argsort(-u); fav = int(np.argmin(c['cotes']))
    for rang, i in enumerate(ordre):
        paris.append(dict(ratio=p[i] / pm[i], rang=rang + 1, gain=(c['cotes'][i] - 1) if i == c['g'] else -1.0, cote=c['cotes'][i], p=p[i], pm=pm[i], fav=(i == fav)))
def roi(sel):
    if not sel: return None
    g = np.array([x['gain'] for x in sel]); return g.mean(), g.std(ddof=1) / math.sqrt(len(g)), len(g)
def ligne(lib, sel):
    r = roi(sel)
    if r is None: print(f"   {lib:44s} —"); return
    print(f"   {lib:44s} ROI {100*r[0]:+6.1f} % ± {100*r[1]:4.1f}   n={r[2]:5d}   touche {100*np.mean([x['gain']>0 for x in sel]):4.1f} %")
ligne('tous les partants (référence : le prélèvement)', paris)
ligne('mes 2 meilleurs par course', [x for x in paris if x['rang'] <= 2])
ligne('mon 1er par course', [x for x in paris if x['rang'] == 1])
for s in (1.2, 1.5, 2.0, 3.0):
    ligne(f'ma proba / proba marché ≥ {s}', [x for x in paris if x['ratio'] >= s])
for s in (1.5, 2.0):
    ligne(f'ratio ≥ {s} ET dans mes 2 meilleurs', [x for x in paris if x['ratio'] >= s and x['rang'] <= 2])
ligne('mes 2 meilleurs ET cote ≥ 5', [x for x in paris if x['rang'] <= 2 and x['cote'] >= 5])
ligne('favori du marché (référence)', [x for x in paris if x['fav']])
