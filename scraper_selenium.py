#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données hippiques depuis France Galop
Utilise Selenium pour supporter le contenu chargé dynamiquement via JavaScript
"""

import os
import json
import sys
import time
from datetime import datetime
import logging
import re
import random
import argparse

# Dépendances externes
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException, StaleElementReferenceException

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CATEGORIES = {
    "chevaux": {
        "url": "https://www.france-galop.com/fr/hommes-chevaux/chevaux"
    },
    "proprietaires": {
        "url": "https://www.france-galop.com/fr/hommes-chevaux/proprietaires"
    },
    "entraineurs": {
        "url": "https://www.france-galop.com/fr/hommes-chevaux/entraineurs"
    },
    "eleveurs": {
        "url": "https://www.france-galop.com/fr/hommes-chevaux/eleveurs"
    },
    "jockeys": {
        "url": "https://www.france-galop.com/fr/hommes-chevaux/jockeys"
    }
}

# Dossier pour stocker les données
DATA_DIR = "data"
DEBUG_DIR = os.path.join(DATA_DIR, "debug")

def ensure_dirs():
    """Crée les dossiers nécessaires s'ils n'existent pas"""
    for directory in [DATA_DIR, DEBUG_DIR]:
        if not os.path.exists(directory):
            os.makedirs(directory)
            logger.info(f"Dossier créé: {directory}")

def save_debug_html(html, category, suffix=""):
    """Sauvegarde le HTML pour diagnostic"""
    try:
        if not os.path.exists(DEBUG_DIR):
            os.makedirs(DEBUG_DIR)
        
        filename = os.path.join(DEBUG_DIR, f"{category}{suffix}.html")
        with open(filename, "w", encoding="utf-8") as f:
            f.write(html)
        logger.info(f"HTML sauvegardé pour diagnostic: {filename}")
    except Exception as e:
        logger.warning(f"Impossible de sauvegarder le HTML pour diagnostic: {e}")

def get_selenium_driver():
    """Configure et retourne un driver Selenium Chrome"""
    options = Options()
    
    # Options communes pour headless
    options.add_argument("--headless=new")  # nouveau mode headless
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    
    # Window size
    options.add_argument("--window-size=1920,1080")
    
    # User agent
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    ]
    options.add_argument(f"user-agent={random.choice(user_agents)}")
    
    # Améliorer la performance
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-notifications")
    
    # Configurer le service
    service = Service(ChromeDriverManager().install())
    
    # Créer et retourner le driver
    driver = webdriver.Chrome(service=service, options=options)
    
    return driver

def extract_data_with_selenium(url, category, max_plus_clicks=None):
    """Extrait les données en utilisant Selenium pour exécuter le JavaScript"""
    logger.info(f"Extraction des données pour {category} depuis {url}")
    
    driver = None
    try:
        # Initialiser Selenium
        driver = get_selenium_driver()
        logger.info(f"Ouverture de la page {url}")
        driver.get(url)
        
        # Attendre que la page charge complètement
        time.sleep(5)  # Augmenté à 5 secondes pour un chargement initial complet
        
        # Tenter d'attendre que le tableau soit présent (max 15 secondes)
        try:
            WebDriverWait(driver, 15).until(  # Augmenté à 15 secondes
                EC.presence_of_element_located((By.CSS_SELECTOR, "table[role='grid'], table.tablesorter"))
            )
            logger.info(f"Tableau détecté pour {category}")
        except TimeoutException:
            logger.warning(f"Timeout en attendant le tableau pour {category}")
            
        # Cliquer sur "Plus" tant qu'il est présent pour charger toutes les données
        click_count = 0
        consecutive_failures = 0
        
        while max_plus_clicks is None or click_count < max_plus_clicks:
            try:
                # Essayer différents sélecteurs pour le bouton "Plus"
                selectors = [
                    "//button[contains(text(), 'Plus')]",  # Bouton avec texte "Plus"
                    "//button[contains(@class, 'more')]",  # Bouton avec classe contenant "more"
                    "//a[contains(text(), 'Plus')]",       # Lien avec texte "Plus"
                    "//a[contains(@class, 'more')]",       # Lien avec classe contenant "more"
                    "//button[contains(@class, 'load-more')]", # Bouton "load more"
                    "//button[contains(@class, 'pagination')]" # Bouton de pagination
                ]
                
                plus_button = None
                for selector in selectors:
                    try:
                        plus_button = WebDriverWait(driver, 5).until(  # Augmenté à 5 secondes
                            EC.element_to_be_clickable((By.XPATH, selector))
                        )
                        break
                    except TimeoutException:
                        continue
                
                if not plus_button:
                    logger.info("Aucun bouton 'Plus' détecté, toutes les données sont chargées.")
                    break
                
                logger.info(f"Bouton 'Plus' trouvé, clic #{click_count+1} pour charger plus de résultats...")
                
                # Faire défiler jusqu'au bouton pour s'assurer qu'il est visible
                driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", plus_button)
                time.sleep(2)  # Attendre un peu que le défilement se termine
                
                # Cliquer sur le bouton avec JavaScript (plus fiable qu'un clic standard)
                driver.execute_script("arguments[0].click();", plus_button)
                click_count += 1
                
                # Attendre que de nouvelles données se chargent avec délai aléatoire
                time.sleep(random.uniform(3.0, 5.0))  # Attente aléatoire entre 3 et 5 secondes
                
                # Vérifier si le tableau a changé/grandi
                rows_before = len(driver.find_elements(By.CSS_SELECTOR, "table[role='grid'] tr, table.tablesorter tr"))
                time.sleep(3)  # Augmenté à 3 secondes pour donner plus de temps au chargement
                rows_after = len(driver.find_elements(By.CSS_SELECTOR, "table[role='grid'] tr, table.tablesorter tr"))
                
                logger.info(f"Nombre de lignes après clic: {rows_after} (avant: {rows_before})")
                
                # Si le nombre de lignes n'a pas changé après plusieurs clics consécutifs, arrêter
                if rows_before == rows_after:
                    consecutive_failures += 1
                    if consecutive_failures >= 3:  # Essayer 3 fois avant d'abandonner
                        logger.info("Le nombre de lignes n'a pas augmenté après plusieurs tentatives, plus de données à charger.")
                        break
                else:
                    consecutive_failures = 0  # Réinitialiser le compteur d'échecs
                
            except (TimeoutException, NoSuchElementException, ElementClickInterceptedException, StaleElementReferenceException) as e:
                logger.info(f"Exception lors du clic: {str(e)}")
                consecutive_failures += 1
                if consecutive_failures >= 3:
                    logger.info("Trop d'exceptions consécutives, arrêt du chargement.")
                    break
        
        logger.info(f"Total de {click_count} clics sur 'Plus' effectués")
        
        # Attendre un peu après le dernier clic pour s'assurer que toutes les données sont chargées
        time.sleep(5)  # Augmenté à 5 secondes
        
        # Prendre le HTML complet de la page
        html = driver.page_source
        
        # Sauvegarder le HTML pour debug
        save_debug_html(html, category, "_selenium")
        
        # Analyser le HTML
        soup = BeautifulSoup(html, 'html.parser')
        
        # Trouver le tableau
        table = find_table(soup, category)
        
        if not table:
            logger.error(f"Aucun tableau trouvé pour {category} même après utilisation de Selenium")
            # Sauvegarde le corps de la page pour analyse ultérieure
            body_content = soup.find('body')
            if body_content:
                save_debug_html(str(body_content), category, "_selenium_body")
                
            return {
                "metadata": {
                    "source": url,
                    "date_extraction": datetime.now().isoformat(),
                    "category": category,
                    "erreur": "Aucun tableau trouvé avec Selenium"
                },
                "resultats": []
            }
        
        # Extraire les données du tableau
        headers = extract_headers(table)
        rows = extract_rows(table, headers)
        
        # Créer l'objet de données
        data = {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "nombre_resultats": len(rows),
                "plus_clicks": click_count
            },
            "resultats": rows
        }
        
        logger.info(f"Extraction réussie pour {category}: {len(rows)} résultats")
        return data
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction pour {category}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "erreur": str(e)
            },
            "resultats": []
        }
    
    finally:
        # Fermer le driver Selenium
        if driver:
            driver.quit()
            logger.info("Driver Selenium fermé")

def find_table(soup, category):
    """Trouve le tableau dans la page"""
    # Stratégie 1: Chercher table avec role=grid (plus spécifique au site France Galop)
    table = soup.find("table", {"role": "grid"})
    if table:
        logger.info(f"Table trouvée via role='grid'")
        return table
    
    # Stratégie 2: Chercher table avec classe contenant tablesorter
    table = soup.find("table", class_=lambda c: c and "tablesorter" in c)
    if table:
        logger.info(f"Table trouvée via classe 'tablesorter'")
        return table
    
    # Stratégie 3: Chercher dans div.classement
    div_classement = soup.find("div", class_=lambda c: c and "classement" in c.lower())
    if div_classement:
        table = div_classement.find("table")
        if table:
            logger.info(f"Table trouvée via div.classement")
            return table
    
    # Stratégie 4: Chercher n'importe quelle table
    tables = soup.find_all("table")
    if tables:
        # Prendre la table avec le plus de lignes
        best_table = max(tables, key=lambda t: len(t.find_all("tr")))
        logger.info(f"Table trouvée (table avec le plus de lignes)")
        return best_table
    
    logger.warning(f"Aucun tableau trouvé pour {category}")
    return None

def extract_headers(table):
    """Extrait les en-têtes d'un tableau"""
    headers = []
    
    # Chercher les en-têtes dans <thead>
    thead = table.find("thead")
    if thead:
        for th in thead.find_all("th"):
            header = None
            
            # Essayer d'abord les attributs data-*
            for attr in ["data-label", "aria-label"]:
                if th.has_attr(attr) and th[attr].strip():
                    header = th[attr].strip()
                    break
            
            # Si pas trouvé, utiliser le texte
            if not header:
                header = th.text.strip()
            
            # Si toujours pas d'en-tête, générer un nom
            if not header:
                header = f"Column_{len(headers)+1}"
            
            headers.append(header)
    
    # Si pas de <thead>, prendre la première ligne
    if not headers:
        first_row = table.find("tr")
        if first_row:
            for cell in first_row.find_all(["th", "td"]):
                header = cell.text.strip()
                if not header:
                    header = f"Column_{len(headers)+1}"
                headers.append(header)
    
    # Si toujours pas d'en-têtes, générer des en-têtes génériques
    if not headers:
        # Trouver le nombre maximum de cellules dans une ligne
        max_cells = 0
        for row in table.find_all("tr"):
            cells_count = len(row.find_all(["td", "th"]))
            max_cells = max(max_cells, cells_count)
        
        headers = [f"Column_{i+1}" for i in range(max_cells)]
    
    logger.info(f"En-têtes extraits: {headers}")
    return headers

def extract_rows(table, headers):
    """Extrait les données des lignes du tableau"""
    results = []
    
    # Trouver les lignes de données (dans tbody ou toutes sauf la première)
    tbody = table.find("tbody")
    if tbody:
        rows = tbody.find_all("tr")
    else:
        all_rows = table.find_all("tr")
        rows = all_rows[1:] if len(all_rows) > 1 else all_rows
    
    # Extraire les données de chaque ligne
    for row in rows:
        cells = row.find_all(["td", "th"])
        
        # Ignorer les lignes vides ou trop courtes
        if len(cells) < 2:
            continue
        
        row_data = {}
        
        # Extraire les données de chaque cellule
        for idx, cell in enumerate(cells):
            if idx >= len(headers):
                continue
                
            # Obtenir la valeur
            value = None
            
            # Essayer d'abord les attributs data-*
            for attr in ["data-text", "data-value"]:
                if cell.has_attr(attr) and cell[attr].strip():
                    value = cell[attr].strip()
                    break
            
            # Si pas trouvé, utiliser le texte
            if value is None:
                value = cell.text.strip()
            
            # Ignorer les cellules vides
            if not value:
                continue
            
            # Convertir en nombre si possible
            if re.match(r'^[\d\s.,]+$', value):
                try:
                    # Nettoyer et convertir
                    clean_value = value.replace(' ', '').replace(',', '.')
                    if '.' in clean_value:
                        value = float(clean_value)
                    else:
                        value = int(clean_value)
                except (ValueError, TypeError):
                    pass
            
            # Stocker la valeur
            row_data[headers[idx]] = value
            
            # Capturer aussi l'URL si présente
            link = cell.find("a")
            if link and link.has_attr("href"):
                url = link["href"]
                
                # Rendre l'URL absolue si nécessaire
                if not url.startswith("http"):
                    url = f"https://www.france-galop.com{url}" if not url.startswith("/") else f"https://www.france-galop.com{url}"
                
                row_data[f"{headers[idx]}_url"] = url
        
        # Ajouter la ligne aux résultats si non vide
        if row_data:
            results.append(row_data)
    
    return results

def save_to_json(data, category):
    """Sauvegarde les données dans un fichier JSON"""
    filename = os.path.join(DATA_DIR, f"{category}.json")
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Données sauvegardées dans {filename}")
        return True
    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde dans {filename}: {str(e)}")
        return False

def parse_arguments():
    """Parse les arguments de ligne de commande"""
    parser = argparse.ArgumentParser(description="Extraction de données hippiques France Galop")
    
    parser.add_argument("categories", nargs="?", default="",
                        help="Catégories à extraire séparées par virgule (ex: jockeys,chevaux)")
    
    parser.add_argument("--max-clicks", type=int, default=None,
                        help="Nombre maximum de clics sur le bouton 'Plus' (par défaut: aucune limite)")
    
    parser.add_argument("--wait-time", type=float, default=3.0,
                        help="Temps d'attente de base entre les actions (par défaut: 3.0 secondes)")
    
    return parser.parse_args()

def main():
    """Fonction principale"""
    logger.info("Démarrage du script d'extraction France Galop avec Selenium")
    
    # S'assurer que les dossiers existent
    ensure_dirs()
    
    # Analyser les arguments
    args = parse_arguments()
    
    # Vérifier si des catégories spécifiques sont demandées
    selected_categories = []
    if args.categories:
        arg_categories = args.categories.split(',')
        selected_categories = [cat.strip() for cat in arg_categories if cat.strip() in CATEGORIES]
    
    # Si aucune catégorie spécifique n'est demandée, traiter toutes les catégories
    if not selected_categories:
        selected_categories = list(CATEGORIES.keys())
    
    logger.info(f"Catégories à extraire: {', '.join(selected_categories)}")
    logger.info(f"Limite de clics 'Plus': {args.max_clicks if args.max_clicks is not None else 'Aucune'}")
    logger.info(f"Temps d'attente de base: {args.wait_time} secondes")
    
    # Résultats globaux
    results = {}
    
    # Parcourir chaque catégorie sélectionnée
    for category in selected_categories:
        config = CATEGORIES[category]
        url = config["url"]
        
        # Extraction des données avec Selenium
        data = extract_data_with_selenium(url, category, max_plus_clicks=args.max_clicks)
        
        # Sauvegarde des données
        if data:
            success = save_to_json(data, category)
            results[category] = {
                "success": success,
                "count": len(data.get("resultats", [])),
                "error": data.get("metadata", {}).get("erreur", None)
            }
        
        # Pause pour éviter de surcharger le serveur
        time.sleep(random.uniform(2.0, 5.0))  # Délai aléatoire entre 2 et 5 secondes
    
    # Résumé de l'extraction
    logger.info("Résumé de l'extraction:")
    for category, result in results.items():
        status = "✅ Succès" if result["success"] and not result.get("error") else "❌ Échec"
        count = result["count"]
        error = result.get("error", "")
        logger.info(f"{category}: {status}, {count} résultats" + (f", Erreur: {error}" if error else ""))
    
    logger.info("Extraction terminée!")

if __name__ == "__main__":
    main()
