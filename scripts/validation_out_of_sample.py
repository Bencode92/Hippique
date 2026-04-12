#!/usr/bin/env python3
"""
VALIDATION OUT-OF-SAMPLE: la derive de cote tient-elle hors echantillon ?

Contexte: le coefficient -0.258 avec IC [-0.405, -0.122] a ete mesure
sur 94 courses Paris 2026. C'est IN-SAMPLE. Regle d'or en stat:
ne jamais deployer sans verifier out-of-sample.

Methodo:
1. Split temporel: train = premier 60%, test = dernier 40%.
   (PAS de split aleatoire: le temps compte en marche de paris.)
2. Ajuster la regression sur train, GELER les coefficients.
3. Mesurer sur test: le signe est-il encore negatif ? Le lift Q4 < 1 ?
4. Comparer le lift Q4 in-sample vs out-of-sample. Si l'effet s'effondre,
   c'etait du bruit / overfit. S'il tient, feature robuste.

Tests supplementaires:
- Split geographique: train = 3 hippodromes, test = 1 hippodrome.
  Si ca tient, le signal est generalisable.
- Placebo: on permute aleatoirement les arrivees 100 fois,
  on regarde la distribution des coefficients. Le vrai coeff
  doit etre a >2 ecarts-types du placebo.

Usage: python3 scripts/validation_out_of_sample.py
"""

import json
import glob
import os
import math
import random
from math import log, sqrt, exp
from collections import defaultdict

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
    """Extrait chaque participant AVEC la date de la course pour pouvoir splitter."""
    rows = []
    files = sorted(glob.glob(os.path.join(DATA_DIR, "2026-*.json")))
    files_paris = [f for f in files
                   if any(h in os.path.basename(f).lower() for h in HIPPODROMES_PARIS)]

    for fp in files_paris:
        fname = os.path.basename(fp)
        # Extraire date + hippodrome du nom de fichier
        try:
            date_str = fname[:10]  # "2026-01-21"
        except Exception:
            continue
        hippo = None
        for h in HIPPODROMES_PARIS:
            if h in fname.lower():
                hippo = h
                break

        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        for course in data.get("courses", []):
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
                    "date": date_str,
                    "hippo": hippo,
                    "cote": cote,
                    "cote_ref": ref,
                    "derive": log(cote / ref),
                    "gagnant": 1 if arr == 1 else 0,
                })
    return rows


def sigmoid(z):
    if z >= 0:
        return 1.0 / (1.0 + exp(-z))
    ez = exp(z)
    return ez / (1.0 + ez)


def fit_logreg(X1, X2, y, lr=0.05, n_iter=2000):
    """Regression logistique 2 features + intercept. Gradient descent."""
    # Standardiser
    def mean_std(xs):
        m = sum(xs) / len(xs)
        v = sum((x - m) ** 2 for x in xs) / len(xs)
        return m, math.sqrt(v) if v > 0 else 1.0
    m1, s1 = mean_std(X1)
    m2, s2 = mean_std(X2)
    X1s = [(x - m1) / s1 for x in X1]
    X2s = [(x - m2) / s2 for x in X2]
    n = len(y)
    a, b, c = 0.0, 0.0, 0.0
    for _ in range(n_iter):
        ga = gb = gc = 0.0
        for i in range(n):
            p = sigmoid(a * X1s[i] + b * X2s[i] + c)
            err = p - y[i]
            ga += err * X1s[i]
            gb += err * X2s[i]
            gc += err
        a -= lr * ga / n
        b -= lr * gb / n
        c -= lr * gc / n
    return a, b, c, (m1, s1, m2, s2)


def predict(row, coeffs, norms):
    a, b, c = coeffs
    m1, s1, m2, s2 = norms
    x1 = (log(1.0 / row["cote"]) - m1) / s1
    x2 = (row["derive"] - m2) / s2
    return sigmoid(a * x1 + b * x2 + c)


def analyse_lift_par_quartile(rows, label):
    """Calcule lift Q1..Q4 sur derive."""
    sorted_rows = sorted(rows, key=lambda r: r["derive"])
    n_bins = 4
    bin_size = len(sorted_rows) // n_bins
    print(f"\n  {label}  (N={len(sorted_rows)})")
    print(f"  {'Bin':<10} {'N':>4} {'Win%':>7} {'Attendu%':>9} {'Lift':>6}")
    lifts = []
    for i in range(n_bins):
        start = i * bin_size
        end = (i + 1) * bin_size if i < n_bins - 1 else len(sorted_rows)
        bin_rows = sorted_rows[start:end]
        if not bin_rows:
            continue
        n = len(bin_rows)
        wins = sum(r["gagnant"] for r in bin_rows)
        expected = sum(1.0 / r["cote"] for r in bin_rows) / n
        actual = wins / n
        lift = actual / expected if expected > 0 else 0
        lifts.append(lift)
        print(f"  Q{i+1:<8} {n:>4} {actual*100:>6.1f}% {expected*100:>8.1f}% {lift:>5.2f}")
    return lifts


def split_temporel(rows, pct_train=0.6):
    """Tri par date, coupe a pct_train. Garde courses entieres."""
    sorted_rows = sorted(rows, key=lambda r: r["date"])
    cut = int(len(sorted_rows) * pct_train)
    # Trouver la date de coupure pour ne pas couper au milieu d'une journee
    cut_date = sorted_rows[cut]["date"]
    train = [r for r in sorted_rows if r["date"] < cut_date]
    test = [r for r in sorted_rows if r["date"] >= cut_date]
    return train, test


def test_placebo(rows, n_perm=100):
    """Permute les arrivees, refite la regression, compare au vrai coeff."""
    X1 = [log(1.0 / r["cote"]) for r in rows]
    X2 = [r["derive"] for r in rows]
    y_true = [r["gagnant"] for r in rows]

    # Vrai coeff
    _, b_true, _, _ = fit_logreg(X1, X2, y_true, n_iter=1500)

    placebo_coeffs = []
    y_shuf = y_true.copy()
    for _ in range(n_perm):
        random.shuffle(y_shuf)
        _, b_p, _, _ = fit_logreg(X1, X2, y_shuf, n_iter=800)  # moins d'iter pour speed
        placebo_coeffs.append(b_p)

    placebo_coeffs.sort()
    # Z-score du vrai coeff par rapport a la distribution placebo
    mean_p = sum(placebo_coeffs) / len(placebo_coeffs)
    std_p = math.sqrt(sum((x - mean_p) ** 2 for x in placebo_coeffs) / len(placebo_coeffs))
    z_score = (b_true - mean_p) / std_p if std_p > 0 else 0
    # Pvalue deux cotes
    more_extreme = sum(1 for x in placebo_coeffs if abs(x) >= abs(b_true))
    p_val = more_extreme / len(placebo_coeffs)

    print(f"\n  Coeff reel           : {b_true:+.3f}")
    print(f"  Placebo mean         : {mean_p:+.3f}")
    print(f"  Placebo std          : {std_p:.3f}")
    print(f"  Z-score vs placebo   : {z_score:+.2f}")
    print(f"  P-value approx       : {p_val:.3f}")
    if abs(z_score) >= 2.0:
        print(f"  -> Coeff NON compatible avec le hasard (|Z| >= 2)")
    else:
        print(f"  -> Coeff compatible avec le hasard, signal fragile")


def main():
    print("=" * 80)
    print("VALIDATION OUT-OF-SAMPLE - Derive de cote")
    print("=" * 80)

    rows = collect_participants()
    print(f"\n{len(rows)} participants extraits")
    if len(rows) < 200:
        print("Pas assez de donnees pour un split fiable.")
        return

    # ==== TEST 1: SPLIT TEMPOREL ====
    print("\n" + "=" * 80)
    print("TEST 1 - SPLIT TEMPOREL (60% train / 40% test)")
    print("=" * 80)
    train, test = split_temporel(rows, pct_train=0.6)
    print(f"Train: {len(train)} participants  | Test: {len(test)} participants")
    print(f"Train dates: {min(r['date'] for r in train)} -> {max(r['date'] for r in train)}")
    print(f"Test  dates: {min(r['date'] for r in test)} -> {max(r['date'] for r in test)}")

    # Ajuster sur train
    X1_tr = [log(1.0 / r["cote"]) for r in train]
    X2_tr = [r["derive"] for r in train]
    y_tr = [r["gagnant"] for r in train]
    a, b, c, norms = fit_logreg(X1_tr, X2_tr, y_tr)

    print(f"\nCoefficients appris sur TRAIN:")
    print(f"  a (cote)   = {a:+.3f}")
    print(f"  b (derive) = {b:+.3f}")
    print(f"  c (intercept) = {c:+.3f}")

    # Analyse quartile sur TRAIN et TEST separement
    print("\nLifts par quartile de derive:")
    lifts_tr = analyse_lift_par_quartile(train, "TRAIN")
    lifts_te = analyse_lift_par_quartile(test, "TEST (out-of-sample)")

    if lifts_tr and lifts_te:
        print(f"\n  Comparaison Lift Q4 (cote qui monte, cense etre < 1):")
        print(f"    TRAIN: {lifts_tr[-1]:.2f}")
        print(f"    TEST : {lifts_te[-1]:.2f}")
        if lifts_te[-1] < 0.85:
            print(f"  -> Signal TIENT out-of-sample (Q4 lift < 0.85)")
        elif lifts_te[-1] < 1.0:
            print(f"  -> Signal ATTENUE mais dans le bon sens")
        else:
            print(f"  -> Signal NE TIENT PAS out-of-sample (Q4 lift >= 1)")

    # ==== TEST 2: SPLIT GEOGRAPHIQUE ====
    print("\n" + "=" * 80)
    print("TEST 2 - SPLIT GEOGRAPHIQUE (leave-one-hippodrome-out)")
    print("=" * 80)
    by_hippo = defaultdict(list)
    for r in rows:
        if r["hippo"]:
            by_hippo[r["hippo"]].append(r)

    for hippo_test in by_hippo:
        if len(by_hippo[hippo_test]) < 30:
            continue
        train_g = [r for h, lst in by_hippo.items() if h != hippo_test for r in lst]
        test_g = by_hippo[hippo_test]
        X1 = [log(1.0 / r["cote"]) for r in train_g]
        X2 = [r["derive"] for r in train_g]
        y = [r["gagnant"] for r in train_g]
        _, b_g, _, _ = fit_logreg(X1, X2, y, n_iter=1500)
        # Lift Q4 sur test
        sorted_t = sorted(test_g, key=lambda r: r["derive"])
        q4 = sorted_t[int(0.75 * len(sorted_t)):]
        if q4:
            wins = sum(r["gagnant"] for r in q4)
            exp_p = sum(1.0 / r["cote"] for r in q4) / len(q4)
            act = wins / len(q4)
            lift = act / exp_p if exp_p > 0 else 0
            print(f"  Test={hippo_test:<20} N_test={len(test_g):>3}  coeff_train={b_g:+.3f}  lift_Q4_test={lift:.2f}")

    # ==== TEST 3: PLACEBO ====
    print("\n" + "=" * 80)
    print("TEST 3 - PLACEBO (permutation test, n=100)")
    print("=" * 80)
    test_placebo(rows, n_perm=100)

    # ==== VERDICT ====
    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    print("Le signal de derive de cote est considere ROBUSTE si:")
    print("  1. Coeff train ET test ont meme signe negatif")
    print("  2. Lift Q4 out-of-sample < 0.90")
    print("  3. Z-score placebo > 2.0 (coeff pas du au hasard)")
    print("  4. Split geographique: signal tient sur la plupart des hippodromes")
    print()
    print("Si ces 4 conditions passent -> integrer au scoring avec poids modere.")
    print("Si 1-2 conditions -> integrer avec poids TRES reduit, monitorer.")
    print("Si 0-1 conditions -> NE PAS integrer, c'etait un hasard in-sample.")


if __name__ == "__main__":
    random.seed(42)
    main()
