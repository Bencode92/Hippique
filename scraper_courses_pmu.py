#!/usr/bin/env python3
"""
Scraper des courses hippiques via l'API PMU Turfinfo.
Version avec DEBUG pour identifier les vrais noms de champs de l'API.
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
DEBUG_DIR = "data/debug_captures"
REQUEST_DELAY = 0.3
DEBUG_LOGGED = False  # Pour ne logger qu'une fois


def api_get(endpoint, max_retries=3):
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                return None
            else:
                logger.warning(f"  ⚠️  HTTP {response.status_code} (tentative {attempt+1})")
        except requests.exceptions.RequestException as e:
            logger.warning(f"  ⚠️  Réseau: {e} (tentative {attempt+1})")
        if attempt < max_retries - 1:
            time.sleep(REQUEST_DELAY * (attempt + 1))
    return None


def format_date_pmu(d):
    return d.strftime("%d%m%Y")

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
    if field is None:
        return ""
    if isinstance(field, str):
        return field.strip()
    if isinstance(field, dict):
        return safe_str(field.get("nom", ""))
    return safe_str(field)

def try_get(d, *keys):
    """Essaie plusieurs clés et retourne la première valeur non-None."""
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


# ============================================================
# Mapping
# ============================================================

def map_specialite(code):
    if not code:
        return "Indéterminé"
    code_upper = code.upper() if isinstance(code, str) else code
    mapping = {
        "PLAT": "Plat",
        "OBSTACLE": "Obstacle",
        "STEEPLE_CHASE": "Obstacle",
        "HAIES": "Obstacle",
        "CROSS_COUNTRY": "Obstacle",
        "TROT_ATTELE": "Trot",
        "TROT_MONTE": "Trot",
    }
    return mapping.get(code_upper, mapping.get(code, code if code else "Indéterminé"))


def build_cheval_label(p):
    nom = safe_str(p.get("nom", "")).upper()
    sexe = safe_str(p.get("sexe", "")).upper()
    race = safe_str(p.get("race", "")).upper()
    age = safe_str(p.get("age", ""))

    sexe_map = {"MALES": "M.", "FEMELLES": "F.", "HONGRES": "H.",
                "MALE": "M.", "FEMELLE": "F.", "HONGRE": "H."}
    sexe_label = sexe_map.get(sexe, sexe[:1] + "." if sexe else "")

    race_map = {"PUR_SANG": "PS.", "PURSANG": "PS.", "AQPS": "AQPS.", 
                "ARABE": "AR.", "AUTRE_QUE_PUR_SANG": "AQPS."}
    race_label = race_map.get(race, race[:2] + "." if race else "")

    age_label = f"{age} a." if age else ""

    parts = [nom]
    if sexe_label or race_label:
        parts.append(f"{sexe_label}{race_label}")
    if age_label:
        parts.append(age_label)
    return " ".join(parts)


def build_pere_mere(p):
    # Essayer plusieurs structures possibles
    pere = get_nom(try_get(p, "pere", "father", "sire"))
    mere = get_nom(try_get(p, "mere", "mother", "dam"))
    pmm = get_nom(try_get(p, "pereMere", "grandsire", "damSire"))
    
    if pere and mere:
        result = f"Par: {pere} et {mere}"
        if pmm:
            result += f" ({pmm})"
        return result
    elif pere:
        return f"Par: {pere}"
    return ""


def format_poids(poids_val):
    if not poids_val:
        return ""
    if isinstance(poids_val, (int, float)):
        if poids_val > 100:
            kg = poids_val / 10
            return f"{int(kg)} kg" if kg == int(kg) else f"{kg} kg"
        else:
            return f"{poids_val} kg" if poids_val > 0 else ""
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

    result["propriétaire"] = get_nom(try_get(p, "proprietaire", "owner"))
    result["entraineur"] = get_nom(try_get(p, "entraineur", "trainer"))
    
    # Jockey: essayer plusieurs champs
    jockey_val = try_get(p, "jockey", "driver", "monteur", "cavalier")
    result["jockey"] = get_nom(jockey_val)

    # Poids: essayer plusieurs champs
    poids_val = try_get(p, "poidsConditionMonte", "poidsMonte", 
                        "poidsJockey", "handicapValeur", "poidsReel")
    result["poids"] = format_poids(poids_val)

    # Gains: essayer plusieurs structures
    gains_str = ""
    gains_data = try_get(p, "gainsParticipant", "gains")
    if gains_data and isinstance(gains_data, dict):
        gc = try_get(gains_data, "gainsCarriere", "gainsAnneeEnCours", "total")
        if gc and isinstance(gc, dict):
            somme = gc.get("somme", 0)
            gains_str = safe_str(somme) if somme else ""
        elif isinstance(gc, (int, float)):
            gains_str = safe_str(gc) if gc else ""
    elif isinstance(gains_data, (int, float)):
        gains_str = safe_str(gains_data) if gains_data else ""
    result["gains"] = gains_str

    result["musique"] = safe_str(p.get("musique", ""))

    # Valeur handicap
    handicap = try_get(p, "handicapPoids", "handicapValeur", "valeurHandicap")
    if handicap:
        if isinstance(handicap, (int, float)) and handicap > 100:
            result["valeur"] = safe_str(handicap / 10)
        else:
            result["valeur"] = safe_str(handicap)
    else:
        result["valeur"] = ""

    # Équipement
    oeilleres = safe_str(p.get("oeilleres", "")).upper()
    equip_map = {"OEILLERES_PLATES": "0", "OEILLERES_AUSTRALIENNES": "A", "OEIL_PLEIN": "O"}
    equip = equip_map.get(oeilleres, "")
    ferrage = safe_str(p.get("defFerrage", "")).upper()
    ferrage_map = {"DEFERRES_ANTERIEURS": "da", "DEFERRES_POSTERIEURS": "dp", "DEFERRES_4_PIEDS": "d4"}
    equip += ferrage_map.get(ferrage, "")
    result["equipement(s)"] = equip

    result["éleveurs"] = get_nom(try_get(p, "eleveur", "breeder"))

    return result


# ============================================================
# Pipeline
# ============================================================

def scrape_courses(date_obj=None):
    global DEBUG_LOGGED
    if date_obj is None:
        date_obj = datetime.now()

    date_pmu = format_date_pmu(date_obj)
    date_iso = date_obj.strftime("%Y-%m-%d")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(DEBUG_DIR, exist_ok=True)

    logger.info(f"🏇 Extraction des courses du {date_iso}")
    logger.info(f"🔗 API PMU - Date: {date_pmu}")

    programme = api_get(f"programme/{date_pmu}?specialisation=INTERNET")
    if not programme:
        logger.error(f"❌ Impossible de récupérer le programme pour {date_iso}")
        return False

    # DEBUG: sauvegarder le programme complet
    with open(os.path.join(DEBUG_DIR, "raw_programme.json"), 'w', encoding='utf-8') as f:
        json.dump(programme, f, ensure_ascii=False, indent=2)
    logger.info(f"🔍 DEBUG: Programme brut sauvegardé dans {DEBUG_DIR}/raw_programme.json")

    reunions_data = programme.get("programme", {}).get("reunions", [])
    if not reunions_data:
        logger.warning(f"⚠️  Aucune réunion trouvée pour {date_iso}")
        return False

    # DEBUG: afficher les clés de la première réunion
    first_reunion = reunions_data[0]
    logger.info(f"\n🔍 DEBUG REUNION R1 - Clés disponibles: {list(first_reunion.keys())}")
    logger.info(f"🔍 DEBUG REUNION R1 - specialite: {first_reunion.get('specialite')}")
    logger.info(f"🔍 DEBUG REUNION R1 - discipline: {first_reunion.get('discipline')}")
    logger.info(f"🔍 DEBUG REUNION R1 - typePiste: {first_reunion.get('typePiste')}")
    logger.info(f"🔍 DEBUG REUNION R1 - audience: {first_reunion.get('audience')}")
    logger.info(f"🔍 DEBUG REUNION R1 - hippodrome: {first_reunion.get('hippodrome')}")

    logger.info(f"\n✅ {len(reunions_data)} réunion(s) trouvée(s)")
    files_saved = 0

    for reunion_raw in reunions_data:
        reunion_num = reunion_raw.get("numOfficiel", 0)
        hippodrome_data = reunion_raw.get("hippodrome", {})
        if isinstance(hippodrome_data, str):
            hippodrome_nom = hippodrome_data.upper()
        else:
            hippodrome_nom = safe_str(hippodrome_data.get("libelleCourt", "INCONNU")).upper()

        # Essayer plusieurs champs pour la spécialité
        specialite = (reunion_raw.get("specialite") 
                     or reunion_raw.get("discipline")
                     or reunion_raw.get("typePiste")
                     or "")
        reunion_type = map_specialite(specialite)
        
        # Si toujours indéterminé, regarder les courses
        if reunion_type == "Indéterminé":
            courses = reunion_raw.get("courses", [])
            if courses:
                first_course_spec = courses[0].get("specialite", "") or courses[0].get("discipline", "")
                if first_course_spec:
                    reunion_type = map_specialite(first_course_spec)

        logger.info(f"\n🏟️  R{reunion_num} - {hippodrome_nom} ({reunion_type})")

        reunion_output = {
            "hippodrome": hippodrome_nom,
            "type_reunion": reunion_type,
            "date_extraction": datetime.now().isoformat(),
            "url_source": f"{BASE_URL}/programme/{date_pmu}/R{reunion_num}",
            "courses": []
        }

        courses_data = reunion_raw.get("courses", [])

        # DEBUG: première course
        if courses_data and not DEBUG_LOGGED:
            first_course = courses_data[0]
            logger.info(f"🔍 DEBUG COURSE C1 - Clés: {list(first_course.keys())}")
            logger.info(f"🔍 DEBUG COURSE C1 - specialite: {first_course.get('specialite')}")
            logger.info(f"🔍 DEBUG COURSE C1 - discipline: {first_course.get('discipline')}")

        for course_raw in courses_data:
            course_num = course_raw.get("numOrdre", 0)
            course_nom = safe_str(course_raw.get("libelle", "")).upper()
            course_horaire = format_heure(course_raw.get("heureDepart"))
            course_specialite = (course_raw.get("specialite") 
                                or course_raw.get("discipline") or "")
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

                # DEBUG: premier participant - sauvegarder TOUT
                if participants_list and not DEBUG_LOGGED:
                    first_p = participants_list[0]
                    logger.info(f"\n🔍 DEBUG PARTICIPANT #1 - Toutes les clés:")
                    logger.info(f"    Clés: {sorted(first_p.keys())}")
                    
                    # Logger chaque champ important
                    for key in sorted(first_p.keys()):
                        val = first_p[key]
                        val_str = str(val)[:100]  # Tronquer
                        logger.info(f"    {key}: {val_str}")
                    
                    # Sauvegarder le JSON brut
                    debug_path = os.path.join(DEBUG_DIR, "raw_first_participant.json")
                    with open(debug_path, 'w', encoding='utf-8') as f:
                        json.dump(first_p, f, ensure_ascii=False, indent=2)
                    logger.info(f"    💾 Sauvegardé dans {debug_path}")
                    
                    # Sauvegarder toute la réponse participants
                    debug_path2 = os.path.join(DEBUG_DIR, "raw_participants_response.json")
                    with open(debug_path2, 'w', encoding='utf-8') as f:
                        json.dump(participants_raw, f, ensure_ascii=False, indent=2)
                    logger.info(f"    💾 Réponse complète dans {debug_path2}")
                    
                    DEBUG_LOGGED = True

                mapped_participants = []
                for p in participants_list:
                    try:
                        if p.get("estNonPartant", False):
                            continue
                        mapped_p = map_participant(p)
                        if mapped_p.get("cheval") or mapped_p.get("jockey"):
                            mapped_participants.append(mapped_p)
                    except Exception as e:
                        logger.warning(f"    ⚠️  Erreur mapping: {e}")
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
                logger.error(f"❌ Format invalide: {arg} (utiliser YYYY-MM-DD)")
                sys.exit(1)

    logger.info("🚀 Scraper PMU - Version DEBUG")
    logger.info(f"📅 Date: {date_obj.strftime('%Y-%m-%d')}")
    logger.info("")

    success = scrape_courses(date_obj)
    sys.exit(0 if success else 1)
