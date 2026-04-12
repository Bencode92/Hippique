#!/usr/bin/env python3
"""
Scraper pré-course : capture les cotes 10 min avant le départ
pour les hippodromes majeurs (Saint-Cloud, Longchamp, Chantilly, etc.)

Tourne toutes les 15 minutes entre 11h et 17h UTC (13h-19h France).
Vérifie si une course démarre dans les 15 prochaines minutes.
Si oui, scrape les cotes et les stocke dans data/cotes_live/

Usage : python3 scraper_pre_course.py
"""

import requests
import json
import os
import time
import logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

BASE_URL = "https://online.turfinfo.api.pmu.fr/rest/client/61"
HEADERS = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
}
OUTPUT_DIR = "data/cotes_live"

# Hippodromes cibles (grandes courses françaises)
HIPPODROMES_CIBLES = [
    'SAINT-CLOUD', 'LONGCHAMP', 'PARISLONGCHAMP', 'CHANTILLY',
    'DEAUVILLE', 'FONTAINEBLEAU', 'LYON', 'BORELY', 'MARSEILLE',
    'LE BOUSCAT', 'BORDEAUX', 'TOULOUSE', 'NANTES', 'PAU',
    'CAGNES', 'ARGENTAN', 'MOULINS', 'COMPIEGNE', 'AUTEUIL',
    'PORNICHET', 'AMIENS',
]

# Fenêtre de capture : on scrape si la course démarre dans les 15 prochaines minutes
FENETRE_MINUTES = 15


def api_get(endpoint, max_retries=2):
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning(f"  ⚠️ Erreur: {e}")
        time.sleep(0.3)
    return None


def get_programme_jour():
    """Récupère le programme du jour avec les horaires de départ."""
    date_pmu = datetime.now().strftime("%d%m%Y")
    prog = api_get(f"programme/{date_pmu}?specialisation=INTERNET")
    if not prog or not prog.get("programme", {}).get("reunions"):
        return None, date_pmu
    return prog["programme"]["reunions"], date_pmu


def est_hippodrome_cible(hippo_data):
    """Vérifie si l'hippodrome est dans notre liste cible."""
    if isinstance(hippo_data, str):
        nom = hippo_data.upper()
    elif isinstance(hippo_data, dict):
        nom = (hippo_data.get("libelleCourt", "") or hippo_data.get("libelleLong", "")).upper()
    else:
        return False

    return any(cible in nom or nom in cible for cible in HIPPODROMES_CIBLES)


def timestamp_to_datetime(ts):
    """Convertit un timestamp PMU (ms) en datetime."""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(ts / 1000)
    except:
        return None


def scrape_cotes_course(date_pmu, reunion_num, course_num, course_info):
    """Scrape les cotes live d'une course spécifique."""
    participants = api_get(
        f"programme/{date_pmu}/R{reunion_num}/C{course_num}/participants?specialisation=INTERNET"
    )
    if not participants:
        return None

    cotes = []
    for p in participants.get("participants", []):
        if p.get("estNonPartant") or (p.get("statut", "").upper() == "NON_PARTANT"):
            continue

        rapport_direct = p.get("dernierRapportDirect", {})
        rapport_ref = p.get("dernierRapportReference", {})

        cotes.append({
            "numPmu": p.get("numPmu"),
            "nom": p.get("nom", ""),
            "cote_live": rapport_direct.get("rapport") if isinstance(rapport_direct, dict) else None,
            "cote_reference": rapport_ref.get("rapport") if isinstance(rapport_ref, dict) else None,
            "tendance": rapport_direct.get("indicateurTendance", "") if isinstance(rapport_direct, dict) else "",
            "favoris": rapport_direct.get("favoris", False) if isinstance(rapport_direct, dict) else False,
            "timestamp_cote": rapport_direct.get("dateRapport") if isinstance(rapport_direct, dict) else None,
        })

    return {
        "course": course_info.get("libelle", ""),
        "numero": course_num,
        "reunion": reunion_num,
        "heure_depart": course_info.get("heureDepart"),
        "distance": course_info.get("distance"),
        "scraped_at": datetime.now().isoformat(),
        "minutes_avant_depart": course_info.get("_minutes_avant", 0),
        "participants": cotes,
    }


def main():
    logger.info("🏇 Scraper pré-course — cotes live")
    logger.info(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    reunions, date_pmu = get_programme_jour()
    if not reunions:
        logger.info("❌ Pas de programme aujourd'hui")
        return

    now = datetime.now()
    date_iso = now.strftime("%Y-%m-%d")
    courses_scrapees = 0

    for reunion in reunions:
        hippo = reunion.get("hippodrome", {})
        if not est_hippodrome_cible(hippo):
            continue

        hippo_nom = hippo.get("libelleCourt", "INCONNU") if isinstance(hippo, dict) else str(hippo)
        reunion_num = reunion.get("numOfficiel", 0)

        for course in reunion.get("courses", []):
            heure_depart = course.get("heureDepart")
            if not heure_depart:
                continue

            depart_dt = timestamp_to_datetime(heure_depart)
            if not depart_dt:
                continue

            # Vérifier si la course démarre dans les FENETRE_MINUTES prochaines minutes
            minutes_avant = (depart_dt - now).total_seconds() / 60

            if 0 < minutes_avant <= FENETRE_MINUTES:
                course_num = course.get("numOrdre", 0)
                course_nom = course.get("libelle", "")
                logger.info(f"\n⏰ {hippo_nom} R{reunion_num} C{course_num} — {course_nom}")
                logger.info(f"   Départ dans {minutes_avant:.0f} min ({depart_dt.strftime('%H:%M')})")

                course["_minutes_avant"] = round(minutes_avant)
                result = scrape_cotes_course(date_pmu, reunion_num, course_num, course)

                if result:
                    result["hippodrome"] = hippo_nom.upper()

                    # Sauvegarder dans un fichier par course
                    safe_hippo = hippo_nom.lower().replace(" ", "_").replace("/", "-")
                    filename = f"{date_iso}_{safe_hippo}_R{reunion_num}C{course_num}_live.json"
                    filepath = os.path.join(OUTPUT_DIR, filename)

                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)

                    logger.info(f"   💾 {filepath}")
                    logger.info(f"   📊 {len(result['participants'])} participants avec cotes live")

                    # Afficher les cotes
                    sorted_p = sorted(result['participants'], key=lambda x: x.get('cote_live') or 999)
                    for p in sorted_p[:5]:
                        logger.info(f"      #{p['numPmu']} {p['nom'][:20]:20} cote:{p['cote_live']} ref:{p['cote_reference']} {p['tendance']}")

                    courses_scrapees += 1

            elif minutes_avant <= 0 and minutes_avant > -5:
                # Course qui vient de partir (< 5 min), scraper quand même
                course_num = course.get("numOrdre", 0)
                logger.info(f"   ⚡ {hippo_nom} R{reunion_num} C{course_num} — vient de partir, scrape rapide")
                course["_minutes_avant"] = round(minutes_avant)
                result = scrape_cotes_course(date_pmu, reunion_num, course_num, course)
                if result:
                    result["hippodrome"] = hippo_nom.upper()
                    safe_hippo = hippo_nom.lower().replace(" ", "_").replace("/", "-")
                    filename = f"{date_iso}_{safe_hippo}_R{reunion_num}C{course_num}_live.json"
                    filepath = os.path.join(OUTPUT_DIR, filename)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    courses_scrapees += 1

    if courses_scrapees == 0:
        logger.info("\n📭 Aucune course cible dans les 15 prochaines minutes")
    else:
        logger.info(f"\n✅ {courses_scrapees} courses scrapées (cotes live)")


if __name__ == "__main__":
    main()
