#!/usr/bin/env python3
"""
BACKTEST SEGMENTÉ PAR TYPOLOGIE — Hippodromes parisiens 2026
=============================================================
Walk-forward strict : utilise SEULEMENT les cotes (disponibles au départ)
et la valeur FG (figée avant la course). Sépare par segments pour tester
si le modèle bat le marché sur des niches spécifiques.

Usage (depuis la racine du repo):
    python3 scripts/backtest_segmente_paris.py

Hypothèses / limites honnêtes:
    - Le modèle ici est SIMPLIFIÉ (cote + valeur FG + musique pondérée).
      Pas de stats 2025 figées (on peut ajouter ensuite via chevaux_2025.json).
      Objectif: établir un baseline par segment + IC pour détecter si quelque
      chose mérite d'être creusé plus en profondeur.
    - Pas de leakage : on n'utilise pas arrivee[], on n'utilise QUE les
      infos disponibles avant la course (cote, cote_reference, valeur, musique,
      nb_courses/victoires historiques, terrain).
    - Le favori marché est le cheval avec cote minimale.

Sortie:
    data/backtest/segmente_paris_YYYY-MM-DD.json
    Affichage console avec IC Wilson 95%
"""

import json
import glob
import os
import sys
import re
from collections import defaultdict
from math import sqrt
from datetime import datetime

# ============ CONFIG ============
HIPPODROMES_PARIS = {
    "SAINT-CLOUD": "saint-cloud",
    "CHANTILLY": "chantilly",
    "FONTAINEBLEAU": "fontainebleau",
    "PARISLONGCHAMP": "parislongchamp",
    "LONGCHAMP": "longchamp",
}
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "courses")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "backtest")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============ STATS UTILS ============
def wilson_ic(k, n, z=1.96):
    """Intervalle de confiance de Wilson — robuste sur petits N."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d
    return (max(0.0, c - m), min(1.0, c + m))

def verdict(k_mod, k_fav, n, baseline_hasard):
    """Retourne un verdict actionnable."""
    if n < 20:
        return f"N={n} trop faible"
    lo_m, hi_m = wilson_ic(k_mod, n)
    p_fav = k_fav / n
    if lo_m > p_fav:
        return f"★ MODELE > FAVORI (IC: {lo_m:.0%}-{hi_m:.0%})"
    if hi_m < p_fav:
        return f"MODELE < FAVORI"
    if lo_m > baseline_hasard:
        return f"bat le hasard, = favori"
    return "indistinguable"

# ============ PARSING MUSIQUE ============
def score_musique(musique_str):
    """Score musique : moyenne pondérée des 5 dernières perfs (plus récent = plus fort).
    1=10pts, 2=7, 3=5, 4=3, 5=2, reste=0. Retourne 0-10."""
    if not musique_str:
        return 0.0
    positions = re.findall(r'(\d)[a-zA-Z]', musique_str)[:5]
    if not positions:
        return 0.0
    pts = {'1': 10, '2': 7, '3': 5, '4': 3, '5': 2, '6': 1, '7': 1, '8': 0, '9': 0, '0': 0}
    weights = [5, 4, 3, 2, 1]
    total_w = sum(weights[:len(positions)])
    score = sum(pts.get(p, 0) * w for p, w in zip(positions, weights))
    return score / total_w if total_w > 0 else 0.0

# ============ SCORE PREDICTIF ============
def score_participant(p, type_course_seg):
    """Score prédictif = cote + valeur FG + musique selon formule distance."""
    try:
        cote = float(p.get("cote", 99)) or 99
    except (ValueError, TypeError):
        cote = 99
    try:
        valeur = float(p.get("valeur", 0)) or 0
    except (ValueError, TypeError):
        valeur = 0
    musique = score_musique(p.get("musique", ""))
    p_marche = 1.0 / cote if cote > 0 else 0

    if type_course_seg == "sprint":
        score = 0.40 * musique + 0.40 * (p_marche * 10) + 0.20 * (valeur / 10)
    elif type_course_seg == "mile":
        score = 0.20 * musique + 0.30 * (p_marche * 10) + 0.50 * (valeur / 10)
    elif type_course_seg == "middle":
        score = 0.20 * musique + 0.50 * (p_marche * 10) + 0.30 * (valeur / 10)
    else:
        score = 0.30 * musique + 0.40 * (p_marche * 10) + 0.30 * (valeur / 10)
    return score

def parse_distance(dist_str):
    m = re.search(r'(\d+)', str(dist_str))
    return int(m.group(1)) if m else 0

def seg_distance(d):
    if d < 1400: return "sprint"
    if d < 1700: return "mile"
    if d < 2100: return "middle"
    return "staying"

# ============ SEGMENTATION ============
def segmenter_course(course):
    tags = []
    partants = course.get("participants", [])
    n = len(partants)

    if n >= 14: tags.append("grand_peloton_14+")
    elif n <= 8: tags.append("petit_peloton_<=8")
    else: tags.append("peloton_moyen_9-13")

    d = parse_distance(course.get("distance", "0"))
    tags.append(f"dist_{seg_distance(d)}")

    terrain = (course.get("terrain") or "").lower()
    if any(x in terrain for x in ["lourd", "tres souple", "tr\u00e8s souple", "collant"]):
        tags.append("terrain_lourd")
    elif "souple" in terrain:
        tags.append("terrain_souple")
    elif "bon" in terrain:
        tags.append("terrain_bon")

    nom = (course.get("nom") or "").lower()
    typ = (course.get("type") or "").lower()
    if "handicap" in nom or "handicap" in typ: tags.append("handicap")
    if "groupe" in nom or "listed" in nom: tags.append("groupe_ou_listed_probable")
    if "reclamer" in nom or "r\u00e9clamer" in nom: tags.append("reclamer")
    if "2 ans" in nom or "maiden" in nom: tags.append("maiden_ou_2ans")

    cotes = []
    for p in partants:
        try:
            c = float(p.get("cote", 0))
            if c > 0: cotes.append(c)
        except (ValueError, TypeError):
            pass
    if cotes:
        cote_min = min(cotes)
        if cote_min <= 2.5: tags.append("favori_massif_cote<=2.5")
        elif cote_min <= 4.0: tags.append("favori_net_2.5-4")
        else: tags.append("course_ouverte_favori>4")
        if max(cotes) / cote_min > 30: tags.append("forte_dispersion_cotes")

    tags.append("GLOBAL")
    return tags

# ============ BACKTEST ============
def backtester_course(course):
    partants = course.get("participants", [])
    if len(partants) < 4: return None

    gagnant = None
    for p in partants:
        if p.get("arrivee") == 1:
            gagnant = p.get("n\u00b0")
            break
    if gagnant is None: return None

    d = parse_distance(course.get("distance", "0"))
    seg_d = seg_distance(d)

    scored = []
    for p in partants:
        try:
            cote = float(p.get("cote", 99)) or 99
        except (ValueError, TypeError):
            cote = 99
        s = score_participant(p, seg_d)
        scored.append({"num": p.get("n\u00b0"), "cote": cote, "score": s})

    scored_by_model = sorted(scored, key=lambda x: -x["score"])
    top1_model = scored_by_model[0]["num"]
    top2_model = {scored_by_model[0]["num"], scored_by_model[1]["num"]} if len(scored_by_model) > 1 else {top1_model}

    scored_by_cote = sorted(scored, key=lambda x: x["cote"])
    top1_fav = scored_by_cote[0]["num"]
    top2_fav = {scored_by_cote[0]["num"], scored_by_cote[1]["num"]} if len(scored_by_cote) > 1 else {top1_fav}

    return {
        "gagnant": gagnant,
        "model_top1_ok": top1_model == gagnant,
        "model_top2_ok": gagnant in top2_model,
        "fav_top1_ok": top1_fav == gagnant,
        "fav_top2_ok": gagnant in top2_fav,
        "nb_partants": len(partants),
    }

# ============ MAIN ============
def main():
    print("=" * 70)
    print("BACKTEST SEGMENTE - Hippodromes parisiens 2026")
    print("=" * 70)

    files = glob.glob(os.path.join(DATA_DIR, "2026-*.json"))
    files_paris = []
    for f in files:
        name = os.path.basename(f).lower()
        for h in HIPPODROMES_PARIS.values():
            if h in name:
                files_paris.append(f)
                break

    print(f"\n{len(files_paris)} fichiers Paris 2026 trouves")

    segments = defaultdict(lambda: {
        "n": 0, "model_top1": 0, "fav_top1": 0,
        "model_top2": 0, "fav_top2": 0,
        "baseline_hasard_top1": []
    })

    total_courses = 0
    for fp in sorted(files_paris):
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"  skip {fp}: {e}")
            continue

        hippo = data.get("hippodrome", "?")
        for course in data.get("courses", []):
            result = backtester_course(course)
            if result is None: continue
            total_courses += 1
            tags = segmenter_course(course)
            tags.append(f"hippo_{hippo}")

            for tag in tags:
                segments[tag]["n"] += 1
                if result["model_top1_ok"]: segments[tag]["model_top1"] += 1
                if result["fav_top1_ok"]: segments[tag]["fav_top1"] += 1
                if result["model_top2_ok"]: segments[tag]["model_top2"] += 1
                if result["fav_top2_ok"]: segments[tag]["fav_top2"] += 1
                segments[tag]["baseline_hasard_top1"].append(1.0 / result["nb_partants"])

    print(f"\n{total_courses} courses backtestees au total\n")
    print(f"{'SEGMENT':<35} {'N':>4} {'Mod%':>6} {'Fav%':>6} {'Ecart':>6}  VERDICT")
    print("-" * 100)

    rows = []
    for seg, stats in segments.items():
        n = stats["n"]
        if n == 0: continue
        p_mod = stats["model_top1"] / n
        p_fav = stats["fav_top1"] / n
        baseline = sum(stats["baseline_hasard_top1"]) / n if stats["baseline_hasard_top1"] else 0
        v = verdict(stats["model_top1"], stats["fav_top1"], n, baseline)
        rows.append((seg, n, p_mod, p_fav, p_mod - p_fav, v))

    rows.sort(key=lambda r: (r[0] != "GLOBAL", -r[4]))
    for seg, n, p_mod, p_fav, ecart, v in rows:
        flag = " <-- " if "MODELE >" in v or abs(ecart) > 0.08 else ""
        print(f"{seg:<35} {n:>4} {p_mod:>5.0%}  {p_fav:>5.0%}  {ecart:>+5.0%}  {v}{flag}")

    out_path = os.path.join(OUTPUT_DIR, f"segmente_paris_{datetime.now().strftime('%Y-%m-%d')}.json")
    output = {
        "generated_at": datetime.now().isoformat(),
        "total_courses": total_courses,
        "hippodromes": list(HIPPODROMES_PARIS.keys()),
        "segments": {
            seg: {
                "n": s["n"],
                "model_top1_pct": s["model_top1"] / s["n"] if s["n"] else 0,
                "fav_top1_pct": s["fav_top1"] / s["n"] if s["n"] else 0,
                "model_top2_pct": s["model_top2"] / s["n"] if s["n"] else 0,
                "fav_top2_pct": s["fav_top2"] / s["n"] if s["n"] else 0,
                "model_wilson_ci_95": wilson_ic(s["model_top1"], s["n"]),
            }
            for seg, s in segments.items() if s["n"] > 0
        }
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nResultats sauvegardes : {out_path}")
    print("\nLEGENDE VERDICT:")
    print("  * = significativement meilleur que favori (IC 95% Wilson)")
    print("  indistinguable = dans le bruit statistique")
    print("\nINTERPRETATION:")
    print("  - Cherche segments avec * ET N >= 30 -> piste serieuse")
    print("  - N < 30 = informatif mais non concluant")
    print("  - Ecart > 10pts avec N < 30 = PROBABLEMENT BRUIT")

if __name__ == "__main__":
    main()
