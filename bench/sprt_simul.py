#!/usr/bin/env python3
"""Monte Carlo du test séquentiel de la règle — avant le premier pari.

Question du relecteur (15/09) : avec H0 = -3,7 %, H1 = +7 %, bornes ±2,94 et
~165 paris par an, combien de paris avant un verdict, quelle probabilité de
chaque verdict selon la vraie espérance, et quel drawdown à 20 € la mise ?

Cotes tirées de l'historique réel des paris de la règle (favori, LC+SC, 14+,
2022-2026) ; pour une vraie espérance E, p(gain) = (1 + E) / cote, bornée.
Incrément SPRT identique à bench/sprt_regle.mjs.

    python3 bench/sprt_simul.py
"""
import json, glob, math
import numpy as np

rng = np.random.default_rng(7)
cotes = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT' or (d['hip'] or '').upper() not in ('PARISLONGCHAMP', 'SAINT-CLOUD'): continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 14 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.03 <= inv <= 1.60): continue
        cotes.append(min(p['c'] for p in ps))
cotes = np.array(cotes)
print(f"{len(cotes)} paris historiques de la règle · cote du favori médiane {np.median(cotes):.1f}, moyenne {cotes.mean():.1f}\n")

E0, E1, BORNE = -0.037, 0.07, math.log(0.95 / 0.05)
PAR_AN, MISE, SIM = 165, 20, 20000
p_sous = lambda E, c: np.clip((1 + E) / c, 0.01, 0.99)

def simule(E_vrai, horizon_ans=6):
    N = PAR_AN * horizon_ans
    c = rng.choice(cotes, size=(SIM, N))
    gagne = rng.random((SIM, N)) < p_sous(E_vrai, c)
    p0, p1 = p_sous(E0, c), p_sous(E1, c)
    inc = np.where(gagne, np.log(p1 / p0), np.log((1 - p1) / (1 - p0)))
    S = np.cumsum(inc, axis=1)
    hit1 = np.argmax(S >= BORNE, axis=1); has1 = (S >= BORNE).any(axis=1)
    hit0 = np.argmax(S <= -BORNE, axis=1); has0 = (S <= -BORNE).any(axis=1)
    n1 = np.where(has1, hit1, N + 1); n0 = np.where(has0, hit0, N + 1)
    verdict = np.where((n1 < n0) & has1, 1, np.where(has0, 0, -1))
    n_verdict = np.minimum(n1, n0)
    # résultat financier (mise plate) et drawdown, sur les 4 premières saisons
    gains = np.where(gagne, (c - 1) * MISE, -MISE)[:, :PAR_AN * 4]
    cum = np.cumsum(gains, axis=1)
    dd = (np.maximum.accumulate(cum, axis=1) - cum).max(axis=1)
    an1 = cum[:, PAR_AN - 1]
    return dict(E=E_vrai, pH1=(verdict == 1).mean(), pH0=(verdict == 0).mean(), sans=(verdict == -1).mean(),
                un_an=(n_verdict < PAR_AN).mean(), un_an_H1=((verdict == 1) & (n_verdict < PAR_AN)).mean(), un_an_H0=((verdict == 0) & (n_verdict < PAR_AN)).mean(),
                n_med=np.median(np.where(verdict >= 0, n_verdict, N)), an1_moy=an1.mean(), an1_sd=an1.std(), an1_neg=(an1 < 0).mean(),
                dd_med=np.median(dd), dd_90=np.percentile(dd, 90))

print(f"H0 = {100*E0:+.1f} %   H1 = {100*E1:+.0f} %   bornes ±{BORNE:.2f}   {PAR_AN} paris/an   mise {MISE} €   {SIM} tirages, horizon 6 ans\n")
print("vraie espérance   P(H1)  P(H0)  sans verdict à 6 ans   verdict en 1 an (H1 / H0)   paris médian   année 1 : moy ± sd, P(<0)   drawdown 4 ans médian / 90e")
for E in (-0.037, 0.0, 0.02, 0.04, 0.07, 0.10):
    r = simule(E)
    print(f"   {100*E:+5.1f} %        {r['pH1']:5.2f}  {r['pH0']:5.2f}        {r['sans']:5.2f}             {r['un_an']:4.2f} ({r['un_an_H1']:.2f} / {r['un_an_H0']:.2f})      {r['n_med']:6.0f}        {r['an1_moy']:+6.0f} € ± {r['an1_sd']:4.0f}, {r['an1_neg']:.2f}       {r['dd_med']:5.0f} € / {r['dd_90']:5.0f} €")
print("\nLecture : aucun verdict en un an, quelle que soit la vérité. Même à +7 %, six saisons ne concluent H1 que 4 fois sur 10 ; à +2 % (espérance rétrécie),\n"
      "le test ne conclut presque jamais. σ d'un pari de la règle ≈ 1,7 unité (favori à 4,6) : l'incrément moyen de vraisemblance est de quelques millièmes par pari.\n"
      "Le test est un garde-fou de discipline (il interdit de lire entre les bornes), pas une machine à verdict. Une saison perdante est probable une fois sur trois même si la règle est vraie.")
