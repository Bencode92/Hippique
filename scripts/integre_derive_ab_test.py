#!/usr/bin/env python3
"""
A/B TEST: modele BASELINE vs modele + PENALITE DERIVE.

Objectif: mesurer si l'integration de la derive de cote apporte un gain
MESURABLE en Top1% sur les 94 courses Paris 2026, pas juste un signal
statistiquement significatif sans impact pratique.

Regle: on n'integre la derive que si gain Top1% >= 3 points ET IC Wilson
ne se recouvrent pas trop.

Pour chaque course:
  - score_baseline(cheval) = formule actuelle par distance (sprint/mile/middle/staying)
  - score_avec_derive(cheval) = score_baseline - penalite si derive > seuil
  - Top1 = argmax du score
  - Compare aux arrivees reelles

Contraintes d'integration (basees sur validation out-of-sample):
  - Penalite UNIQUEMENT (pas de boost sur baisse de cote, Q1 lift=0.93 ~ 1)
  - Seuil: derive > +0.3 (hausse forte uniquement)
  - Poids calibre sur coeff -0.258 mais en version soft

Usage: python3 scripts/integre_derive_ab_test.py
"""

import json
import glob
import os
import re
import math
from math import log, sqrt
from collections import defaultdict

HIPPODROMES_PARIS = ["saint-cloud", "chantilly", "fontainebleau",
                     "parislongchamp", "longchamp"]
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "courses")


# ============ STATS ============
def wilson_ic(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d
    return (max(0.0, c - m), min(1.0, c + m))


def test_mcnemar(a_only, b_only):
    """Test de McNemar pour comparer deux classifieurs sur memes echantillons.
    a_only = cas ou seul A a gagne, b_only = cas ou seul B a gagne.
    Retourne approximation de p-value (chi2 avec continuity correction)."""
    n = a_only + b_only
    if n < 5:
        return None
    chi2 = (abs(a_only - b_only) - 1) ** 2 / n
    # p approximatif via une table chi2 df=1 (values at 0.1, 0.05, 0.01)
    if chi2 >= 6.63:
        return "<0.01"
    if chi2 >= 3.84:
        return "<0.05"
    if chi2 >= 2.71:
        return "<0.10"
    return ">0.10"


# ============ PARSING ============
def score_musique(musique_str):
    if not musique_str:
        return 0.0
    positions = re.findall(r'(\d)[a-zA-Z]', musique_str)[:5]
    if not positions:
        return 0.0
    pts = {'1': 10, '2': 7, '3': 5, '4': 3, '5': 2, '6': 1, '7': 1, '8': 0, '9': 0, '0': 0}
    weights = [5, 4, 3, 2, 1]
    total_w = sum(weights[:len(positions)])
    s = sum(pts.get(p, 0) * w for p, w in zip(positions, weights))
    return s / total_w if total_w > 0 else 0.0


def parse_distance(dist_str):
    m = re.search(r'(\d+)', str(dist_str))
    return int(m.group(1)) if m else 0


def seg_distance(d):
    if d < 1400: return "sprint"
    if d < 1700: return "mile"
    if d < 2100: return "middle"
    return "staying"


def safe_float(v, default=0):
    try:
        x = float(v)
        return x if x > 0 else default
    except (ValueError, TypeError):
        return default


# ============ SCORE BASELINE (modele actuel) ============
def score_baseline(p, seg_d):
    cote = safe_float(p.get("cote", 99), 99)
    valeur = safe_float(p.get("valeur", 0), 0)
    musique = score_musique(p.get("musique", ""))
    p_marche = 1.0 / cote if cote > 0 else 0

    if seg_d == "sprint":
        s = 0.40 * musique + 0.40 * (p_marche * 10) + 0.20 * (valeur / 10)
    elif seg_d == "mile":
        s = 0.20 * musique + 0.30 * (p_marche * 10) + 0.50 * (valeur / 10)
    elif seg_d == "middle":
        s = 0.20 * musique + 0.50 * (p_marche * 10) + 0.30 * (valeur / 10)
    else:
        s = 0.30 * musique + 0.40 * (p_marche * 10) + 0.30 * (valeur / 10)
    return s


# ============ PENALITE DERIVE ============
def penalite_derive(p, seuil=0.3, poids=0.5):
    """Retourne une penalite A SOUSTRAIRE du score.
    Seuil = 0.3 signifie qu'on penalise uniquement si la cote a monte
    de plus de ~35% entre cote_reference et cote finale.
    Poids module l'ampleur.
    Ne rend jamais de penalite negative (= pas de boost)."""
    cote = safe_float(p.get("cote", 0), 0)
    ref = safe_float(p.get("cote_reference", 0), 0)
    if cote <= 0 or ref <= 0:
        return 0.0
    derive = log(cote / ref)
    if derive <= seuil:
        return 0.0
    # Penalite lineaire au-dela du seuil, capee
    excess = min(derive - seuil, 1.5)  # cap a log(~4.5x) = tres gros abandon
    return poids * excess


def score_avec_derive(p, seg_d, seuil=0.3, poids=0.5):
    return score_baseline(p, seg_d) - penalite_derive(p, seuil, poids)


# ============ LOAD COURSES ============
def load_courses():
    courses_list = []
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
            if not course.get("arrivee_definitive"):
                continue
            # Verifier qu'il y a bien un gagnant et au moins 4 partants
            partants = course.get("participants", [])
            if len(partants) < 4:
                continue
            gagnant = next((p.get("n\u00b0") for p in partants if p.get("arrivee") == 1), None)
            if gagnant is None:
                continue
            courses_list.append({
                "hippo": data.get("hippodrome", "?"),
                "course": course,
                "gagnant": gagnant,
            })
    return courses_list


# ============ BACKTEST ============
def backtest_model(courses_list, scoring_fn, name=""):
    """Applique scoring_fn a chaque course, retourne stats."""
    top1 = 0
    top2 = 0
    top3 = 0
    n = 0
    decisions = []  # pour McNemar: [(course_id, top1_correct)]

    for item in courses_list:
        course = item["course"]
        gagnant = item["gagnant"]
        seg_d = seg_distance(parse_distance(course.get("distance", "0")))
        scored = []
        for p in course.get("participants", []):
            s = scoring_fn(p, seg_d)
            scored.append((p.get("n\u00b0"), s))
        scored.sort(key=lambda x: -x[1])
        t1 = scored[0][0]
        t2 = {scored[i][0] for i in range(min(2, len(scored)))}
        t3 = {scored[i][0] for i in range(min(3, len(scored)))}
        top1_ok = (t1 == gagnant)
        if top1_ok: top1 += 1
        if gagnant in t2: top2 += 1
        if gagnant in t3: top3 += 1
        n += 1
        decisions.append(top1_ok)

    return {
        "name": name,
        "n": n,
        "top1": top1, "top1_pct": top1 / n if n else 0,
        "top2": top2, "top2_pct": top2 / n if n else 0,
        "top3": top3, "top3_pct": top3 / n if n else 0,
        "top1_ci": wilson_ic(top1, n),
        "top2_ci": wilson_ic(top2, n),
        "decisions": decisions,
    }


# ============ MAIN ============
def main():
    print("=" * 80)
    print("A/B TEST - Baseline vs Baseline + Penalite Derive")
    print("=" * 80)

    courses = load_courses()
    print(f"\n{len(courses)} courses Paris 2026 chargees")
    if len(courses) < 30:
        print("Trop peu de courses, abandon.")
        return

    # Modele BASELINE
    baseline = backtest_model(courses, score_baseline, "BASELINE")

    # Modeles AVEC DERIVE - tester plusieurs configs
    configs = [
        ("DERIVE seuil=0.3 poids=0.3", 0.3, 0.3),
        ("DERIVE seuil=0.3 poids=0.5", 0.3, 0.5),
        ("DERIVE seuil=0.3 poids=1.0", 0.3, 1.0),
        ("DERIVE seuil=0.5 poids=0.5", 0.5, 0.5),
        ("DERIVE seuil=0.2 poids=0.3", 0.2, 0.3),
    ]

    results = [baseline]
    for name, seuil, poids in configs:
        scoring = lambda p, s, seuil=seuil, poids=poids: score_avec_derive(p, s, seuil, poids)
        res = backtest_model(courses, scoring, name)
        results.append(res)

    # Affichage
    print(f"\n{'Modele':<35} {'Top1%':>8} {'IC95':>18} {'Top2%':>8} {'Top3%':>8}")
    print("-" * 85)
    for r in results:
        lo, hi = r["top1_ci"]
        print(f"{r['name']:<35} {r['top1_pct']*100:>6.1f}% [{lo*100:>4.1f}%-{hi*100:>4.1f}%] {r['top2_pct']*100:>6.1f}%  {r['top3_pct']*100:>6.1f}%")

    # Test McNemar pour chaque variante vs baseline
    print(f"\n{'='*80}")
    print("TEST MCNEMAR (significativite du gain vs baseline)")
    print(f"{'='*80}")
    base_dec = baseline["decisions"]
    for r in results[1:]:
        var_dec = r["decisions"]
        a_only = sum(1 for b, v in zip(base_dec, var_dec) if b and not v)  # baseline OK, variant KO
        b_only = sum(1 for b, v in zip(base_dec, var_dec) if not b and v)  # baseline KO, variant OK
        both_ok = sum(1 for b, v in zip(base_dec, var_dec) if b and v)
        both_ko = sum(1 for b, v in zip(base_dec, var_dec) if not b and not v)
        p_val = test_mcnemar(a_only, b_only)
        gain = r["top1"] - baseline["top1"]
        print(f"{r['name']:<35} gain={gain:+d}  (base_only={a_only}, variant_only={b_only})  p={p_val}")

    # Verdict
    print(f"\n{'='*80}")
    print("VERDICT")
    print(f"{'='*80}")
    best = max(results[1:], key=lambda r: r["top1_pct"])
    gain_pts = (best["top1_pct"] - baseline["top1_pct"]) * 100
    print(f"Meilleure variante: {best['name']}")
    print(f"Gain en Top1%: {gain_pts:+.1f} pts")

    if gain_pts >= 3.0:
        b_lo, b_hi = baseline["top1_ci"]
        v_lo, v_hi = best["top1_ci"]
        overlap = not (v_lo > b_hi or b_lo > v_hi)
        if not overlap:
            print(">>> GAIN NET et IC non chevauchants: INTEGRER la derive")
        else:
            print(">>> GAIN observe mais IC chevauchent. Reessayer avec + de donnees.")
    elif gain_pts > 0:
        print(">>> Gain marginal (<3 pts). NE PAS integrer, signal trop faible.")
    else:
        print(">>> Pas de gain ou perte. Garder le baseline.")

    print()
    print("Rappel: on a 94 courses. Pour detecter un gain de 3 pts avec IC propres,")
    print("il en faudrait ~400+. Ces chiffres sont indicatifs, pas conclusifs.")


if __name__ == "__main__":
    main()
