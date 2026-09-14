#!/usr/bin/env python3
"""La cote juste : proba réelle de gagner, sachant la cote ET le contexte.

Ce n'est PAS un classement des chevaux (la grille, « ma cote » : ils ne battent
pas le marché). C'est un CALIBRAGE : le marché donne 1/cote, et on mesure où il
se trompe de façon répétée — biais favori/outsider, taille du champ, dérive,
âge, corde, hippodrome, catégorie. Peu de paramètres, choisis d'avance : les
biais mesurés dans bench/calibrage_cotes.py et bench/outsiders_profil.py.

  p_juste = logit(a + b·log(p_marché) + c·log(p_marché)² + termes de contexte)
  cote juste = 1 / p_juste
  espérance  = p_juste × cote PMU − 1        → PLAY si > seuil, sinon PASSE

Appris sur 2022-2024, jugé sur 2025-2026 (jamais vu). Dividendes réels.

    python3 bench/cote_juste.py
"""
import json, glob, math, collections
import numpy as np
from sklearn.linear_model import LogisticRegression

rap = {}
for f in glob.glob('data/rapports/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rap[(d['date'], d['hip'], d['r'], d['c'])] = {x['comb']: x['div'] / 100 for x in d['paris'].get('E_SIMPLE_GAGNANT', [])}
PREMIUM = {'PARISLONGCHAMP', 'SAINT-CLOUD', 'CHANTILLY', 'DEAUVILLE', 'FONTAINEBLEAU', 'LYON-PARILLY'}
rows = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        sg = rap.get((d['date'], d['hip'], d['r'], d['c'])) or {}
        fav = min(p['c'] for p in ps); n = len(ps); hip = (d['hip'] or '').upper()
        txt = ((d.get('cat') or '') + ' ' + (d.get('lib') or '')).upper()
        for p in ps:
            pm = (1 / p['c']) / inv
            der = (p['c'] - p['cr']) / p['cr'] if p.get('cr') and p['cr'] > 1 else 0.0
            co = p.get('co') or 0
            rows.append(dict(
                date=d['date'], hip=hip, cote=p['c'], win=p.get('a') == 1, div=sg.get(str(p['n']), p['c']),
                x=[math.log(pm), math.log(pm) ** 2,
                   1.0 if p['c'] == fav else 0.0,
                   1.0 if p['c'] == fav and n >= 14 else 0.0, 1.0 if p['c'] == fav and n <= 9 else 0.0,
                   1.0 if p['c'] == fav and 4 <= p['c'] < 6 else 0.0, 1.0 if p['c'] == fav and 2.5 <= p['c'] < 4 else 0.0,
                   1.0 if der <= -0.2 else 0.0, 1.0 if der >= 0.3 else 0.0,
                   1.0 if p.get('ag') in (5, 6) else 0.0, 1.0 if p.get('ag') == 3 else 0.0,
                   1.0 if co >= 12 else 0.0, 1.0 if 1 <= co <= 3 else 0.0,
                   1.0 if hip in PREMIUM else 0.0, 1.0 if hip in ('PARISLONGCHAMP', 'SAINT-CLOUD') else 0.0,
                   1.0 if 'HANDICAP' in txt else 0.0, math.log(n)]))
NOMS = ['log p marché', 'log p marché²', 'favori', 'favori × champ 14+', 'favori × champ ≤ 9', 'favori × cote 4-6', 'favori × cote 2,5-4',
        'baisse forte −20 %', 'hausse forte +30 %', 'âge 5-6', 'âge 3', 'corde ≥ 12', 'corde 1-3', 'hippodrome premium', 'Longchamp/Saint-Cloud', 'handicap', 'log partants']
X = np.array([r['x'] for r in rows]); y = np.array([r['win'] for r in rows]); dates = np.array([r['date'] for r in rows])
tr = dates < '2025-01-01'; te = ~tr
print(f"{len(rows)} chevaux · apprentissage {tr.sum()} (2022-2024) · test {te.sum()} (2025-2026)\n")

m0 = LogisticRegression(C=10, max_iter=2000).fit(X[tr][:, :2], y[tr])       # marché seul, recalibré
m1 = LogisticRegression(C=10, max_iter=2000).fit(X[tr], y[tr])               # marché + contexte
p0 = m0.predict_proba(X[:, :2])[:, 1]; p1 = m1.predict_proba(X)[:, 1]
def ll(p, mask): return np.mean(y[mask] * np.log(p[mask]) + (1 - y[mask]) * np.log(1 - p[mask]))
print("Log-vraisemblance par cheval, test :   marché recalibré %.5f   marché + contexte %.5f   (Δ %+.5f)" % (ll(p0, te), ll(p1, te), ll(p1, te) - ll(p0, te)))
print("\nPoids appris (marché + contexte) — signe = sens de la correction :")
for n_, w in sorted(zip(NOMS, m1.coef_[0]), key=lambda t: -abs(t[1])): print(f"   {n_:24s} {w:+.3f}")

# ── PLAY / PASSE sur le test : espérance = p_juste × dividende attendu − 1
cote = np.array([r['cote'] for r in rows]); div = np.array([r['div'] for r in rows]); hip = np.array([r['hip'] for r in rows])
gain = np.where(y, div - 1, -1.0)
def ligne(lib, mask):
    n = mask.sum()
    if n < 30: print(f"   {lib:56s} n={n} (trop peu)"); return
    g = gain[mask]
    print(f"   {lib:56s} ROI {100*g.mean():+6.1f} % ± {100*g.std(ddof=1)/math.sqrt(n):4.1f}   n={n:6d}   touche {100*y[mask].mean():4.1f} %   p_juste moy {100*p1[mask].mean():4.1f} %")
for lib, p in [('marché recalibré (cote seule)', p0), ('marché + contexte (la cote juste)', p1)]:
    esp = p * cote - 1
    print(f"\n══ {lib} — test 2025-2026, simple gagnant, dividendes réels")
    ligne('tous les chevaux (référence)', te)
    for s in (0.0, 0.05, 0.10, 0.20):
        ligne(f'PLAY si espérance ≥ {100*s:+.0f} %', te & (esp >= s))
    ligne('PLAY si espérance ≥ 0 ET cote < 10', te & (esp >= 0) & (cote < 10))
    ligne('PLAY si espérance ≥ 0 ET favori', te & (esp >= 0) & (X[:, 2] == 1))
    ligne('PLAY si espérance ≥ 0, Longchamp', te & (esp >= 0) & (hip == 'PARISLONGCHAMP'))
    ligne('PASSE (espérance < 0) — ce qu\'on évite', te & (esp < 0))

# ── calibrage de p_juste sur le test : par tranche de p_juste, proba réelle
print("\n══ p_juste est-elle juste ? (test) — par tranche de p_juste, part réelle de gagnants")
for lo, hi in [(0, .03), (.03, .06), (.06, .10), (.10, .15), (.15, .20), (.20, .30), (.30, .45), (.45, 1)]:
    m = te & (p1 >= lo) & (p1 < hi)
    if m.sum() < 100: continue
    print(f"   p_juste {100*lo:4.0f}-{100*hi:3.0f} %   {m.sum():6d} chevaux   réel {100*y[m].mean():5.1f} %   p_juste moy {100*p1[m].mean():5.1f} %   marché moy {100*(1/cote[m]).mean():5.1f} %")

# ── exemple : à quoi ressemble la sortie pour un joueur
print("\n══ exemple de sortie « carte » : dernière réunion de Longchamp du test")
last = max(r['date'] for r in rows if r['hip'] == 'PARISLONGCHAMP')
idx = [i for i, r in enumerate(rows) if r['hip'] == 'PARISLONGCHAMP' and r['date'] == last]
print(f"   {last} — {len(idx)} chevaux")
for i in sorted(idx, key=lambda i: cote[i])[:12]:
    e = p1[i] * cote[i] - 1
    print(f"   cote {cote[i]:5.1f}   marché {100/cote[i]:5.1f} %   p_juste {100*p1[i]:5.1f} %   cote juste {1/p1[i]:5.1f}   espérance {100*e:+6.1f} %   {'PLAY' if e >= 0 else 'passe':5s}   {'✓ gagné' if y[i] else ''}")
