#!/usr/bin/env python3
"""La règle (LC+SC, 14+, favori) filtrée par la cote juste : mieux ?

Question posée par l'écran du 13/09 : PRECIOSO, règle JOUE, cote juste « passe »
(-13 %). Écrit avant de regarder : dans le cadre de la règle, comparer les paris
où la cote juste dit PLAY (espérance >= 0) et ceux où elle dit passe.
Modèle appris sur 2022-2024 ; la seule mesure qui compte est 2025-2026.
Dividendes réels.

    python3 bench/regle_x_cote_juste.py
"""
import json, glob, math
import numpy as np
from sklearn.linear_model import LogisticRegression
exec(open('bench/cote_juste.py').read().split("m0 = LogisticRegression")[0])   # charge rows, X, y, dates, tr, te, NOMS (même construction)
m1 = LogisticRegression(C=10, max_iter=2000).fit(X[tr], y[tr]); p1 = m1.predict_proba(X)[:, 1]
cote = np.array([r['cote'] for r in rows]); div = np.array([r['div'] for r in rows]); hip = np.array([r['hip'] for r in rows])
gain = np.where(y, div - 1, -1.0); esp = p1 * cote - 1
fav = X[:, 2] == 1; n14 = X[:, 16] >= math.log(14) - 1e-9   # log partants
cadre = fav & n14 & np.isin(hip, ['PARISLONGCHAMP', 'SAINT-CLOUD'])
def ligne(lib, m):
    n = m.sum()
    if n < 20: print(f"   {lib:52s} n={n} (trop peu)"); return
    g = gain[m]; print(f"   {lib:52s} ROI {100*g.mean():+6.1f} % ± {100*g.std(ddof=1)/math.sqrt(n):4.1f}   n={n:4d}   touche {100*y[m].mean():4.1f} %   esp. moy. cote juste {100*esp[m].mean():+5.1f} %")
for per, mask, lib in [('2025-2026 (test, seule mesure valide)', te, 'TEST'), ('2022-2024 (appris dessus, pour référence)', tr, 'TRAIN')]:
    print(f"\n══ {per} — la règle : favori, simple gagnant, Longchamp + Saint-Cloud, 14 partants et plus")
    ligne('la règle, tous ses paris', cadre & mask)
    ligne('   dont cote juste PLAY (espérance ≥ 0)', cadre & mask & (esp >= 0))
    ligne('   dont cote juste passe (espérance < 0)', cadre & mask & (esp < 0))
    ligne('   dont cote juste passe fort (espérance < −10 %)', cadre & mask & (esp < -0.10))
    ligne('   dont cote juste ≥ +5 %', cadre & mask & (esp >= 0.05))
