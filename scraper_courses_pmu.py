#!/usr/bin/env python3
"""
Scraper des courses hippiques via l'API PMU Turfinfo.
Remplace le scraping Selenium de france-galop.com.

RÉTROCOMPATIBLE: produit exactement le même format JSON que l'ancien scraper
(un fichier par hippodrome: {date}_{hippodrome}.json dans data/courses/)

Usage:
    python scraper_courses_pmu.py              # Courses du jour
    python scraper_courses_pmu.py 2026-03-29   # Date spécifique
    python scraper_courses_pmu.py today        # Explicitement aujourd'hui
"""

import requests
import json
import os
import sys
import time
import logging
import re
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# Configuration
# ============================================================
BASE_URL = "https://online.turfinfo.api.pmu.fr/rest/client/61"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'fr-FR,fr;q=0.9',
}
OUTPUT_DIR = "data/courses"
REQUEST_DELAY = 0.3


# ============================================================
# Helpers
# ============================================================

def api_get(endpoint, max_retries=3):
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                logger.warning(f"  ⚠️  404 pour: {endpoint}")
                return None
            else:
                logger.warning(f"  ⚠️  HTTP {response.status_code} pour {endpoint} (tentative {attempt+1}/{max_retries})")
        except requests.exceptions.RequestException as e:
            logger.warning(f"  ⚠️  Erreur réseau: {e} (tentative {attempt+1}/{max_retries})")
        if attempt < max_retries - 1:
            time.sleep(REQUEST_DELAY * (attempt + 1))
    logger.error(f"❌ Échec après {max_retries} tentatives pour {endpoint}")
    return None


def format_date_pmu(date_obj):
    return date_obj.strftime("%d%m%Y")


def format_heure(timestamp_ms):
    if not timestamp_ms:
        return ""
    try:
        dt = datetime.fromtimestamp(timestamp_ms / 1000)
        return dt.strftime("%Hh%M")
    except (ValueError, OSError):
        return ""


def safe_str(val, default=""):
    if val is None:
        return default
    return str(val).strip()


def get_nom(field):
    """
    Extrait le nom d'un champ PMU qui peut être:
    - un dict {"nom": "..."} 
    - une simple string "..."
    - None
    """
    if field is None:
        return ""
    if isinstance(field, str):
        return field.strip()
    if isinstance(field, dict):
        return safe_str(field.get("nom", ""))
    return safe_str(field)


# ============================================================
# Mapping PMU → Format rétrocompatible
# ============================================================

def map_specialite(code):
    mapping = {
        "PLAT": "Plat",
        "OBSTACLE": "Obstacle",
        "STEEPLE_CHASE": "Obstacle",
        "HAIES": "Obstacle",
        "CROSS_COUNTRY": "Obstacle",
        "TROT_ATTELE": "Trot",
        "TROT_MONTE": "Trot",
    }
    return mapping.get(code, code if code else "Indéterminé")


def build_cheval_label(participant):
    nom = safe_str(participant.get("nom", "")).upper()
    sexe = safe_str(participant.get("sexe", ""))
    race = safe_str(participant.get("race", ""))
    age = safe_str(participant.get("age", ""))

    sexe_map = {
        "MALES": "M.", "FEMELLES": "F.", "HONGRES": "H.",
        "MALE": "M.", "FEMELLE": "F.", "HONGRE": "H."
    }
    sexe_label = sexe_map.get(sexe, sexe[:1] + "." if sexe else "")

    race_map = {"PUR_SANG": "PS.", "AQPS": "AQPS.", "ARABE": "AR."}
    race_label = race_map.get(race, race[:2] + "." if race else "")

    age_label = f"{age} a." if age else ""

    parts = [nom]
    if sexe_label or race_label:
        parts.append(f"{sexe_label}{race_label}")
    if age_label:
        parts.append(age_label)

    return " ".join(parts)


def build_pere_mere(participant):
    pere = get_nom(participant.get("pere"))
    mere = get_nom(participant.get("mere"))
    pere_mere_mere = get_nom(participant.get("pereMere"))

    if pere and mere:
        result = f"Par: {pere} et {mere}"
        if pere_mere_mere:
            result += f" ({pere_mere_mere})"
        return result
    elif pere:
        return f"Par: {pere}"
    return ""


def format_poids(poids_val):
    if not poids_val:
        return ""
    if isinstance(poids_val, (int, float)) and poids_val > 100:
        kg = poids_val / 10
        if kg == int(kg):
            return f"{int(kg)} kg"
        else:
            return f"{kg} kg"
    return f"{poids_val} kg"


def map_participant(p):
    result = {}

    result["n°"] = safe_str(p.get("numPmu", ""))
    result["cheval"] = build_cheval_label(p)
    result["cheval_url"] = ""

    pere_mere = build_pere_mere(p)
    if pere_mere:
        result["père_mère"] = pere_mere

    place_corde = safe_str(p.get("placeCorde", ""))
    result["corde"] = f"(Corde:{place_corde.zfill(2)})" if place_corde else ""
    result["couleurs"] = ""

    # Utiliser get_nom() pour gérer string OU dict
    result["propriétaire"] = get_nom(p.get("proprietaire"))
    result["entraineur"] = get_nom(p.get("entraineur"))
    result["jockey"] = get_nom(p.get("jockey"))

    result["poids"] = format_poids(p.get("poidsConditionMonte"))

    # Gains
    gains_data = p.get("gainsParticipant")
    if gains_data and isinstance(gains_data, dict):
        gains_carriere = gains_data.get("gainsCarriere")
        if gains_carriere and isinstance(gains_carriere, dict):
            somme = gains_carriere.get("somme", 0)
            result["gains"] = safe_str(somme) if somme else ""
        else:
            result["gains"] = ""
    else:
        result["gains"] = ""

    result["musique"] = safe_str(p.get("musique", ""))

    # Valeur handicap
    handicap = p.get("handicapPoids")
    if handicap:
        if isinstance(handicap, (int, float)) and handicap > 100:
            result["valeur"] = safe_str(handicap / 10)
        else:
            result["valeur"] = safe_str(handicap)
    else:
        result["valeur"] = ""

    # Équipement
    oeilleres = safe_str(p.get("oeilleres", ""))
    equip_map = {
        "OEILLERES_PLATES": "0",
        "OEILLERES_AUSTRALIENNES": "A",
        "OEIL_PLEIN": "O",
    }
    equip = equip_map.get(oeilleres, "")
    ferrage = safe_str(p.get("defFerrage", ""))
    ferrage_map = {
        "DEFERRES_ANTERIEURS": "da",
        "DEFERRES_POSTERIEURS": "dp",
        "DEFERRES_4_PIEDS": "d4",
    }
    equip += ferrage_map.get(ferrage, "")
    result["equipement(s)"] = equip

    result["éleveurs"] = get_nom(p.get("eleveur"))

    return result


# ============================================================
# Pipeline principal
# ============================================================

def scrape_courses(date_obj=None):
    if date_obj is None:
        date_obj = datetime.now()

    date_pmu = format_date_pmu(date_obj)
    date_iso = date_obj.strftime("%Y-%m-%d")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    logger.info(f"🏇 Extraction des courses du {date_iso}")
    logger.info(f"🔗 API PMU - Date: {date_pmu}")

    logger.info(f"\n📋 Récupération du programme du jour...")
    programme = api_get(f"programme/{date_pmu}?specialisation=INTERNET")

    if not programme:
        logger.error(f"❌ Impossible de récupérer le programme pour {date_iso}")
        return False

    reunions_data = programme.get("programme", {}).get("reunions", [])
    if not reunions_data:
        logger.warning(f"⚠️  Aucune réunion trouvée pour {date_iso}")
        return False

    logger.info(f"✅ {len(reunions_data)} réunion(s) trouvée(s)")
    files_saved = 0

    for reunion_raw in reunions_data:
        reunion_num = reunion_raw.get("numOfficiel", 0)
        hippodrome_data = reunion_raw.get("hippodrome", {})
        if isinstance(hippodrome_data, str):
            hippodrome_nom = hippodrome_data.upper()
        else:
            hippodrome_nom = safe_str(hippodrome_data.get("libelleCourt", "INCONNU")).upper()

        specialite = reunion_raw.get("specialite", "")
        reunion_type = map_specialite(specialite)

        logger.info(f"\n🏟️  R{reunion_num} - {hippodrome_nom} ({reunion_type})")

        reunion_output = {
            "hippodrome": hippodrome_nom,
            "type_reunion": reunion_type,
            "date_extraction": datetime.now().isoformat(),
            "url_source": f"https://online.turfinfo.api.pmu.fr/rest/client/61/programme/{date_pmu}/R{reunion_num}",
            "courses": []
        }

        courses_data = reunion_raw.get("courses", [])

        for course_raw in courses_data:
            course_num = course_raw.get("numOrdre", 0)
            course_nom = safe_str(course_raw.get("libelle", "")).upper()
            course_horaire = format_heure(course_raw.get("heureDepart"))
            course_specialite = course_raw.get("specialite", "")
            course_type = map_specialite(course_specialite) if course_specialite else reunion_type
            distance = course_raw.get("distance")
            distance_str = f"{distance}m" if distance else ""

            logger.info(f"  🏁 C{course_num}: {course_nom} ({course_horaire}) - {distance_str}")

            course_mapped = {
                "nom": course_nom,
                "horaire": course_horaire,
                "numero": safe_str(course_num),
                "type": course_type,
                "distance": distance_str,
                "url": "",
                "participants": []
            }

            time.sleep(REQUEST_DELAY)
            participants_raw = api_get(
                f"programme/{date_pmu}/R{reunion_num}/C{course_num}/participants?specialisation=INTERNET"
            )

            if participants_raw:
                participants_list = participants_raw.get("participants", [])
                mapped_participants = []

                for p in participants_list:
                    try:
                        if p.get("estNonPartant", False):
                            continue
                        mapped_p = map_participant(p)
                        if mapped_p.get("cheval") or mapped_p.get("jockey"):
                            mapped_participants.append(mapped_p)
                    except Exception as e:
                        logger.warning(f"    ⚠️  Erreur mapping participant: {e}")
                        continue

                if mapped_participants:
                    course_mapped["participants"] = mapped_participants
                    reunion_output["courses"].append(course_mapped)
                    logger.info(f"    👤 {len(mapped_participants)} participants")
                else:
                    logger.info(f"    ⚠️  Aucun participant valide")
            else:
                logger.info(f"    ⚠️  Pas de données participants")

        if reunion_output["courses"]:
            safe_name = hippodrome_nom.lower()
            safe_name = safe_name.replace(" ", "_").replace("/", "-").replace("\\", "-")
            safe_name = safe_name.replace(":", "-").replace("'", "").replace(".", "")
            safe_name = re.sub(r'[^a-z0-9_\-]', '', safe_name)
            safe_name = re.sub(r'_+', '_', safe_name).strip('_')

            filename = f"{date_iso}_{safe_name}.json"
            filepath = os.path.join(OUTPUT_DIR, filename)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(reunion_output, f, ensure_ascii=False, indent=2)

            logger.info(f"  💾 {filepath} ({len(reunion_output['courses'])} courses)")
            files_saved += 1
        else:
            logger.info(f"  ⚠️  Aucune course valide pour {hippodrome_nom}")

    logger.info(f"\n{'='*60}")
    logger.info(f"📊 RÉSUMÉ - {date_iso}")
    logger.info(f"  Réunions: {len(reunions_data)} | Fichiers: {files_saved}")
    logger.info(f"✅ Extraction terminée!")

    return files_saved > 0


# ============================================================
# Point d'entrée
# ============================================================

if __name__ == "__main__":
    date_obj = datetime.now()

    for arg in sys.argv[1:]:
        if arg == "today":
            date_obj = datetime.now()
        elif arg == "tomorrow":
            date_obj = datetime.now() + timedelta(days=1)
        elif arg == "yesterday":
            date_obj = datetime.now() - timedelta(days=1)
        else:
            try:
                date_obj = datetime.strptime(arg, "%Y-%m-%d")
            except ValueError:
                logger.error(f"❌ Format invalide: {arg} (utiliser YYYY-MM-DD)")
                sys.exit(1)

    logger.info("🚀 Scraper Courses Hippiques - API PMU (rétrocompatible)")
    logger.info(f"📅 Date: {date_obj.strftime('%Y-%m-%d')}")
    logger.info("")

    success = scrape_courses(date_obj)
    sys.exit(0 if success else 1)
