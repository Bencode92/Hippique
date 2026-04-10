#!/usr/bin/env python3
"""
Scraper des courses hippiques via l'API PMU Turfinfo.
RÉTROCOMPATIBLE avec le format JSON attendu par courses-loader.js

Champs API PMU identifiés par debug:
- Jockey = "driver" (pas "jockey")
- Père/Mère = "nomPere", "nomMere", "nomPereMere" (strings directes)
- Gains = gainsParticipant.gainsCarriere (nombre direct, pas dict)
- Poids = handicapPoids / 10 (ex: 580 → 58 kg)
- Race = "PUR-SANG" (avec tiret)
- Spécialité = dans chaque course (discipline/specialite), pas au niveau réunion
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

BASE_URL = "https://online.turfinfo.api.pmu.fr/rest/client/61"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'fr-FR,fr;q=0.9',
}
OUTPUT_DIR = "data/courses"
REQUEST_DELAY = 0.3


def api_get(endpoint, max_retries=3):
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 404:
                return None
            else:
                logger.warning(f"  ⚠️  HTTP {resp.status_code} (tentative {attempt+1})")
        except requests.exceptions.RequestException as e:
            logger.warning(f"  ⚠️  Réseau: {e} (tentative {attempt+1})")
        if attempt < max_retries - 1:
            time.sleep(REQUEST_DELAY * (attempt + 1))
    return None


def format_heure(ts):
    if not ts:
        return ""
    try:
        return datetime.fromtimestamp(ts / 1000).strftime("%Hh%M")
    except:
        return ""


def safe_str(val, default=""):
    if val is None:
        return default
    return str(val).strip()


def get_nom(field):
    """Extrait nom: gère string, dict {nom:...}, ou None."""
    if field is None:
        return ""
    if isinstance(field, str):
        return field.strip()
    if isinstance(field, dict):
        return safe_str(field.get("nom", ""))
    return safe_str(field)


# ============================================================
# Mapping
# ============================================================

def map_specialite(code):
    if not code:
        return "Indéterminé"
    code_up = code.upper().replace("-", "_") if isinstance(code, str) else str(code)
    mapping = {
        "PLAT": "Plat",
        "OBSTACLE": "Obstacle",
        "STEEPLE_CHASE": "Obstacle",
        "HAIES": "Obstacle",
        "CROSS_COUNTRY": "Obstacle",
        "TROT_ATTELE": "Trot",
        "TROT_MONTE": "Trot",
    }
    return mapping.get(code_up, code if code else "Indéterminé")


def build_cheval_label(p):
    nom = safe_str(p.get("nom", "")).upper()
    sexe = safe_str(p.get("sexe", "")).upper()
    race = safe_str(p.get("race", "")).upper()
    age = safe_str(p.get("age", ""))

    sexe_map = {"MALES": "M.", "FEMELLES": "F.", "HONGRES": "H.",
                "MALE": "M.", "FEMELLE": "F.", "HONGRE": "H."}
    sexe_label = sexe_map.get(sexe, sexe[:1] + "." if sexe else "")

    # Gérer PUR-SANG (tiret) et PUR_SANG (underscore)
    race_norm = race.replace("-", "_")
    race_map = {"PUR_SANG": "PU.", "AQPS": "AQPS.", "ARABE": "AR.",
                "AUTRE_QUE_PUR_SANG": "AQPS.", "TROTTEUR": "TR."}
    race_label = race_map.get(race_norm, race[:2] + "." if race else "")

    age_label = f"{age} a." if age else ""

    parts = [nom]
    if sexe_label or race_label:
        parts.append(f"{sexe_label}{race_label}")
    if age_label:
        parts.append(age_label)
    return " ".join(parts)


def build_pere_mere(p):
    """Utilise nomPere, nomMere, nomPereMere (strings directes dans l'API PMU)."""
    pere = safe_str(p.get("nomPere", ""))
    mere = safe_str(p.get("nomMere", ""))
    pmm = safe_str(p.get("nomPereMere", ""))

    if pere and mere:
        result = f"Par: {pere} et {mere}"
        if pmm:
            result += f" ({pmm})"
        return result
    elif pere:
        return f"Par: {pere}"
    return ""


def format_poids(handicap_poids):
    """handicapPoids est en dixièmes de kg: 580 → 58.0 kg."""
    if not handicap_poids:
        return ""
    if isinstance(handicap_poids, (int, float)):
        kg = handicap_poids / 10
        if kg == int(kg):
            return f"{int(kg)} kg"
        else:
            return f"{kg} kg"
    return f"{handicap_poids} kg"


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

    # Casaque
    casaque = p.get("urlCasaque", "")
    if casaque:
        result["couleurs"] = casaque

    # Propriétaire, entraîneur, éleveur = strings directes
    result["propriétaire"] = get_nom(p.get("proprietaire"))
    result["entraineur"] = get_nom(p.get("entraineur"))
    result["éleveurs"] = get_nom(p.get("eleveur"))

    # JOCKEY = champ "driver" dans l'API PMU !
    result["jockey"] = get_nom(p.get("driver"))

    # POIDS = handicapPoids / 10
    result["poids"] = format_poids(p.get("handicapPoids"))

    # GAINS: gainsParticipant.gainsCarriere est un NOMBRE direct
    gains_data = p.get("gainsParticipant")
    if gains_data and isinstance(gains_data, dict):
        gains_carriere = gains_data.get("gainsCarriere", 0)
        # C'est un nombre direct (pas un dict avec "somme")
        if isinstance(gains_carriere, (int, float)):
            result["gains"] = safe_str(gains_carriere) if gains_carriere else ""
        elif isinstance(gains_carriere, dict):
            result["gains"] = safe_str(gains_carriere.get("somme", 0)) if gains_carriere.get("somme") else ""
        else:
            result["gains"] = ""
    else:
        result["gains"] = ""

    # Musique
    result["musique"] = safe_str(p.get("musique", ""))

    # Valeur handicap (même champ que poids pour les handicaps)
    handicap = p.get("handicapPoids")
    if handicap and isinstance(handicap, (int, float)):
        result["valeur"] = safe_str(handicap / 10)
    else:
        result["valeur"] = ""

    # Équipement
    oeilleres = safe_str(p.get("oeilleres", "")).upper()
    equip_map = {"OEILLERES_PLATES": "0", "OEILLERES_AUSTRALIENNES": "A",
                 "OEIL_PLEIN": "O", "SANS_OEILLERES": ""}
    equip = equip_map.get(oeilleres, "")
    result["equipement(s)"] = equip

    # Stats bonus
    result["nb_courses"] = p.get("nombreCourses", 0)
    result["nb_victoires"] = p.get("nombreVictoires", 0)
    result["nb_places"] = p.get("nombrePlaces", 0)

    # COTES PMU (dernierRapportDirect = cote pour 1€ misé)
    rapport_direct = p.get("dernierRapportDirect", {})
    rapport_ref = p.get("dernierRapportReference", {})
    if isinstance(rapport_direct, dict) and rapport_direct.get("rapport"):
        result["cote"] = rapport_direct["rapport"]  # Ex: 4 = cote 4.0
        result["cote_tendance"] = safe_str(rapport_direct.get("indicateurTendance", ""))
    if isinstance(rapport_ref, dict) and rapport_ref.get("rapport"):
        result["cote_reference"] = rapport_ref["rapport"]

    # Avis entraîneur (POSITIF, NEGATIF, NEUTRE)
    avis = p.get("avisEntraineur", "")
    if avis:
        result["avis_entraineur"] = safe_str(avis)

    return result


# ============================================================
# Pipeline
# ============================================================

def scrape_courses(date_obj=None):
    if date_obj is None:
        date_obj = datetime.now()

    date_pmu = date_obj.strftime("%d%m%Y")
    date_iso = date_obj.strftime("%Y-%m-%d")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    logger.info(f"🏇 Extraction des courses du {date_iso}")
    logger.info(f"🔗 API PMU - Date: {date_pmu}")

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

        # Spécialité: pas au niveau réunion, prendre depuis la première course
        courses_data = reunion_raw.get("courses", [])
        reunion_type = "Indéterminé"
        if courses_data:
            first_spec = (courses_data[0].get("discipline")
                         or courses_data[0].get("specialite") or "")
            reunion_type = map_specialite(first_spec)

        logger.info(f"\n🏟️  R{reunion_num} - {hippodrome_nom} ({reunion_type})")

        reunion_output = {
            "hippodrome": hippodrome_nom,
            "type_reunion": reunion_type,
            "date_extraction": datetime.now().isoformat(),
            "url_source": f"{BASE_URL}/programme/{date_pmu}/R{reunion_num}",
            "courses": []
        }

        for course_raw in courses_data:
            course_num = course_raw.get("numOrdre", 0)
            course_nom = safe_str(course_raw.get("libelle", "")).upper()
            course_horaire = format_heure(course_raw.get("heureDepart"))
            course_spec = (course_raw.get("discipline")
                          or course_raw.get("specialite") or "")
            course_type = map_specialite(course_spec) if course_spec else reunion_type
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
                mapped = []
                for p in participants_list:
                    try:
                        if p.get("estNonPartant", False):
                            continue
                        if safe_str(p.get("statut", "")).upper() == "NON_PARTANT":
                            continue
                        mp = map_participant(p)
                        if mp.get("cheval") or mp.get("jockey"):
                            mapped.append(mp)
                    except Exception as e:
                        logger.warning(f"    ⚠️  Erreur mapping: {e}")
                        continue

                if mapped:
                    course_mapped["participants"] = mapped
                    reunion_output["courses"].append(course_mapped)
                    logger.info(f"    👤 {len(mapped)} participants")
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

    logger.info(f"\n{'='*60}")
    logger.info(f"📊 RÉSUMÉ - {date_iso}")
    logger.info(f"  Réunions: {len(reunions_data)} | Fichiers: {files_saved}")
    logger.info(f"✅ Extraction terminée!")
    return files_saved > 0


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
                logger.error(f"❌ Format invalide: {arg}")
                sys.exit(1)

    logger.info("🚀 Scraper Courses Hippiques - API PMU v2")
    logger.info(f"📅 Date: {date_obj.strftime('%Y-%m-%d')}")
    logger.info("")
    success = scrape_courses(date_obj)
    sys.exit(0 if success else 1)
