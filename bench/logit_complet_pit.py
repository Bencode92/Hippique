#!/usr/bin/env python3
"""Tous les leviers ajustés ENSEMBLE, pas un par un.

Les mesures précédentes testaient les leviers isolément ou par trios. Ici un
logit conditionnel les ajuste conjointement : chaque poids est estimé en
tenant compte de tous les autres, ce qui est la seule façon de savoir si un
levier apporte quelque chose QUE LES AUTRES N'ONT PAS DÉJÀ.

Données : data/courses (avril → septembre 2026, toutes les infos présentes)
+ classements point-in-time de data/rankings/ — pour chaque course, le
snapshot le plus récent ANTÉRIEUR à sa date.

Train avril-juin, test juillet-septembre. Critères Top1, Top2, Top3.

    python3 bench/logit_complet_pit.py
"""
import json, glob, os, re, math
import numpy as np
from scipy.optimize import minimize

def num(v):
    if v is None: return None
    s = re.sub(r'[^\d.\-]', '', str(v).replace(',', '.'))
    try: return float(s)
    except ValueError: return None

def clean(s):
    s = str(s or '').upper()
    s = ''.join(c for c in s if c.isalnum() or c == ' ')
    return ' '.join(s.split())

def nom_cheval(s):
    s = re.sub(r'\s+[HFM]\.\s*(?:AQPS|PU|PS|TR|AR|AN)\s*\.?.*$', '', str(s or ''), flags=re.I)
    s = re.sub(r'\s+\d+\s*a\.?.*$', '', s)
    return clean(s)

# ── snapshots datés ──────────────────────────────────────────────────────
def lire_csv(f):
    if not os.path.exists(f): return []
    lignes = [l for l in open(f, encoding='utf-8').read().split('\n') if l.strip()]
    cols = lignes[0].split('\t')
    return [dict(zip(cols, l.split('\t'))) for l in lignes[1:]]

SNAPS = sorted((d[:10], 'data/rankings/' + d) for d in os.listdir('data/rankings')
               if re.match(r'^\d{4}-\d{2}-\d{2}_', d))
_cache = {}
def snap_pour(date):
    choisi = None
    for d, p in SNAPS:
        if d <= date: choisi = p
    if not choisi: return None
    if choisi in _cache: return _cache[choisi]
    ch, jk, en = {}, {}, {}
    for r in lire_csv(choisi + '/chevaux.csv'):
        n = nom_cheval(r.get('Cheval'))
        if not n: continue
        co = num(r.get('Courses')) or 0
        ch[n] = dict(val=num(r.get('Valeur')) or 0, gm=num(r.get('Gain moyen')) or 0,
                     tv=(num(r.get('Victoires')) or 0) / co if co >= 2 else None)
    for f, d in (('jockeys.csv', jk), ('entraineurs.csv', en)):
        for r in lire_csv(choisi + '/' + f):
            n = clean(r.get('Nom'))
            if not n: continue
            pa = num(r.get('Partants')) or 0
            d[n] = dict(tv=(num(r.get('Victoires')) or 0) / pa if pa >= 20 else None,
                        tp=(num(r.get('Places')) or 0) / pa if pa >= 20 else None,
                        gp=num(r.get('Gain/Part.')) or 0)
    _cache[choisi] = (ch, jk, en)
    return _cache[choisi]

def musique(m):
    v = [int(x) for x in re.findall(r'\d+', str(m or '')) if 0 < int(x) < 25]
    return v or None

NOMS = ['log p marché', 'dérive', 'tendance', 'valeur FG', 'gain moyen ch', 'tauxV cheval',
        'musique', 'forme récente', 'poids', 'corde', 'nb victoires', 'tauxP cheval',
        'tauxV jockey', 'tauxP jockey', 'gain/part jk', 'tauxV entraîn', 'gain/part ent', 'équipement']

courses = []
for f in sorted(glob.glob('data/courses/2026-*.json')):
    d = json.load(open(f, encoding='utf-8'))
    if (d.get('type_reunion') or '').lower() != 'plat': continue
    date = os.path.basename(f)[:10]
    S = snap_pour(date)
    if not S: continue
    CH, JK, EN = S
    for c in d.get('courses', []):
        ps = [p for p in c.get('participants', []) if (num(p.get('cote')) or 0) > 1]
        gi = next((i for i, p in enumerate(ps) if num(p.get('arrivee')) == 1), None)
        if len(ps) < 5 or gi is None: continue
        inv = sum(1 / num(p['cote']) for p in ps)
        X = []
        for p in ps:
            cote, cr = num(p['cote']), num(p.get('cote_reference'))
            ch = CH.get(nom_cheval(p.get('cheval')), {})
            jkd = JK.get(clean(p.get('jockey')), {})
            end = EN.get(clean(p.get('entraineur')), {})
            mus = musique(p.get('musique'))
            t = str(p.get('cote_tendance') or '')
            nc = num(p.get('nb_courses')) or 0
            X.append([
                math.log((1 / cote) / inv),
                (cr - cote) / cr if cr and cr > 1 else 0.0,
                1.0 if '-' in t else (-1.0 if '+' in t else 0.0),
                ch.get('val') or 0, ch.get('gm') or 0,
                ch.get('tv') if ch.get('tv') is not None else 0.09,
                -np.mean(mus) if mus else -8.0,
                -np.mean(mus[:3]) if mus else -8.0,
                num(p.get('poids')) or 55.0,
                -(num(p.get('corde')) or 8.0),
                num(p.get('nb_victoires')) or 0,
                (num(p.get('nb_places')) or 0) / nc if nc >= 2 else 0.30,
                jkd.get('tv') if jkd.get('tv') is not None else 0.09,
                jkd.get('tp') if jkd.get('tp') is not None else 0.30,
                jkd.get('gp') or 0,
                end.get('tv') if end.get('tv') is not None else 0.09,
                end.get('gp') or 0,
                1.0 if str(p.get('equipement(s)') or '').strip() else 0.0,
            ])
        courses.append(dict(date=date, X=np.array(X, float), g=gi,
                            cotes=np.array([num(p['cote']) for p in ps])))

tr = [c for c in courses if c['date'] < '2026-07-01']
te = [c for c in courses if c['date'] >= '2026-07-01']
print(f"{len(courses)} courses · train {len(tr)} (avril-juin) · test {len(te)} (juillet-sept.)\n")

# standardisation sur le train uniquement
A = np.vstack([c['X'] for c in tr])
mu, sd = A.mean(0), A.std(0)
sd[sd == 0] = 1
for c in courses:
    c['Z'] = (c['X'] - mu) / sd

def negll(w, jeu, lam):
    s = 0.0
    for c in jeu:
        u = c['Z'] @ w
        u -= u.max()
        e = np.exp(u)
        s -= u[c['g']] - math.log(e.sum())
    return s / len(jeu) + lam * float(w @ w)

def top_k(jeu, w, K):
    ok = 0
    for c in jeu:
        u = c['Z'] @ w
        g = c['g']
        mieux = sum(1 for i in range(len(u)) if i != g and
                    (u[i] > u[g] or (u[i] == u[g] and c['cotes'][i] < c['cotes'][g])))
        ok += mieux < K
    return ok / len(jeu)

def top_k_marche(jeu, K):
    ok = 0
    for c in jeu:
        rang = int((c['cotes'] < c['cotes'][c['g']]).sum())
        ok += rang < K
    return ok / len(jeu)

# la régularisation est choisie sur le train seul, par découpe interne
moitie = len(tr) // 2
best = None
for lam in (0.0, 0.001, 0.01, 0.05, 0.2):
    w0 = np.zeros(len(NOMS)); w0[0] = 1.0
    r = minimize(negll, w0, args=(tr[:moitie], lam), method='L-BFGS-B')
    v = -negll(r.x, tr[moitie:], 0.0)
    if best is None or v > best[1]: best = (lam, v)
lam = best[0]
w0 = np.zeros(len(NOMS)); w0[0] = 1.0
res = minimize(negll, w0, args=(tr, lam), method='L-BFGS-B')
w = res.x
print(f"régularisation retenue sur le train : lambda = {lam}\n")

print("POIDS APPRIS — tous les leviers ajustés ensemble (variables standardisées)")
for n, v in sorted(zip(NOMS, w), key=lambda t: -abs(t[1])):
    barre = '█' * int(abs(v) * 25)
    print(f"  {n:16}{v:+7.3f}  {barre}")

print("\nRÉSULTAT HORS ÉCHANTILLON (juillet → septembre)\n")
print("  critère   modèle complet   cote seule   écart")
for K in (1, 2, 3):
    m = top_k(te, w, K)
    mc = top_k_marche(te, K)
    se = math.sqrt(m * (1 - m) / len(te)) * 100
    d = 100 * (m - mc)
    verdict = 'CAPTE' if d > 1.96 * se else ('pire' if d < -1.96 * se else 'dans le bruit')
    print(f"  Top{K}      {100*m:6.1f} %        {100*mc:6.1f} %     {d:+5.1f} ± {se:.1f}   {verdict}")

# le marché seul, comme référence de vraisemblance
wm = np.zeros(len(NOMS)); wm[0] = 1.0
print(f"\n  log-vraisemblance par course sur le test  (plus haut = mieux)")
print(f"    marché seul     {-negll(wm, te, 0.0):.4f}")
print(f"    modèle complet  {-negll(w,  te, 0.0):.4f}")

# Le marché + la dérive seule : elle porte le seul poids non négligeable.
print("\nET SI ON N'AJOUTAIT QUE LA DÉRIVE AU MARCHÉ ?\n")
print("  poids dérive   Top1 test   Top2 test   Top3 test   logL test")
for pd in (0.0, 0.05, 0.10, 0.15, 0.25, 0.40):
    wd = np.zeros(len(NOMS)); wd[0] = 1.0; wd[1] = pd
    l = -negll(wd, te, 0.0)
    print(f"  {pd:12.2f}   {100*top_k(te,wd,1):7.1f} %   {100*top_k(te,wd,2):7.1f} %   "
          f"{100*top_k(te,wd,3):7.1f} %   {l:.4f}" + ("   <- marché seul" if pd == 0 else ""))
print("\n  Le marché seul correspond à un poids de dérive nul. Si une valeur non nulle")
print("  faisait mieux sur les trois critères ET en vraisemblance, la dérive ajouterait")
print("  quelque chose.")
