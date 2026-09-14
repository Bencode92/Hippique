#!/usr/bin/env python3
"""Un modèle non linéaire, avec des leviers construits depuis l'historique.

Données : data/histo (FR plat, 2022 → 2026), une seule source PMU, donc les
noms de jockey / entraîneur / cheval se rattachent par égalité stricte — pas
de France Galop ici. Chaque levier est calculé UNIQUEMENT à partir des courses
antérieures à la course considérée (point-in-time par construction).

Leviers, par partant :
  cheval    courses, victoires, placés (top 3), position moyenne normalisée
            (5 dernières), dernière position, jours depuis la dernière course,
            courses et taux de placé à cette distance, à cet hippodrome,
            âge, sexe, poids/valeur, corde, gains carrière / course
  jockey    montes et taux V / P sur 365 j, activité 30 j, montes et taux V à
            l'hippodrome
  entraîn.  idem
  duo       partants et taux V du couple jockey × entraîneur
  course    distance, partants, allocation, catégorie, corde de piste, mois
  + versions relatives à la course (écart à la moyenne des partants)

Modèles (HistGradientBoosting, classification gagnant / non, probas
renormalisées par course) :
  G1  leviers seuls — « ma cote »
  G2  leviers + cotes PASSÉES du cheval (historique public, pas le marché du jour)
  G3  leviers + cote du jour — les leviers ajoutent-ils au marché ?
  M0  cote du jour seule (référence)

Découpe : train 2022-01 → 2025-06, validation 2025-07 → 2025-12 (arrêt
précoce), TEST 2026-01 → 2026-09, jamais regardé avant.

    python3 bench/gbm_histo.py
"""
import json, glob, math, collections, datetime as dt
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

# ── chargement, ordre chronologique ─────────────────────────────────────
courses = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1 and p.get('nom')]
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        d['parts'] = ps; d['inv'] = inv
        courses.append(d)
courses.sort(key=lambda d: (d['date'], d['r'], d['c']))
print(f"{len(courses)} courses FR plat, {courses[0]['date']} → {courses[-1]['date']}")

def bucket(dist):
    return 0 if dist < 1400 else 1 if dist < 1900 else 2 if dist < 2400 else 3
def jours(a, b): return (dt.date.fromisoformat(a) - dt.date.fromisoformat(b)).days

# ── état glissant ────────────────────────────────────────────────────────
class Acteur:
    __slots__ = ('runs', 'hip')
    def __init__(self): self.runs = collections.deque(); self.hip = collections.defaultdict(lambda: [0, 0])
    def stats(self, date, hip):
        while self.runs and jours(date, self.runs[0][0]) > 365: self.runs.popleft()
        n = len(self.runs)
        if n == 0: return [0, 0.09, 0.30, 0, 0, 0.09]
        v = sum(r[1] for r in self.runs); pl = sum(r[2] for r in self.runs)
        n30 = sum(1 for r in self.runs if jours(date, r[0]) <= 30)
        h = self.hip[hip]
        return [n, v / n, pl / n, n30, h[0], h[1] / h[0] if h[0] >= 5 else 0.09]
    def maj(self, date, hip, win, place):
        self.runs.append((date, win, place)); h = self.hip[hip]; h[0] += 1; h[1] += win

chevaux = collections.defaultdict(list)          # nom → [(date, pos_norm, pos, dist_b, hip, cote, win, place)]
jockeys = collections.defaultdict(Acteur); entraineurs = collections.defaultdict(Acteur)
duos = collections.defaultdict(lambda: [0, 0])

NOMS = ['ch courses', 'ch tauxV', 'ch tauxP', 'ch pos moy 5', 'ch dern pos', 'ch jours', 'ch courses dist', 'ch tauxP dist',
        'ch courses hip', 'ch tauxP hip', 'âge', 'femelle', 'poids', 'corde', 'corde rel', 'gains/course', 'nc pmu', 'tauxV pmu', 'tauxP pmu',
        'jk montes 365', 'jk tauxV', 'jk tauxP', 'jk montes 30', 'jk montes hip', 'jk tauxV hip',
        'ent part 365', 'ent tauxV', 'ent tauxP', 'ent part 30', 'ent part hip', 'ent tauxV hip',
        'duo part', 'duo tauxV',
        'distance', 'partants', 'log alloc', 'handicap', 'reclamer', 'maiden', 'corde gauche', 'mois',
        'ch log cote passée moy', 'ch log cote dern']
REL = ['ch tauxV', 'ch tauxP', 'ch pos moy 5', 'gains/course', 'tauxV pmu', 'jk tauxV', 'jk tauxP', 'ent tauxV', 'ent tauxP', 'duo tauxV', 'poids', 'ch log cote passée moy']

X_all, y_all, meta = [], [], []
for d in courses:
    date, hip, dist, n = d['date'], d['hip'], d['dist'] or 0, len(d['parts'])
    cat = (d.get('cat') or '').upper(); lib = (d.get('lib') or '').upper()
    lignes = []
    for p in d['parts']:
        h = chevaux[p['nom']]
        nch = len(h)
        rec = h[-5:]
        db = bucket(dist)
        hd = [r for r in h if r[3] == db]; hh = [r for r in h if r[4] == hip]
        nc = p.get('nc') or 0
        jk = jockeys[p.get('jk') or '?'].stats(date, hip); en = entraineurs[p.get('en') or '?'].stats(date, hip)
        duo = duos[(p.get('jk') or '?') + '|' + (p.get('en') or '?')]
        cotes_p = [r[5] for r in rec]
        lignes.append([
            nch, sum(r[6] for r in h) / nch if nch else 0.09, sum(r[7] for r in h) / nch if nch else 0.30,
            np.mean([r[1] for r in rec]) if rec else 0.5, h[-1][2] if h else 6, min(jours(date, h[-1][0]), 400) if h else 400,
            len(hd), sum(r[7] for r in hd) / len(hd) if hd else 0.30, len(hh), sum(r[7] for r in hh) / len(hh) if hh else 0.30,
            p.get('ag') or 4, 1.0 if p.get('sx') == 'FEMELLES' else 0.0, (p.get('p') or 550) / 10, p.get('co') or 8, (p.get('co') or 8) / n,
            math.log1p((p.get('g') or 0) / nc) if nc else 0.0, nc, (p.get('nv') or 0) / nc if nc >= 2 else 0.09, (p.get('np') or 0) / nc if nc >= 2 else 0.30,
            *jk, *en, duo[0], duo[1] / duo[0] if duo[0] >= 5 else 0.09,
            dist, n, math.log1p(d.get('alloc') or 0), 1.0 if 'HANDICAP' in cat or 'HANDICAP' in lib else 0.0, 1.0 if 'RECLAMER' in cat or 'RECLAMER' in lib else 0.0,
            1.0 if 'INEDIT' in lib or 'MAIDEN' in lib else 0.0, 1.0 if (d.get('corde') or '') == 'CORDE_GAUCHE' else 0.0, int(date[5:7]),
            np.mean([math.log(c) for c in cotes_p]) if cotes_p else math.log(12), math.log(cotes_p[-1]) if cotes_p else math.log(12),
        ])
    A = np.array(lignes, float)
    # versions relatives : écart à la moyenne de la course
    idx = [NOMS.index(k) for k in REL]
    R = A[:, idx] - A[:, idx].mean(0)
    mk = np.array([[math.log((1 / p['c']) / d['inv'])] for p in d['parts']])
    for i, p in enumerate(d['parts']):
        X_all.append(np.concatenate([A[i], R[i], mk[i]])); y_all.append(1 if p.get('a') == 1 else 0)
        meta.append((len(meta) and meta[-1][0] + 1 if False else 0, date, p['c']))
    # mise à jour APRÈS la course
    for p in d['parts']:
        a = p.get('a'); pos = a if a else n
        win = 1 if a == 1 else 0; place = 1 if a and a <= 3 else 0
        chevaux[p['nom']].append((date, pos / n, pos, bucket(dist), hip, p['c'], win, place))
        jockeys[p.get('jk') or '?'].maj(date, hip, win, place); entraineurs[p.get('en') or '?'].maj(date, hip, win, place)
        k = duos[(p.get('jk') or '?') + '|' + (p.get('en') or '?')]; k[0] += 1; k[1] += win

X = np.array(X_all); y = np.array(y_all)
COLS = NOMS + ['rel ' + k for k in REL] + ['log p marché']
# index de course par ligne
cid = np.repeat(np.arange(len(courses)), [len(d['parts']) for d in courses])
dates = np.array([d['date'] for d in courses])
gagnant = np.array([next(i for i, p in enumerate(d['parts']) if p.get('a') == 1) for d in courses])
cotes = [np.array([p['c'] for p in d['parts']]) for d in courses]
tr = dates < '2025-07-01'; va = (dates >= '2025-07-01') & (dates < '2026-01-01'); te = dates >= '2026-01-01'
rtr, rva, rte = tr[cid], va[cid], te[cid]
print(f"train {tr.sum()} courses (2022 → juin 2025) · valid {va.sum()} (juil-déc 2025) · TEST {te.sum()} (2026)\n")

def eval_courses(scores, masque, lib):
    """scores : utilité par ligne. Top-k et log-vraisemblance par course sur les courses du masque."""
    t = np.zeros(3); llsum = 0.0; ncs = 0
    for ci in np.where(masque)[0]:
        rows = np.where(cid == ci)[0]; u = scores[rows]; u = u - u.max(); p = np.exp(u); p /= p.sum()
        g = gagnant[ci]; c = cotes[ci]
        mieux = sum(1 for i in range(len(u)) if i != g and (u[i] > u[g] or (u[i] == u[g] and c[i] < c[g])))
        for k in range(3): t[k] += mieux < k + 1
        llsum += math.log(max(p[g], 1e-12)); ncs += 1
    se = math.sqrt(t[0] / ncs * (1 - t[0] / ncs) / ncs)
    print(f"{lib:44s} Top1 {100*t[0]/ncs:4.1f} ± {100*se:.1f}   Top2 {100*t[1]/ncs:4.1f}   Top3 {100*t[2]/ncs:4.1f}   LL/course {llsum/ncs:+.4f}")

def gbm(cols, lib):
    j = [COLS.index(c) for c in cols]
    m = HistGradientBoostingClassifier(max_iter=600, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=60,
                                       l2_regularization=1.0, early_stopping=False, random_state=0)
    # arrêt précoce manuel sur la validation (log-vraisemblance par course)
    best, best_it = -1e9, 0
    m.set_params(max_iter=120, warm_start=True)
    for it in range(120, 601, 120):
        m.set_params(max_iter=it); m.fit(X[rtr][:, j], y[rtr])
        s = m.predict_proba(X[:, j])[:, 1]; u = np.log(np.clip(s, 1e-9, 1))
        llv = 0.0; nv = 0
        for ci in np.where(va)[0]:
            rows = np.where(cid == ci)[0]; uu = u[rows] - u[rows].max(); p = np.exp(uu); p /= p.sum(); llv += math.log(max(p[gagnant[ci]], 1e-12)); nv += 1
        if llv / nv > best: best, best_it = llv / nv, it
    m = HistGradientBoostingClassifier(max_iter=best_it, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=60, l2_regularization=1.0, early_stopping=False, random_state=0)
    m.fit(X[rtr | rva][:, j], y[rtr | rva])
    s = np.log(np.clip(m.predict_proba(X[:, j])[:, 1], 1e-9, 1))
    eval_courses(s, te, f"{lib} ({best_it} arbres)")
    return s, m, j

SANS_COTE = [c for c in COLS if 'cote' not in c and c != 'log p marché']
AVEC_PASSEES = [c for c in COLS if c != 'log p marché']
eval_courses(X[:, COLS.index('log p marché')], te, 'M0 cote du jour seule')
s1, m1, j1 = gbm(SANS_COTE, 'G1 leviers seuls, sans aucune cote')
s2, m2, j2 = gbm(AVEC_PASSEES, 'G2 leviers + cotes passées du cheval')
s3, m3, j3 = gbm(COLS, 'G3 leviers + cote du jour')

# importance par permutation (G1), sur le test — ce qui compte vraiment
print("\nLeviers les plus utiles (G1, perte de log-vraisemblance quand on brouille le levier, test) :")
rng = np.random.default_rng(0)
def ll_test(scores):
    s = 0.0; n = 0
    for ci in np.where(te)[0]:
        rows = np.where(cid == ci)[0]; u = scores[rows] - scores[rows].max(); p = np.exp(u); p /= p.sum(); s += math.log(max(p[gagnant[ci]], 1e-12)); n += 1
    return s / n
base = ll_test(s1); imp = []
Xt = X[:, j1].copy()
for k, c in enumerate(SANS_COTE):
    Xp = Xt.copy(); Xp[rte, k] = rng.permutation(Xp[rte, k])
    imp.append((base - ll_test(np.log(np.clip(m1.predict_proba(Xp)[:, 1], 1e-9, 1))), c))
for d_, c in sorted(imp, reverse=True)[:14]: print(f"   {c:26s} {d_:+.4f}")

# ── « ma cote » G1 contre le marché, test 2026, simple gagnant, dividende ≈ cote finale
print("\n══ G1 comme cote maison, TEST 2026, simple gagnant")
paris = []
for ci in np.where(te)[0]:
    rows = np.where(cid == ci)[0]; u = s1[rows] - s1[rows].max(); p = np.exp(u); p /= p.sum()
    c = cotes[ci]; pm = 1 / c; pm /= pm.sum(); ordre = np.argsort(-u); fav = int(np.argmin(c)); g = gagnant[ci]
    for rang, i in enumerate(ordre):
        paris.append(dict(ratio=p[i] / pm[i], rang=rang + 1, gain=(c[i] - 1) if i == g else -1.0, cote=c[i], fav=i == fav))
def ligne(lib, sel):
    if not sel: print(f"   {lib:44s} —"); return
    g = np.array([x['gain'] for x in sel])
    print(f"   {lib:44s} ROI {100*g.mean():+6.1f} % ± {100*g.std(ddof=1)/math.sqrt(len(g)):4.1f}   n={len(g):5d}   touche {100*np.mean(g>0):4.1f} %")
ligne('tous les partants (= prélèvement)', paris)
ligne('favori du marché', [x for x in paris if x['fav']])
ligne('mon 1er par course', [x for x in paris if x['rang'] == 1])
ligne('mes 2 meilleurs par course', [x for x in paris if x['rang'] <= 2])
for s in (1.5, 2.0, 3.0): ligne(f'ma proba / proba marché ≥ {s}', [x for x in paris if x['ratio'] >= s])
for s in (1.5, 2.0): ligne(f'ratio ≥ {s} ET dans mes 2 meilleurs', [x for x in paris if x['ratio'] >= s and x['rang'] <= 2])
