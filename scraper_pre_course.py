#!/usr/bin/env python3
"""
Scraper pré-course : capture les cotes juste avant le départ
pour les hippodromes majeurs (Saint-Cloud, Longchamp, Chantilly, etc.)

Deux modes :
  python3 scraper_pre_course.py                 une passe (l'ancien cron)
  python3 scraper_pre_course.py --boucle 235    tourne 235 minutes, une passe
                                                toutes les ~40 s, commit+push
                                                toutes les 3 minutes

Pourquoi la boucle (15/09/2026) : un cron GitHub « toutes les 10 minutes »
part avec 5 à 20 minutes de retard ; sur août-septembre, 2 courses de la
règle sur 11 avaient un relevé live. Le test séquentiel doit enregistrer le
pari FAIT — le favori à T-2 et sa cote — donc il faut un relevé toutes les
minutes dans les 5 dernières. Chaque fichier garde le relevé le plus proche
du départ (participants) ET l'historique des relevés (releves), pour mesurer
un jour la dérive à T-2 contre la cote finale.
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

# Fenêtre de capture : on scrape si la course démarre dans les 20 prochaines minutes
# (marge volontaire : absorbe un run retardé par la file d'attente GitHub Actions)
FENETRE_MINUTES = 20          # mode une passe
FENETRE_BOUCLE = 6            # mode boucle : on relève dans les 6 dernières minutes
PAS_BOUCLE_S = 40             # secondes entre deux passes
PUSH_TOUTES_LES_S = 180       # commit + push toutes les 3 minutes


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


def enregistrer_snapshot(filepath, result, minutes_avant, logger):
    """Garde le snapshot le PLUS PROCHE du départ.

    Deux défauts corrigés ici (mesure : 50 captures sur 152 étaient postérieures
    au départ, cf. bench/fraicheur_cotes.mjs) :
      - on gardait la PREMIÈRE capture, donc la plus ÉLOIGNÉE du départ, alors
        que la valeur d'une cote live est d'être tardive ;
      - la branche « vient de partir » écrivait sans vérifier l'existant : une
        bonne capture à T-8 était écrasée par une capture à T+3, inutilisable
        pour parier.

    Règle : un snapshot pris avant le départ prime toujours sur un snapshot pris
    après ; entre deux snapshots d'avant, le plus tardif gagne.
    """
    if os.path.exists(filepath):
        try:
            with open(filepath, encoding='utf-8') as f:
                ancien = json.load(f).get("minutes_avant_depart")
        except Exception:
            ancien = None
        if ancien is not None:
            # un snapshot d'après le départ ne remplace jamais un snapshot d'avant
            if minutes_avant <= 0 < ancien:
                logger.info(f"   \u23ed\ufe0f  conserve T-{ancien} min (le nouveau est postérieur au départ)")
                return False
            # sinon on ne remplace que si l'on se rapproche du départ
            if 0 < ancien <= minutes_avant:
                logger.info(f"   \u23ed\ufe0f  conserve T-{ancien} min (plus proche que T-{minutes_avant})")
                return False
    # historique : chaque relevé (cotes des partants, horodaté) est conservé,
    # même s'il n'est pas le plus proche du départ — c'est la matière pour
    # mesurer la dérive à T-2 contre la clôture.
    releves = []
    if os.path.exists(filepath):
        try:
            with open(filepath, encoding='utf-8') as f:
                releves = json.load(f).get("releves") or []
        except Exception:
            releves = []
    releves.append({
        "scraped_at": result.get("scraped_at"), "minutes_avant_depart": minutes_avant,
        "cotes": {str(p.get("numPmu")): p.get("cote_live") for p in result.get("participants", [])},
    })
    result = dict(result, releves=releves[-30:])
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return True


_prog_cache = {"t": 0, "val": (None, None)}

def programme_cache(max_age_s=180):
    """Le programme du jour, rafraîchi au plus toutes les 3 minutes (mode boucle)."""
    if time.time() - _prog_cache["t"] > max_age_s:
        _prog_cache["val"] = get_programme_jour()
        _prog_cache["t"] = time.time()
    return _prog_cache["val"]


def main(fenetre=None, silencieux=False):
    fenetre = fenetre or FENETRE_MINUTES
    if not silencieux:
        logger.info("🏇 Scraper pré-course — cotes live")
        logger.info(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    reunions, date_pmu = programme_cache()
    if not reunions:
        if not silencieux:
            logger.info("❌ Pas de programme aujourd'hui")
        return 0

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

            if 0 < minutes_avant <= fenetre:
                course_num = course.get("numOrdre", 0)
                course_nom = course.get("libelle", "")
                logger.info(f"\n⏰ {hippo_nom} R{reunion_num} C{course_num} — {course_nom}")
                logger.info(f"   Départ dans {minutes_avant:.0f} min ({depart_dt.strftime('%H:%M')})")

                course["_minutes_avant"] = round(minutes_avant)
                result = scrape_cotes_course(date_pmu, reunion_num, course_num, course)

                if result:
                    result["hippodrome"] = hippo_nom.upper()

                    # Sauvegarder — NE PAS écraser si déjà capté (1ère capture = la bonne)
                    safe_hippo = hippo_nom.lower().replace(" ", "_").replace("/", "-")
                    filename = f"{date_iso}_{safe_hippo}_R{reunion_num}C{course_num}_live.json"
                    filepath = os.path.join(OUTPUT_DIR, filename)

                    if not enregistrer_snapshot(filepath, result, minutes_avant, logger):
                        continue

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
                    if not enregistrer_snapshot(filepath, result, minutes_avant, logger):
                        continue
                    courses_scrapees += 1

    if not silencieux:
        if courses_scrapees == 0:
            logger.info(f"\n📭 Aucune course cible dans les {fenetre} prochaines minutes")
        else:
            logger.info(f"\n✅ {courses_scrapees} courses scrapées (cotes live)")
    return courses_scrapees


def git_push():
    """Commit et pousse les relevés (index régénéré). Jamais bloquant."""
    import subprocess
    def run(*cmd):
        return subprocess.run(cmd, capture_output=True, text=True)
    try:
        run("python3", "scripts/update_cotes_live_index.py")
        # l'index des courses aussi : le front ne voit une journée que par
        # data/courses/_index.json, et les workflows qui déposent des fichiers
        # (backtest, extraction) ne le régénèrent pas toujours — la boucle, elle,
        # passe toutes les 3 minutes.
        run("python3", "scripts/update_courses_index.py")
        run("git", "add", "data/cotes_live/", "data/courses/_index.json")
        if run("git", "diff", "--cached", "--quiet").returncode == 0:
            return False
        run("git", "commit", "-m", f"⏱️ Cotes live pré-course {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        for _ in range(3):
            run("git", "pull", "--rebase", "origin", "main")
            if run("git", "push", "origin", "main").returncode == 0:
                logger.info(f"   ⬆️  poussé {datetime.now().strftime('%H:%M:%S')}")
                return True
            time.sleep(5)
        logger.warning("   ⚠️ push échoué trois fois, on réessaiera au prochain tour")
    except Exception as e:
        logger.warning(f"   ⚠️ git : {e}")
    return False


def boucle(duree_min):
    """Tourne duree_min minutes : une passe toutes les PAS_BOUCLE_S secondes,
    relevés dans les FENETRE_BOUCLE dernières minutes, push régulier."""
    logger.info(f"🏇 Scraper pré-course — boucle de {duree_min} min, passe toutes les {PAS_BOUCLE_S} s, fenêtre T-{FENETRE_BOUCLE} min")
    fin = time.time() + duree_min * 60
    dernier_push = time.time()
    total = 0
    while time.time() < fin:
        t0 = time.time()
        try:
            total += main(fenetre=FENETRE_BOUCLE, silencieux=True) or 0
        except Exception as e:
            logger.warning(f"   ⚠️ passe : {e}")
        if time.time() - dernier_push >= PUSH_TOUTES_LES_S:
            git_push()
            dernier_push = time.time()
        time.sleep(max(5, PAS_BOUCLE_S - (time.time() - t0)))
    git_push()
    logger.info(f"🏁 fin de boucle : {total} relevés")


if __name__ == "__main__":
    import sys
    if "--boucle" in sys.argv:
        i = sys.argv.index("--boucle")
        boucle(int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 235)
    else:
        main()
