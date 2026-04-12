#!/usr/bin/env python3
"""
DIAGNOSTIC: La derive de cote (cote_reference -> cote) a-t-elle
un pouvoir predictif ORTHOGONAL a la cote finale ?

Question: quand la cote BAISSE entre ouverture et depart (money coming in),
le cheval gagne-t-il plus souvent que ce que predit sa cote finale ?

Si OUI -> feature interessante, a integrer au scoring.
Si NON -> le marche a deja digere le signal, inutile.

Methodo:
1. Pour chaque participant: derive = log(cote_finale / cote_reference)
   - derive < 0 : cote baisse = argent entre (support)
   - derive > 0 : cote monte = argent sort (abandon)
2. Binner par quartile de derive, mesurer le taux de victoire reel
   vs attendu par la cote finale (proba implicite = 1/cote).
3. Calcul du LIFT par bin: taux_reel / taux_attendu.
   Lift > 1 = le bin surperforme son attente marche.

Sortie: tableau par bin + regression simple de calibration.

Usage: python3 scripts/diagnostic_derive_cote.py
"""

import json
import glob
import os
import re
import math
from collections import defaultdict
from math import sqrt, log

HIPPODROMES_PARIS = ["saint-cloud", "chantilly", "fontainebleau",
                     "parislongchamp", "longchamp"]
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "courses")


def wilson_ic(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d
    return (max(0.0, c - m), min(1.0, c + m))


def collect_participants():
    """Extrait chaque participant des courses Paris 2026 avec:
    - cote_finale, cote_reference, arrivee (1 si gagnant sinon 0)
    """
    rows = []
    files = sorted(glob.glob(os.path.join(DATA_DIR, "2026-*.json")))
    files_paris = [f for f in files
                   if any(h in os.path.basename(f).lower() for h in HIPPODROMES_PARIS)]

    for fp in files_paris:
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        for course in data.get("courses", []):
            # Ne prendre que les courses avec arrivee definitive
            if not course.get("arrivee_definitive"):
                continue
            for p in course.get("participants", []):
                try:
                    cote = float(p.get("cote", 0))
                    ref = float(p.get("cote_reference", 0))
                except (ValueError, TypeError):
                    continue
                if cote <= 0 or ref <= 0:
                    continue
                arr = p.get("arrivee")
                if arr is None:
                    continue
                rows.append({
                    "cote": cote,
                    "cote_ref": ref,
                    "derive": log(cote / ref),  # negative = baisse = money in
                    "gagnant": 1 if arr == 1 else 0,
                    "place_top3": 1 if isinstance(arr, int) and arr <= 3 else 0,
                })
    return rows


def analyse_par_bin(rows, n_bins=4):
    """Binne par quartile de derive, compare taux reel vs attendu marche."""
    if not rows:
        return

    # Trier par derive
    sorted_rows = sorted(rows, key=lambda r: r["derive"])
    bin_size = len(sorted_rows) // n_bins

    print(f"\n{'='*80}")
    print(f"ANALYSE PAR QUARTILE DE DERIVE (n_bins={n_bins})")
    print(f"{'='*80}")
    print(f"derive = log(cote_finale / cote_reference)")
    print(f"  derive < 0 -> cote BAISSE (money in, support du marche)")
    print(f"  derive > 0 -> cote MONTE (money out, abandon du marche)")
    print()
    print(f"{'Bin':<20} {'N':>5} {'Win%':>7} {'Attendu%':>9} {'Lift':>6} {'IC95':>18}")
    print("-" * 80)

    for i in range(n_bins):
        start = i * bin_size
        end = (i + 1) * bin_size if i < n_bins - 1 else len(sorted_rows)
        bin_rows = sorted_rows[start:end]
        if not bin_rows:
            continue
        n = len(bin_rows)
        wins = sum(r["gagnant"] for r in bin_rows)
        # Taux de victoire attendu = moyenne de 1/cote sur le bin
        expected = sum(1.0 / r["cote"] for r in bin_rows) / n
        actual = wins / n
        lift = actual / expected if expected > 0 else 0
        lo, hi = wilson_ic(wins, n)

        derive_min = bin_rows[0]["derive"]
        derive_max = bin_rows[-1]["derive"]
        label = f"Q{i+1} [{derive_min:+.2f},{derive_max:+.2f}]"
        print(f"{label:<20} {n:>5} {actual*100:>6.1f}% {expected*100:>8.1f}% {lift:>5.2f}  [{lo*100:>4.1f}%-{hi*100:>4.1f}%]")

    print()
    print("LECTURE:")
    print("  Q1 (derive la plus negative) = chevaux dont la cote A LE PLUS BAISSE")
    print("  Si Lift Q1 > Lift Q4 de facon nette ET les IC ne se chevauchent pas,")
    print("  -> la derive a une information orthogonale a la cote finale.")
    print("  Si Lifts ~= 1.0 partout -> le marche a deja digere l'info, pas d'edge.")


def regression_logistique_simple(rows):
    """Regression logistique: P(win) = logit(a*log(1/cote) + b*derive + c).
    On veut savoir si b est significatif APRES avoir controle pour la cote.

    Implementation simple via gradient descent (pas de scipy requis).
    """
    if not rows:
        return

    # Features
    X1 = [log(1.0 / r["cote"]) for r in rows]  # log-odds implicite marche
    X2 = [r["derive"] for r in rows]
    y = [r["gagnant"] for r in rows]
    n = len(rows)

    # Standardiser X1 et X2 pour stabilite
    def mean_std(xs):
        m = sum(xs) / len(xs)
        v = sum((x - m) ** 2 for x in xs) / len(xs)
        return m, math.sqrt(v) if v > 0 else 1.0

    m1, s1 = mean_std(X1)
    m2, s2 = mean_std(X2)
    X1s = [(x - m1) / s1 for x in X1]
    X2s = [(x - m2) / s2 for x in X2]

    # Gradient descent basique, 2000 iter, lr=0.05
    a, b, c = 0.0, 0.0, 0.0
    lr = 0.05
    for _ in range(2000):
        ga = gb = gc = 0.0
        for i in range(n):
            z = a * X1s[i] + b * X2s[i] + c
            # sigmoid stable
            if z >= 0:
                ez = math.exp(-z)
                p = 1.0 / (1.0 + ez)
            else:
                ez = math.exp(z)
                p = ez / (1.0 + ez)
            err = p - y[i]
            ga += err * X1s[i]
            gb += err * X2s[i]
            gc += err
        a -= lr * ga / n
        b -= lr * gb / n
        c -= lr * gc / n

    # Estimation erreur standard par bootstrap (simple, 200 samples)
    import random
    random.seed(42)
    bs_b = []
    for _ in range(200):
        sample_idx = [random.randrange(n) for _ in range(n)]
        a2, b2, c2 = a, b, c  # warm start
        for _ in range(300):
            ga = gb = gc = 0.0
            for i in sample_idx:
                z = a2 * X1s[i] + b2 * X2s[i] + c2
                if z >= 0:
                    p = 1.0 / (1.0 + math.exp(-z))
                else:
                    ez = math.exp(z)
                    p = ez / (1.0 + ez)
                err = p - y[i]
                ga += err * X1s[i]
                gb += err * X2s[i]
                gc += err
            a2 -= lr * ga / n
            b2 -= lr * gb / n
            c2 -= lr * gc / n
        bs_b.append(b2)
    bs_b.sort()
    b_lo = bs_b[int(0.025 * len(bs_b))]
    b_hi = bs_b[int(0.975 * len(bs_b))]

    print(f"\n{'='*80}")
    print("REGRESSION LOGISTIQUE: P(win) ~ log(1/cote) + derive")
    print(f"{'='*80}")
    print(f"N = {n} participants")
    print(f"Coefficient cote      (log(1/cote) standardise) : {a:+.3f}")
    print(f"Coefficient DERIVE    (derive standardisee)     : {b:+.3f}")
    print(f"  IC 95% bootstrap sur DERIVE : [{b_lo:+.3f}, {b_hi:+.3f}]")
    print(f"  Intercept : {c:+.3f}")
    print()
    if b_lo > 0:
        print(">>> DERIVE a un effet POSITIF significatif. Mais signe attendu = NEGATIF")
        print("    (derive negative = cote baisse = doit faire MONTER la proba de gagner).")
        print("    Signe positif = contre-intuitif, verifier.")
    elif b_hi < 0:
        print(">>> DERIVE a un effet NEGATIF significatif apres controle de la cote.")
        print("    C-a-d: cote qui baisse -> gagne + souvent que la cote finale ne le dit.")
        print("    -> Feature ORTHOGONALE exploitable. A integrer avec poids modere.")
    else:
        print(">>> DERIVE NON significatif apres controle de la cote finale.")
        print("    -> L'info est deja dans la cote, pas d'edge a en tirer.")
        print("    -> NE PAS integrer au scoring.")


def analyse_derives_extremes(rows, threshold=0.3):
    """Zoom sur les chevaux a dérive extrême (>30% de variation)."""
    strong_drops = [r for r in rows if r["derive"] < -threshold]  # cote /1.35+
    strong_rises = [r for r in rows if r["derive"] > threshold]

    print(f"\n{'='*80}")
    print(f"CHEVAUX A DERIVE EXTREME (|derive| > {threshold:.2f})")
    print(f"{'='*80}")

    for label, subset in [("BAISSE FORTE (support marche)", strong_drops),
                          ("HAUSSE FORTE (abandon marche)", strong_rises)]:
        n = len(subset)
        if n == 0:
            print(f"{label}: aucun")
            continue
        wins = sum(r["gagnant"] for r in subset)
        expected = sum(1.0 / r["cote"] for r in subset) / n if n else 0
        actual = wins / n if n else 0
        lift = actual / expected if expected > 0 else 0
        lo, hi = wilson_ic(wins, n)
        print(f"{label}:")
        print(f"  N={n}  Win%={actual*100:.1f}%  Attendu%={expected*100:.1f}%  Lift={lift:.2f}")
        print(f"  IC95 Wilson: [{lo*100:.1f}%, {hi*100:.1f}%]")


def main():
    print("=" * 80)
    print("DIAGNOSTIC DERIVE DE COTE - Paris 2026")
    print("=" * 80)
    rows = collect_participants()
    print(f"\n{len(rows)} participants extraits avec cote + cote_reference + arrivee")

    if len(rows) < 50:
        print("\nERREUR: trop peu de donnees pour conclure.")
        return

    # 1. Par quartile
    analyse_par_bin(rows, n_bins=4)

    # 2. Extremes
    analyse_derives_extremes(rows, threshold=0.3)

    # 3. Regression logistique
    regression_logistique_simple(rows)

    print(f"\n{'='*80}")
    print("VERDICT")
    print(f"{'='*80}")
    print("Regarde le coefficient DERIVE dans la regression logistique.")
    print("  - Si IC 95% ne contient PAS 0 et signe NEGATIF -> integrer au scoring.")
    print("  - Si IC 95% contient 0 -> ne pas integrer, l'info est deja dans la cote.")
    print()
    print("Regarde aussi le lift Q1 vs Q4 dans l'analyse par quartile.")
    print("  - Lift Q1 > 1.15 ET Lift Q4 < 0.85 = signal clair.")
    print("  - Tous les lifts autour de 1.0 = pas d'info exploitable.")


if __name__ == "__main__":
    main()
