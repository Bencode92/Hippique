#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction directe et simplifiée des données hippiques depuis France Galop
Utilise une approche ciblée pour chaque catégorie
"""

import requests
from bs4 import BeautifulSoup
import json
import os
import time
from datetime import datetime
import sys
import logging
import re
import random

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

def get_random_headers():
    """Crée des en-têtes HTTP aléatoires pour éviter la détection de bot"""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ]
    
    return {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/"
    }

def make_request(url, max_retries=3, retry_delay=2):
    """Effectue une requête HTTP avec retry automatique"""
    headers = get_random_headers()
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Requête HTTP: {url} (tentative {attempt}/{max_retries})")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            if attempt == max_retries:
                logger.error(f"Échec de la requête après {max_retries} tentatives: {str(e)}")
                return None
            logger.warning(f"Tentative {attempt} échouée: {str(e)}. Nouvel essai dans {retry_delay}s...")
            time.sleep(retry_delay)
            # Augmentation exponentielle du délai
            retry_delay *= 2
    
    return None

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

def scrap_tableau_france_galop(url, category):
    """
    Scrape spécifiquement un tableau de France Galop avec la structure connue
    """
    response = make_request(url)
    if not response:
        logger.error(f"Impossible de récupérer la page {category}.")
        return []
    
    # Sauvegarder le HTML pour debug
    save_debug_html(response.text, category)
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Trouver le tableau par son attribut role="grid" ou classe tablesorter
    table = soup.find("table", {"role": "grid"})
    if not table:
        table = soup.find("table", class_=lambda c: c and 'tablesorter' in c)
    
    if not table:
        # Chercher dans une div avec classe containant "classement"
        div_classement = soup.find("div", class_=lambda c: c and 'classement' in c.lower())
        if div_classement:
            table = div_classement.find("table")
    
    if not table:
        logger.error(f"Tableau non trouvé pour {category}.")
        return []
    
    # Extraire les en-têtes
    headers = []
    thead = table.find("thead")
    if thead:
        for th in thead.find_all("th"):
            # Essayer d'obtenir l'en-tête via différents attributs
            header = None
            for attr in ["data-label", "aria-label"]:
                if th.has_attr(attr):
                    header = th[attr]
                    break
            
            # Si pas d'attribut spécifique, utiliser le texte
            if not header:
                header = th.text.strip()
            
            # Dernier recours : utiliser un nom générique
            if not header:
                header = f"Column_{len(headers)}"
                
            headers.append(header)
    
    # Si pas de thead, utiliser la première ligne
    if not headers:
        first_row = table.find("tr")
        if first_row:
            for cell in first_row.find_all(["th", "td"]):
                header = cell.text.strip()
                if not header:
                    header = f"Column_{len(headers)}"
                headers.append(header)
    
    logger.info(f"En-têtes extraits: {headers}")
    
    # Extraire les lignes
    rows = []
    tbody = table.find("tbody")
    if tbody:
        trs = tbody.find_all("tr")
    else:
        # Prendre toutes les lignes sauf la première (en-têtes)
        all_rows = table.find_all("tr")
        trs = all_rows[1:] if len(all_rows) > 1 else all_rows
    
    for tr in trs:
        cells = tr.find_all("td")
        
        # Ignorer les lignes vides ou avec trop peu de cellules
        if len(cells) < 2:
            continue
        
        row = {}
        for idx, cell in enumerate(cells):
            if idx >= len(headers):
                continue
                
            # Essayer d'obtenir la valeur via différentes méthodes
            text = None
            for attr in ["data-text", "data-value", "data-title"]:
                if cell.has_attr(attr) and cell[attr].strip():
                    text = cell[attr].strip()
                    break
            
            # Si pas d'attribut spécifique, utiliser le texte
            if text is None:
                text = cell.text.strip()
            
            # Ignorer les cellules vides
            if not text:
                continue
                
            # Convertir en nombre si possible
            if re.match(r'^[\d\s.,]+$', text):
                text = text.replace(' ', '').replace(',', '.')
                try:
                    text = float(text) if '.' in text else int(text)
                except:
                    pass
                    
            # Stocker la valeur
            row[headers[idx]] = text
            
            # Capturer également l'URL si présente (pour les colonnes de noms)
            link = cell.find("a")
            if link and link.has_attr("href"):
                url = link["href"]
                # Rendre l'URL absolue si elle est relative
                if not url.startswith("http"):
                    url = f"https://www.france-galop.com{url}"
                row[f"{headers[idx]}_url"] = url
        
        # Ajouter la ligne si elle contient des données
        if row:
            rows.append(row)
    
    logger.info(f"Extraction réussie pour {category}: {len(rows)} résultats")
    return rows

def extract_data(url, category):
    """Extrait les données depuis l'URL fournie"""
    logger.info(f"Extraction des données pour {category} depuis {url}")
    
    # Extraction ciblée pour ce type de page
    resultats = scrap_tableau_france_galop(url, category)
    
    # Créer la structure de données finale
    data = {
        "metadata": {
            "source": url,
            "date_extraction": datetime.now().isoformat(),
            "category": category,
            "nombre_resultats": len(resultats)
        },
        "resultats": resultats
    }
    
    return data

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

def main():
    """Fonction principale"""
    logger.info("Démarrage du script d'extraction directe France Galop")
    
    # S'assurer que les dossiers existent
    ensure_dirs()
    
    # Vérifier si des catégories spécifiques sont demandées via les arguments
    selected_categories = []
    if len(sys.argv) > 1:
        arg_categories = sys.argv[1].split(',')
        selected_categories = [cat.strip() for cat in arg_categories if cat.strip() in CATEGORIES]
    
    # Si aucune catégorie spécifique n'est demandée, traiter toutes les catégories
    if not selected_categories:
        selected_categories = list(CATEGORIES.keys())
    
    logger.info(f"Catégories à extraire: {', '.join(selected_categories)}")
    
    # Résultats globaux
    results = {}
    
    # Parcourir chaque catégorie sélectionnée
    for category in selected_categories:
        config = CATEGORIES[category]
        url = config["url"]
        
        # Extraction des données
        data = extract_data(url, category)
        
        # Sauvegarde des données
        if data and len(data["resultats"]) > 0:
            success = save_to_json(data, category)
            results[category] = {
                "success": success,
                "count": len(data["resultats"]),
            }
        else:
            results[category] = {
                "success": False,
                "count": 0,
                "error": "Aucun résultat trouvé"
            }
        
        # Pause pour éviter de surcharger le serveur
        time.sleep(2)
    
    # Résumé de l'extraction
    logger.info("Résumé de l'extraction:")
    for category, result in results.items():
        status = "✅ Succès" if result["success"] else "❌ Échec"
        count = result["count"]
        error = result.get("error", "")
        logger.info(f"{category}: {status}, {count} résultats" + (f", Erreur: {error}" if error else ""))
    
    logger.info("Extraction terminée!")

if __name__ == "__main__":
    main()
