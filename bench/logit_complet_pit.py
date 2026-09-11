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

def cles_personne(s):
    """Formes possibles d'un nom de jockey ou d'entraineur, de la plus precise
    a la plus laxiste : « E.HARDOUIN » donne EHARDOUIN puis HARDOUIN."""
    b = str(s or '').upper().replace('(S)', '').replace('(J)', '')
    b = ''.join(c if c.isalnum() else ' ' for c in b)
    mots = [m for m in b.split() if m]
    if not mots: return []
    out = [' '.join(mots), ''.join(mots)]
    if len(mots) >= 2:
        out.append(mots[0][0] + mots[-1])
        out.append(mots[-1])
    return out

def trouve(idx, nom):
    for k in cles_personne(nom):
        if k in idx: return idx[k]
    return {}

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
    # Les classements ecrivent « ERIC HARDOUIN », les courses « E.HARDOUIN ».
    # On indexe donc AUSSI par initiale + nom de famille, faute de quoi aucun
    # jockey ne se retrouve — c'est ce qui donnait 0 % de fiabilite partout.
    for f, d in (('jockeys.csv', jk), ('entraineurs.csv', en)):
        for r in lire_csv(choisi + '/' + f):
            n = clean(r.get('Nom'))
            if not n: continue
            pa = num(r.get('Partants')) or 0
            v = dict(tv=(num(r.get('Victoires')) or 0) / pa if pa >= 20 else None,
                     tp=(num(r.get('Places')) or 0) / pa if pa >= 20 else None,
                     gp=num(r.get('Gain/Part.')) or 0)
            d[n] = v
            mots = n.split()
            if len(mots) >= 2:
                cle = mots[0][0] + mots[-1]
                d.setdefault(cle, v)          # E + HARDOUIN
                d.setdefault(mots[-1], v)     # HARDOUIN seul, dernier recours
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
        # Fiabilité de la course : part des partants dont TOUTES les infos sont
        # la — cheval retrouve au classement (donc Valeur FG datee), jockey
        # retrouve, cote de reference, musique et valeur renseignees. Un modele
        # nourri de valeurs par defaut ne peut pas etre juge comme un modele
        # nourri de donnees reelles.
        complet = 0
        for p in ps:
            ok = (nom_cheval(p.get('cheval')) in CH
                  and bool(trouve(JK, p.get('jockey')))
                  and (num(p.get('cote_reference')) or 0) > 1
                  and len(str(p.get('musique') or '')) > 3
                  and (num(p.get('valeur')) or 0) > 0)
            complet += 1 if ok else 0
        fiab = complet / len(ps)
        X = []
        for p in ps:
            cote, cr = num(p['cote']), num(p.get('cote_reference'))
            ch = CH.get(nom_cheval(p.get('cheval')), {})
            jkd = trouve(JK, p.get('jockey'))
            end = trouve(EN, p.get('entraineur'))
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
        nomc = (c.get('nom') or '').upper()
        typ = ('handicap' if 'HANDICAP' in nomc else
               'maiden'   if 'MAIDEN' in nomc else 'conditions')
        courses.append(dict(date=date, X=np.array(X, float), g=gi, np_=len(ps), fiab=fiab,
                            dist=num(c.get('distance')) or 0, typ=typ,
                            hip=''.join(ch for ch in (d.get('hippodrome') or '').upper() if ch.isalnum()),
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


# ── SEGMENTATION ────────────────────────────────────────────────────────
# Un modèle est réajusté SUR CHAQUE SEGMENT, train puis test. Chaque segment
# est un test de plus : à neuf segments, un écart à deux erreurs-types est
# attendu par le hasard une fois sur deux. Rien ici ne vaut preuve.
SEGMENTS = [
    ('distance  < 1400 m',   lambda c: c['dist'] < 1400),
    ('distance 1400-1700',   lambda c: 1400 <= c['dist'] < 1700),
    ('distance 1700-2200',   lambda c: 1700 <= c['dist'] < 2200),
    ('distance >= 2200 m',   lambda c: c['dist'] >= 2200),
    ('partants < 9',         lambda c: c['np_'] < 9),
    ('partants 9-13',        lambda c: 9 <= c['np_'] < 14),
    ('partants >= 14',       lambda c: c['np_'] >= 14),
    ('type handicap',        lambda c: c['typ'] == 'handicap'),
    ('type maiden',          lambda c: c['typ'] == 'maiden'),
    ('type conditions',      lambda c: c['typ'] == 'conditions'),
]
print("\n" + "=" * 74)
print("PAR SEGMENT — modèle réajusté sur chacun, EXPLORATOIRE\n")
print("  segment              train  test    Top1 modèle / cote    Top2 modèle / cote")
for nom, f in SEGMENTS:
    str_, ste = [c for c in tr if f(c)], [c for c in te if f(c)]
    if len(str_) < 120 or len(ste) < 120:
        print(f"  {nom:20} {len(str_):5} {len(ste):5}   — trop peu")
        continue
    w0 = np.zeros(len(NOMS)); w0[0] = 1.0
    r = minimize(negll, w0, args=(str_, 0.05), method='L-BFGS-B')
    ws = r.x
    l1, c1 = top_k(ste, ws, 1), top_k_marche(ste, 1)
    l2, c2 = top_k(ste, ws, 2), top_k_marche(ste, 2)
    se1 = math.sqrt(l1 * (1 - l1) / len(ste)) * 100
    se2 = math.sqrt(l2 * (1 - l2) / len(ste)) * 100
    d1, d2 = 100 * (l1 - c1), 100 * (l2 - c2)
    marque = lambda d, se: ' *' if d > 1.96 * se else ('  ' if d > 0 else ' -')
    # levier le plus fort hors le marché
    idx = int(np.argmax(np.abs(ws[1:]))) + 1
    print(f"  {nom:20} {len(str_):5} {len(ste):5}   "
          f"{100*l1:5.1f} / {100*c1:5.1f}  {d1:+5.1f}{marque(d1,se1)}  "
          f"{100*l2:5.1f} / {100*c2:5.1f}  {d2:+5.1f}{marque(d2,se2)}   "
          f"[{NOMS[idx]} {ws[idx]:+.2f}]")
print("\n  * = écart positif au-delà de deux erreurs-types.  Dix segments testés :")
print("  un tel écart est attendu par le hasard environ une fois sur deux.")


# ── TON TERRAIN ─────────────────────────────────────────────────────────
# Longchamp compte 187 courses depuis avril : bien trop peu pour y ajuster
# dix-huit parametres. On fait donc l'inverse, qui est plus puissant — on
# apprend sur TOUT LE RESTE, et l'on teste la-bas. Si le modele y gagnait
# quelque chose que la cote n'a pas, cela se verrait ici sans surapprentissage
# local possible.
def roi_top1(jeu, w):
    """ROI d'une mise plate sur le n1 du modele, dividende = cote, plancher 1,10."""
    g = []
    for c in jeu:
        u = c['Z'] @ w
        i = int(np.argmax(u))
        g.append(max(1.10, c['cotes'][i]) if i == c['g'] else 0.0)
    g = np.array(g)
    return 100 * (g.mean() - 1), 100 * g.std(ddof=0) / math.sqrt(len(g))

def roi_favori(jeu):
    g = []
    for c in jeu:
        i = int(np.argmin(c['cotes']))
        g.append(max(1.10, c['cotes'][i]) if i == c['g'] else 0.0)
    g = np.array(g)
    return 100 * (g.mean() - 1), 100 * g.std(ddof=0) / math.sqrt(len(g))

PREM = ['LONGCHAMP', 'SAINTCLOUD', 'CHANTILLY', 'FONTAINEBLEAU', 'DEAUVILLE', 'LYONPARILLY']
CIBLES = [
    ('Longchamp',            lambda c: 'LONGCHAMP' in c['hip']),
    ('Longchamp+St-Cloud',   lambda c: 'LONGCHAMP' in c['hip'] or 'SAINTCLOUD' in c['hip']),
    ('les 7 premium',        lambda c: any(x in c['hip'] for x in PREM)),
]
print("\n" + "=" * 74)
print("TON TERRAIN — modele appris AILLEURS, teste ici\n")
for nom, f in CIBLES:
    ici = [c for c in courses if f(c)]
    ailleurs = [c for c in courses if not f(c)]
    if len(ici) < 100: 
        print(f"  {nom} — trop peu ({len(ici)})"); continue
    w0 = np.zeros(len(NOMS)); w0[0] = 1.0
    r = minimize(negll, w0, args=(ailleurs, 0.05), method='L-BFGS-B')
    ws = r.x
    t1, c1 = top_k(ici, ws, 1), top_k_marche(ici, 1)
    t2, c2 = top_k(ici, ws, 2), top_k_marche(ici, 2)
    se1 = math.sqrt(t1 * (1 - t1) / len(ici)) * 100
    rm, rms = roi_top1(ici, ws)
    rf, rfs = roi_favori(ici)
    idx = int(np.argmax(np.abs(ws[1:]))) + 1
    print(f"  {nom}  ({len(ici)} courses ici, {len(ailleurs)} pour apprendre)")
    print(f"    Top1   modele {100*t1:5.1f} %   cote {100*c1:5.1f} %   ecart {100*(t1-c1):+5.1f} ± {se1:.1f}")
    print(f"    Top2   modele {100*t2:5.1f} %   cote {100*c2:5.1f} %   ecart {100*(t2-c2):+5.1f}")
    print(f"    ROI    modele {rm:+6.1f} % ± {rms:.1f}   favori {rf:+6.1f} % ± {rfs:.1f}")
    print(f"    levier dominant hors marche : {NOMS[idx]} {ws[idx]:+.2f}\n")


# ── FIABILITE DES DONNEES ───────────────────────────────────────────────
# Un modele nourri de valeurs par defaut ne peut pas etre juge comme un modele
# nourri de donnees reelles. On mesure donc la part des partants dont TOUTES
# les infos sont presentes, et l'on regarde si le modele se comporte mieux la
# ou il est bien nourri.
PREM7 = ['LONGCHAMP', 'SAINTCLOUD', 'CHANTILLY', 'FONTAINEBLEAU', 'DEAUVILLE', 'LYONPARILLY']
prem = [c for c in courses if any(x in c['hip'] for x in PREM7)]
print("\n" + "=" * 74)
print("FIABILITE DES DONNEES — courses premium\n")
fi = np.array([c['fiab'] for c in prem])
print(f"  {len(prem)} courses premium · fiabilite moyenne {100*fi.mean():.1f} %")
for lo, hi, lib in [(0, .5, '< 50 %'), (.5, .8, '50-80 %'), (.8, .999, '80-100 %'), (.999, 1.01, '100 %')]:
    n = int(((fi >= lo) & (fi < hi)).sum())
    print(f"    {lib:9} {n:5} courses ({100*n/len(prem):4.1f} %)")

print("\n  Modele appris sur les NON-premium, teste sur les premium par niveau\n")
autres = [c for c in courses if not any(x in c['hip'] for x in PREM7)]
w0 = np.zeros(len(NOMS)); w0[0] = 1.0
wp = minimize(negll, w0, args=(autres, 0.05), method='L-BFGS-B').x
print("  fiabilite   courses   Top1 modele / cote     ROI modele / favori")
for lo, hi, lib in [(0, .8, 'sous 80 %'), (.8, 1.01, '80 % et plus'), (.999, 1.01, '100 % strict')]:
    seg = [c for c in prem if lo <= c['fiab'] < hi]
    if len(seg) < 100:
        print(f"  {lib:12}{len(seg):7}   — trop peu"); continue
    t1, c1 = top_k(seg, wp, 1), top_k_marche(seg, 1)
    se = math.sqrt(t1 * (1 - t1) / len(seg)) * 100
    rm, rms = roi_top1(seg, wp)
    rf, rfs = roi_favori(seg)
    print(f"  {lib:12}{len(seg):7}   {100*t1:5.1f} / {100*c1:5.1f}  {100*(t1-c1):+5.1f} ± {se:.1f}   "
          f"{rm:+6.1f} ± {rms:.1f}  /  {rf:+6.1f} ± {rfs:.1f}")
print("\n  Le favori sert de reference : s'il rend deja plus la ou les donnees sont")
print("  completes, c'est la course qui est differente, pas le modele qui est meilleur.")


# ── LA FIABILITE EST-ELLE UN PROXY ? ────────────────────────────────────
# Le favori rend +10,7 % la ou les donnees sont completes contre -13,0 %
# ailleurs. Avant d'y voir un effet de la qualite des donnees, il faut
# eliminer l'explication banale : une course dont tous les partants ont une
# musique et une valeur n'est pas une course au hasard, c'est une course de
# chevaux etablis. La fiabilite pourrait n'etre qu'un deguisement du type de
# course, ou de l'age des partants.
print("\n" + "=" * 74)
print("LA FIABILITE EST-ELLE UN PROXY D'AUTRE CHOSE ?\n")
hauts = [c for c in prem if c['fiab'] >= .8]
bas   = [c for c in prem if c['fiab'] <  .8]
def part(jeu, f): return 100 * sum(1 for c in jeu if f(c)) / max(1, len(jeu))
print("  caracteristique              donnees >=80 %   donnees <80 %")
for lib, f in [('type maiden',        lambda c: c['typ'] == 'maiden'),
               ('type handicap',      lambda c: c['typ'] == 'handicap'),
               ('type conditions',    lambda c: c['typ'] == 'conditions'),
               ('distance < 1400 m',  lambda c: c['dist'] < 1400),
               ('partants >= 14',     lambda c: c['np_'] >= 14)]:
    print(f"  {lib:28}{part(hauts,f):8.1f} %      {part(bas,f):8.1f} %")

print("\n  ROI DU FAVORI, a type de course FIXE\n")
print("  segment                    donnees >=80 %          donnees <80 %")
for lib, f in [('toutes',           lambda c: True),
               ('conditions seul',  lambda c: c['typ'] == 'conditions'),
               ('maiden exclu',     lambda c: c['typ'] != 'maiden')]:
    a = [c for c in hauts if f(c)]; b = [c for c in bas if f(c)]
    if len(a) < 60 or len(b) < 60:
        print(f"  {lib:26}— trop peu ({len(a)} / {len(b)})"); continue
    ra, sa = roi_favori(a); rb, sb = roi_favori(b)
    d = ra - rb; sd = math.sqrt(sa**2 + sb**2)
    print(f"  {lib:26}{ra:+6.1f} % ± {sa:4.1f} (n={len(a)})   {rb:+6.1f} % ± {sb:4.1f} (n={len(b)})"
          f"   ecart {d:+5.1f} ± {sd:.1f}" + ("  <- tient" if abs(d) > 1.96*sd else "  <- bruit"))

print("\n  ET LA MEME CHOSE SUR LES NON-PREMIUM, ou l'echantillon est six fois plus gros\n")
ha = [c for c in autres if c['fiab'] >= .8]; ba = [c for c in autres if c['fiab'] < .8]
ra, sa = roi_favori(ha); rb, sb = roi_favori(ba)
d = ra - rb; sd = math.sqrt(sa**2 + sb**2)
print(f"  donnees >=80 %  {ra:+6.1f} % ± {sa:.1f}  (n={len(ha)})")
print(f"  donnees <80 %   {rb:+6.1f} % ± {sb:.1f}  (n={len(ba)})")
print(f"  ecart           {d:+6.1f} ± {sd:.1f}" + ("   <- TIENT" if abs(d) > 1.96*sd else "   <- dans le bruit"))


# ── LE CONTROLE DECISIF : a taille de champ FIXEE ───────────────────────
# 39 % des courses a donnees completes ont 14 partants ou plus, contre 5 % des
# autres. La « fiabilite » pourrait n'etre qu'un deguisement de la taille du
# champ, qui change tout par ailleurs. A taille fixee, l'ecart survit-il ?
print("\n" + "=" * 74)
print("ROI DU FAVORI A TAILLE DE CHAMP FIXEE — premium\n")
print("  champ            donnees >=80 %           donnees <80 %            ecart")
for lib, f in [('< 9 partants',  lambda c: c['np_'] < 9),
               ('9 a 13',        lambda c: 9 <= c['np_'] < 14),
               ('14 et plus',    lambda c: c['np_'] >= 14)]:
    a = [c for c in prem if c['fiab'] >= .8 and f(c)]
    b = [c for c in prem if c['fiab'] <  .8 and f(c)]
    if len(a) < 40 or len(b) < 40:
        print(f"  {lib:16}n={len(a):4} / {len(b):4}   — trop peu pour comparer"); continue
    ra, sa = roi_favori(a); rb, sb = roi_favori(b)
    d = ra - rb; sd = math.sqrt(sa**2 + sb**2)
    print(f"  {lib:16}{ra:+6.1f} % ± {sa:4.1f} (n={len(a):3})   {rb:+6.1f} % ± {sb:4.1f} (n={len(b):3})"
          f"   {d:+5.1f} ± {sd:.1f}" + ("  <- tient" if abs(d) > 1.96*sd else "  <- bruit"))

print("\n  ET L'EFFET DE LA TAILLE DE CHAMP SEULE, sans regarder la fiabilite\n")
print("  champ            premium                  non-premium")
for lib, f in [('< 9 partants',  lambda c: c['np_'] < 9),
               ('9 a 13',        lambda c: 9 <= c['np_'] < 14),
               ('14 et plus',    lambda c: c['np_'] >= 14)]:
    a = [c for c in prem if f(c)]; b = [c for c in autres if f(c)]
    ra, sa = roi_favori(a) if len(a) >= 40 else (float('nan'), 0)
    rb, sb = roi_favori(b) if len(b) >= 40 else (float('nan'), 0)
    print(f"  {lib:16}{ra:+6.1f} % ± {sa:4.1f} (n={len(a):3})   {rb:+6.1f} % ± {sb:4.1f} (n={len(b):4})")
