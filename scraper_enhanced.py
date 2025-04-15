#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données hippiques depuis France Galop
Utilise des techniques avancées de scraping avec plusieurs méthodes
de fallback pour garantir une extraction fiable des données.
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
import csv
import io
from urllib.parse import urljoin
import traceback

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

# Dossiers pour stocker les données
DATA_DIR = "data"
CSV_DIR = os.path.join(DATA_DIR, "raw_csv")
DEBUG_DIR = os.path.join(DATA_DIR, "debug")
PREVIOUS_DATA_DIR = os.path.join(DATA_DIR, "previous")

# Variantes possibles pour trouver les liens de téléchargement
DOWNLOAD_KEYWORDS = [
    "csv", "export", "download", "télécharger", "telecharger", "xls", "xlsx", "excel", 
    "tableau", "données", "données brutes", "raw data", "extraction"
]

# -----------------------------------------------------------
# Fonctions utilitaires
# -----------------------------------------------------------

def ensure_dirs():
    """Crée les dossiers nécessaires s'ils n'existent pas"""
    for directory in [DATA_DIR, CSV_DIR, DEBUG_DIR, PREVIOUS_DATA_DIR]:
        if not os.path.exists(directory):
            os.makedirs(directory)
            logger.info(f"Dossier créé: {directory}")

def get_random_headers():
    """Crée des en-têtes HTTP aléatoires pour éviter la détection de bot"""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/93.0.4577.63 Mobile/15E148 Safari/604.1"
    ]
    
    return {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "DNT": "1"
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
            # Augmentation exponentielle du délai (1s, 2s, 4s, 8s...)
            retry_delay *= 2
    
    return None

def save_previous_data(data, category):
    """Sauvegarde une copie des données précédentes"""
    filename = os.path.join(PREVIOUS_DATA_DIR, f"{category}.json")
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"Copie de sauvegarde créée: {filename}")
    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde de la copie: {str(e)}")

def load_previous_data(category):
    """Charge les données précédemment extraites"""
    filename = os.path.join(PREVIOUS_DATA_DIR, f"{category}.json")
    try:
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.info(f"Données précédentes chargées: {filename}")
            
            # Mise à jour de la date pour indiquer qu'il s'agit de données précédentes
            if "metadata" in data:
                data["metadata"]["recovered"] = True
                data["metadata"]["recovery_date"] = datetime.now().isoformat()
            
            return data
    except Exception as e:
        logger.error(f"Erreur lors du chargement des données précédentes: {str(e)}")
    
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

def detect_charset(content, default="utf-8"):
    """Détecte l'encodage du contenu"""
    # Essayer d'abord de détecter l'encodage explicite
    if content.startswith(b'\xef\xbb\xbf'):  # UTF-8 BOM
        return "utf-8-sig"
    elif content.startswith(b'\xff\xfe') or content.startswith(b'\xfe\xff'):  # UTF-16 BOM
        return "utf-16"
    
    # Essayer de détecter par les premières lignes
    try:
        # Vérifier si c'est de l'UTF-8 valide
        content.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        # Essayer avec Latin-1 (qui accepte tous les bytes mais peut mal interpréter)
        try:
            sample = content[:1000].decode("latin-1")
            # Si beaucoup de caractères spéciaux, c'est probablement le bon encodage
            if re.search(r'[éèêëàâäôöùûüçÉÈÊËÀÂÄÔÖÙÛÜÇ]', sample):
                return "latin-1"
        except:
            pass
    
    # Par défaut
    return default

# -----------------------------------------------------------
# Fonctions d'extraction principales
# -----------------------------------------------------------

def extract_data(url, category):
    """Extrait les données depuis l'URL fournie avec plusieurs méthodes"""
    logger.info(f"=== Extraction des données pour {category} depuis {url} ===")
    
    # Essayer plusieurs méthodes par ordre de préférence
    data = extract_data_csv_download(url, category)  # Méthode 1: Téléchargement direct CSV
    
    if not data or len(data.get("resultats", [])) == 0:
        logger.info(f"Méthode CSV pour {category} a échoué, tentative via JSON JavaScript")
        data = extract_data_javascript_json(url, category)  # Méthode 2: JSON dans JavaScript
        
    if not data or len(data.get("resultats", [])) == 0:
        logger.info(f"Méthode JSON pour {category} a échoué, tentative via HTML pur")
        data = extract_data_html_parsing(url, category)  # Méthode 3: HTML pur
    
    # Si des données ont été extraites, créer une copie de sauvegarde
    if data and len(data.get("resultats", [])) > 0:
        save_previous_data(data, category)
        return data
        
    # Aucune méthode n'a fonctionné, essayons de charger les données précédentes
    logger.warning(f"Aucune méthode d'extraction n'a fonctionné pour {category}")
    previous_data = load_previous_data(category)
    if previous_data:
        logger.info(f"Utilisation des données précédentes pour {category}")
        return previous_data
    
    # Si vraiment rien ne fonctionne, retourner une structure vide mais valide
    logger.error(f"Échec total de l'extraction pour {category}")
    return {
        "metadata": {
            "source": url,
            "date_extraction": datetime.now().isoformat(),
            "category": category,
            "erreur": "Aucune méthode d'extraction n'a fonctionné",
            "status": "failed"
        },
        "filters": {},
        "resultats": []
    }

def extract_data_csv_download(url, category):
    """Tente d'extraire les données via téléchargement direct du CSV"""
    try:
        logger.info(f"Tentative d'extraction via téléchargement CSV pour {category}")
        
        # Faire la requête à la page principale
        response = make_request(url)
        if not response:
            return None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Sauvegarder le HTML pour debug
        save_debug_html(response.text, category, "_page")
        
        # Chercher le bouton de téléchargement CSV
        download_url = None
        
        # Méthode 1: Chercher les liens explicites de téléchargement
        for link in soup.find_all('a', href=True):
            href = link.get('href', '').lower()
            text = link.text.lower().strip()
            
            # Vérifier si l'attribut href ou le texte contient un mot-clé de téléchargement
            if any(keyword in href or keyword in text for keyword in DOWNLOAD_KEYWORDS):
                download_url = link['href']
                logger.info(f"Lien de téléchargement trouvé via texte/attribut: {download_url}")
                break
        
        # Méthode 2: Chercher les éléments avec attributs data-* liés au téléchargement
        if not download_url:
            for tag in soup.find_all():
                # Rechercher des attributs commençant par data-
                for attr, value in tag.attrs.items():
                    if attr.startswith('data-') and any(keyword in attr.lower() for keyword in DOWNLOAD_KEYWORDS):
                        if tag.name == 'a' and tag.has_attr('href'):
                            download_url = tag['href']
                            logger.info(f"Lien de téléchargement trouvé via attribut data: {download_url}")
                            break
                if download_url:
                    break
        
        # Méthode 3: Chercher dans le JavaScript pour les URLs de téléchargement
        if not download_url:
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string:
                    # Rechercher des URL contenant des mots clés de téléchargement
                    for keyword in DOWNLOAD_KEYWORDS:
                        pattern = re.compile(r'["\']((https?://)?[^"\']+\.' + keyword + r'[^"\']*)["\']', re.IGNORECASE)
                        matches = pattern.findall(str(script.string))
                        if matches:
                            download_url = matches[0][0]  # Prendre le premier groupe de la première correspondance
                            logger.info(f"URL de téléchargement trouvée dans un script: {download_url}")
                            break
                    
                    # Rechercher des fonctions JavaScript liées au téléchargement
                    if not download_url:
                        js_funcs = re.findall(r'function\s+(\w+Download|\w+Export|\w+Csv|\w+Excel|\w+Telecharg)', str(script.string))
                        if js_funcs:
                            # Sauvegarder le script contenant la fonction pour examen
                            js_debug_path = os.path.join(DEBUG_DIR, f"{category}_download_function.js")
                            with open(js_debug_path, 'w', encoding='utf-8') as f:
                                f.write(str(script.string))
                            logger.info(f"Fonction de téléchargement potentielle trouvée: {js_funcs[0]}, script sauvegardé dans {js_debug_path}")
                
                if download_url:
                    break
        
        # Méthode 4: Chercher les boutons qui pourraient déclencher un téléchargement
        if not download_url:
            download_buttons = soup.find_all(['button', 'input', 'a'], attrs={
                'class': lambda c: c and any(keyword in c.lower() for keyword in DOWNLOAD_KEYWORDS)
            })
            
            for button in download_buttons:
                if button.name == 'a' and button.has_attr('href'):
                    download_url = button['href']
                    logger.info(f"Bouton de téléchargement trouvé via classe: {download_url}")
                    break
                else:
                    # Sauvegarder pour inspection
                    logger.info(f"Bouton de téléchargement potentiel trouvé: {button}")
        
        # Si on a une URL de téléchargement, procéder
        if download_url:
            # Si l'URL est relative, la rendre absolue
            if not download_url.startswith('http'):
                download_url = urljoin(url, download_url)
            
            logger.info(f"Tentative de téléchargement depuis: {download_url}")
            
            # Télécharger le CSV
            csv_response = make_request(download_url)
            if not csv_response:
                return None
            
            # Sauvegarder le CSV brut
            csv_path = os.path.join(CSV_DIR, f"{category}.csv")
            with open(csv_path, 'wb') as f:
                f.write(csv_response.content)
            logger.info(f"CSV téléchargé et sauvegardé dans {csv_path}")
            
            # Analyser le CSV et convertir en JSON
            data = parse_csv_to_json(csv_response.content, url, category)
            if data:
                logger.info(f"CSV analysé avec succès: {len(data.get('resultats', []))} résultats")
                return data
        
        logger.warning(f"Aucun lien de téléchargement CSV trouvé pour {category}")
        return None
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction CSV pour {category}: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def parse_csv_to_json(content, source_url, category):
    """Parse le contenu d'un CSV et le convertit en structure JSON"""
    try:
        # Détecter l'encodage du fichier
        encoding = detect_charset(content)
        logger.info(f"Encodage détecté: {encoding}")
        
        # Décoder le contenu
        text_content = content.decode(encoding)
        
        # Essayer de déterminer le délimiteur (virgule, point-virgule, tabulation)
        delimiters = [',', ';', '\t', '|']
        dialect = csv.Sniffer().sniff(text_content[:1024], delimiters=delimiters)
        logger.info(f"Délimiteur détecté: '{dialect.delimiter}'")
        
        # Analyser le CSV
        csv_file = io.StringIO(text_content)
        reader = csv.reader(csv_file, dialect)
        
        # Lire les en-têtes
        try:
            headers = next(reader)
        except StopIteration:
            logger.error("CSV vide ou mal formaté")
            return None
        
        # Nettoyer les en-têtes (supprimer BOM, espaces, etc.)
        headers = [h.strip().replace('\ufeff', '') for h in headers]
        logger.info(f"En-têtes: {headers}")
        
        # Lire les données
        results = []
        for row in reader:
            # Vérifier si la ligne est vide ou ne contient que des espaces
            if not row or all(cell.strip() == '' for cell in row):
                continue
                
            # Créer un dictionnaire pour cette ligne
            row_data = {}
            for i, cell in enumerate(row):
                if i < len(headers):
                    # Affecter la colonne avec le bon en-tête
                    header_name = headers[i]
                    value = cell.strip()
                    
                    # Convertir en nombre si possible
                    if value.replace('.', '', 1).isdigit() or value.replace(',', '', 1).isdigit():
                        try:
                            # Gérer les nombres avec virgule à la française
                            clean_value = value.replace(' ', '').replace(',', '.')
                            if '.' in clean_value:
                                value = float(clean_value)
                            else:
                                value = int(clean_value)
                        except ValueError:
                            pass  # Garder comme chaîne si la conversion échoue
                    
                    row_data[header_name] = value
            
            # Ajouter la ligne au résultat si elle n'est pas vide
            if row_data:
                results.append(row_data)
        
        # Créer la structure de résultat finale
        data = {
            "metadata": {
                "source": source_url,
                "download_url": source_url,  # Peut être mis à jour si on a l'URL exacte de téléchargement
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "nombre_resultats": len(results),
                "format_source": "CSV",
                "encodage": encoding,
                "delimiteur": dialect.delimiter
            },
            "resultats": results
        }
        
        return data
        
    except Exception as e:
        logger.error(f"Erreur lors du parsing CSV: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def extract_data_javascript_json(url, category):
    """Tente d'extraire les données via JSON dans JavaScript"""
    try:
        logger.info(f"Tentative d'extraction via JSON/JavaScript pour {category}")
        
        # Faire la requête
        response = make_request(url)
        if not response:
            return None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Chercher les balises script contenant potentiellement des données JSON
        scripts = soup.find_all('script')
        
        for script in scripts:
            if not script.string:
                continue
                
            script_content = str(script.string)
            
            # Rechercher des structures JSON qui pourraient contenir des données
            # Méthode 1: Rechercher un tableau JSON avec des données
            json_array_pattern = re.compile(r'\[\s*{\s*"[^"]+"\s*:')
            matches = json_array_pattern.finditer(script_content)
            
            for match in matches:
                try:
                    start_idx = match.start()
                    # Tenter de parser le JSON à partir de cette position
                    json_data = extract_json_from_position(script_content, start_idx)
                    if json_data and isinstance(json_data, list) and len(json_data) > 0:
                        logger.info(f"Données JSON trouvées dans un script: {len(json_data)} éléments")
                        
                        # Convertir en notre format standard
                        data = {
                            "metadata": {
                                "source": url,
                                "date_extraction": datetime.now().isoformat(),
                                "category": category,
                                "nombre_resultats": len(json_data),
                                "format_source": "JSON",
                            },
                            "resultats": json_data
                        }
                        return data
                except Exception as e:
                    logger.debug(f"Erreur lors du parsing JSON à la position {start_idx}: {str(e)}")
            
            # Méthode 2: Rechercher des variables JavaScript contenant des données
            data_var_pattern = re.compile(r'(var|let|const)\s+(\w+)\s*=\s*(\[|\{)')
            matches = data_var_pattern.finditer(script_content)
            
            for match in matches:
                try:
                    var_name = match.group(2)
                    start_idx = match.start(3)
                    
                    # Si la variable semble contenir des données pertinentes
                    if any(keyword in var_name.lower() for keyword in ['data', 'list', 'tableau', 'table', category.lower()]):
                        json_data = extract_json_from_position(script_content, start_idx)
                        if json_data:
                            if isinstance(json_data, list) and len(json_data) > 0:
                                logger.info(f"Données trouvées dans la variable JavaScript {var_name}: {len(json_data)} éléments")
                                
                                # Convertir en notre format standard
                                data = {
                                    "metadata": {
                                        "source": url,
                                        "date_extraction": datetime.now().isoformat(),
                                        "category": category,
                                        "nombre_resultats": len(json_data),
                                        "format_source": "JavaScript",
                                        "variable": var_name
                                    },
                                    "resultats": json_data
                                }
                                return data
                            elif isinstance(json_data, dict) and 'data' in json_data and isinstance(json_data['data'], list):
                                # Format courant où les données sont dans une sous-clé "data"
                                result_data = json_data['data']
                                logger.info(f"Données trouvées dans la clé 'data' de la variable {var_name}: {len(result_data)} éléments")
                                
                                data = {
                                    "metadata": {
                                        "source": url,
                                        "date_extraction": datetime.now().isoformat(),
                                        "category": category,
                                        "nombre_resultats": len(result_data),
                                        "format_source": "JavaScript",
                                        "variable": var_name
                                    },
                                    "resultats": result_data
                                }
                                return data
                except Exception as e:
                    logger.debug(f"Erreur lors du parsing de la variable {match.group(2)}: {str(e)}")
        
        logger.warning(f"Aucune donnée JSON/JavaScript exploitable trouvée pour {category}")
        return None
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction JSON/JavaScript pour {category}: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def extract_json_from_position(text, start_idx):
    """Extrait un objet JSON valide à partir d'une position donnée dans un texte"""
    # Cette fonction tente de délimiter et parser un JSON valide
    # à partir d'une position de début dans un texte plus large
    
    try:
        # Déterminer si on commence par un tableau ou un objet
        is_array = text[start_idx] == '['
        
        # Trouver la position de fin en tenant compte des imbrications
        end_idx = start_idx
        open_count = 1  # On commence déjà avec un ouvrant
        
        open_char = '[' if is_array else '{'
        close_char = ']' if is_array else '}'
        
        in_string = False
        escape_next = False
        
        for i in range(start_idx + 1, len(text)):
            char = text[i]
            
            if escape_next:
                escape_next = False
                continue
                
            if char == '\\':
                escape_next = True
                continue
                
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
                
            if not in_string:
                if char == open_char:
                    open_count += 1
                elif char == close_char:
                    open_count -= 1
                    
                    if open_count == 0:
                        end_idx = i + 1
                        break
        
        # Si on n'a pas trouvé de fin valide
        if open_count != 0:
            return None
            
        # Extraire la chaîne JSON candidate
        json_str = text[start_idx:end_idx]
        
        # Essayer de la parser
        return json.loads(json_str)
        
    except Exception as e:
        logger.debug(f"Erreur lors de l'extraction JSON: {str(e)}")
        return None

def extract_data_html_parsing(url, category):
    """Tente d'extraire les données directement depuis la structure HTML"""
    try:
        logger.info(f"Tentative d'extraction via HTML pour {category}")
        
        # Faire la requête
        response = make_request(url)
        if not response:
            return None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Chercher un tableau dans la page
        table = find_table(soup, category)
        
        if not table:
            logger.warning(f"Aucun tableau HTML trouvé pour {category}")
            return None
        
        # Extraire les en-têtes
        headers = extract_headers(table)
        
        # Extraire les données des lignes
        results = extract_rows(table, headers)
        
        # Extraire les filtres (pour comprendre le contexte des données)
        filters = extract_filters(soup)
        
        # Construire l'objet de résultat
        data = {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "nombre_resultats": len(results),
                "format_source": "HTML"
            },
            "filters": filters,
            "resultats": results
        }
        
        logger.info(f"Extraction HTML réussie pour {category}: {len(results)} résultats")
        return data
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction HTML pour {category}: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def find_table(soup, category):
    """
    Trouve un tableau dans la page en utilisant plusieurs méthodes
    pour une détection plus robuste, spécifiquement adaptée pour France Galop
    """
    # MÉTHODE SPÉCIFIQUE: Chercher div avec id="table.classement" 
    # (observé dans la capture d'écran)
    div_classement = soup.find('div', id='table.classement')
    if div_classement:
        # Chercher le tableau à l'intérieur de cette div
        table = div_classement.find('table')
        if table:
            logger.info(f"Table trouvée via div#table.classement")
            return table
    
    # MÉTHODE SPÉCIFIQUE: Chercher les tableaux avec classe qui contient "tablesorter"
    tables_with_tablesorter = soup.find_all('table', class_=lambda c: c and 'tablesorter' in c)
    if tables_with_tablesorter:
        logger.info(f"Table trouvée via classe tablesorter")
        return tables_with_tablesorter[0]
    
    # MÉTHODE SPÉCIFIQUE: Chercher avec le sélecteur CSS complexe observé
    specific_table = soup.select_one('div[class*="table classement"] table')
    if specific_table:
        logger.info(f"Table trouvée via sélecteur CSS spécifique")
        return specific_table
    
    # MÉTHODE SPÉCIFIQUE: Chercher n'importe quelle div contenant "classement" dans l'ID ou la classe
    classement_divs = soup.find_all('div', id=lambda x: x and 'classement' in x.lower())
    classement_divs.extend(soup.find_all('div', class_=lambda x: x and 'classement' in x.lower()))
    
    for div in classement_divs:
        table = div.find('table')
        if table:
            logger.info(f"Table trouvée via div avec 'classement' dans l'id/classe")
            return table
            
    # Méthode 1: Par attribut role="grid" (souvent utilisé pour les tableaux de données)
    table = soup.find('table', attrs={'role': 'grid'})
    if table:
        logger.info(f"Table trouvée par attribut role='grid'")
        return table
    
    # Méthode 2: Par classe common pour tableaux
    for cls in ['tablesorter', 'table', 'data-table', 'c-table']:
        table = soup.find('table', class_=lambda c: c and cls in c)
        if table:
            logger.info(f"Table trouvée par classe: {cls}")
            return table
    
    # Méthode 3: Chercher des tables ayant un grand nombre de lignes
    tables = soup.find_all('table')
    best_table = None
    max_rows = 2  # Minimum de lignes pour être considéré
    
    for table in tables:
        rows = table.find_all('tr')
        if len(rows) > max_rows:
            max_rows = len(rows)
            best_table = table
    
    if best_table:
        logger.info(f"Table trouvée avec le plus grand nombre de lignes: {max_rows}")
        return best_table
    
    # Méthode 4: Chercher le premier tableau de la page
    table = soup.find('table')
    if table:
        logger.info(f"Premier tableau de la page trouvé")
        return table
    
    # Méthode 5: Chercher des structures de données tabulaires sans balise table
    # (par exemple, des div avec rôles ou classes de grille)
    grid_elements = soup.find_all(['div'], attrs={
        'role': 'grid',
        'class': lambda c: c and any(cls in c for cls in ['grid', 'table', 'tableau', 'list'])
    })
    
    if grid_elements:
        logger.info(f"Structure tabulaire trouvée sans balise table")
        return grid_elements[0]  # Retourner le premier élément
    
    # Aucun tableau trouvé
    logger.warning(f"Aucun tableau trouvé pour {category}")
    return None

def extract_headers(table):
    """Extrait les en-têtes d'un tableau"""
    headers = []
    
    # Chercher l'en-tête de table
    thead = table.find('thead')
    if thead:
        header_row = thead.find('tr')
        if header_row:
            for th in header_row.find_all(['th', 'td']):
                # Essayer plusieurs attributs pour trouver le nom de la colonne
                header_name = None
                
                # Essayer data-label d'abord
                if th.has_attr('data-label'):
                    header_name = th['data-label']
                
                # Essayer autres attributs
                for attr in ['data-col', 'aria-label']:
                    if not header_name and th.has_attr(attr):
                        header_name = th[attr]
                        break
                
                # Si toujours pas trouvé, utiliser le texte
                if not header_name:
                    header_name = th.text.strip()
                
                # Si l'en-tête est toujours vide, utiliser un nom générique
                if not header_name:
                    header_name = f"Column_{len(headers)+1}"
                
                headers.append(header_name)
                
    # Si aucun en-tête trouvé dans thead, chercher la première ligne
    if not headers:
        first_row = table.find('tr')
        if first_row:
            for cell in first_row.find_all(['th', 'td']):
                header_text = cell.text.strip()
                if header_text:
                    headers.append(header_text)
                else:
                    headers.append(f"Column_{len(headers)+1}")
    
    # Si toujours aucun en-tête, générer des en-têtes génériques
    if not headers:
        # Trouver le nombre maximum de cellules dans une ligne
        max_cells = 0
        for row in table.find_all('tr'):
            cells_count = len(row.find_all(['td', 'th']))
            max_cells = max(max_cells, cells_count)
        
        # Générer des en-têtes génériques
        headers = [f"Column_{i+1}" for i in range(max_cells)]
    
    logger.info(f"En-têtes extraits: {headers}")
    return headers

def extract_rows(table, headers):
    """Extrait les données des lignes du tableau"""
    results = []
    
    # Trouver toutes les lignes de données (ignorer l'en-tête)
    rows = None
    tbody = table.find('tbody')
    if tbody:
        rows = tbody.find_all('tr')
    else:
        # Si pas de tbody, prendre toutes les lignes sauf la première (supposée être l'en-tête)
        all_rows = table.find_all('tr')
        if len(all_rows) > 1:
            rows = all_rows[1:]
        else:
            rows = all_rows
    
    if not rows:
        logger.warning("Aucune ligne trouvée dans le tableau")
        return results
    
    # Parcourir chaque ligne
    for row in rows:
        cells = row.find_all(['td', 'th'])
        
        # Si le nombre de cellules est trop petit, ignorer cette ligne
        if len(cells) < 2:
            continue
        
        row_data = {}
        
        # Extraire les données de chaque cellule
        for i, cell in enumerate(cells):
            if i < len(headers):
                # Récupérer le nom de l'en-tête
                header_name = headers[i]
                
                # Extraire la valeur de la cellule (prioriser data-title, data-text, puis innerText)
                value = ""
                
                # Essayer l'attribut data-text ou data-title
                for attr in ['data-text', 'data-title', 'data-value']:
                    if cell.has_attr(attr) and cell[attr].strip():
                        value = cell[attr].strip()
                        break
                
                # Si aucun attribut n'est trouvé, utiliser le texte
                if not value:
                    value = cell.text.strip()
                
                # Si la valeur contient uniquement des espaces, continuer
                if not value:
                    continue
                
                # Convertir en nombre si possible (pour les cellules numériques)
                if cell.get('data-type') == 'number' or header_name.lower() in ['rang', 'partants', 'victoires', 'places']:
                    try:
                        # Gestion des nombres avec des séparateurs français (virgule et espace)
                        clean_value = value.replace(' ', '').replace(',', '.')
                        if '.' in clean_value:
                            value = float(clean_value)
                        else:
                            try:
                                value = int(clean_value)
                            except ValueError:
                                pass  # Garder comme chaîne
                    except (ValueError, TypeError):
                        # Garder comme chaîne si la conversion échoue
                        pass
                
                row_data[header_name] = value
                
                # Si c'est une colonne avec un lien (comme le nom), capturer également l'URL
                link_columns = ['jockey', 'nom', 'nompostal', 'cheval', 'proprietaire', 'entraineur', 'eleveur']
                
                # Vérifier si l'en-tête ressemble à une des colonnes d'intérêt
                is_link_column = any(col.lower() in header_name.lower() for col in link_columns)
                
                if is_link_column or i == 0:  # Première colonne souvent un nom
                    link = cell.find('a')
                    if link and 'href' in link.attrs:
                        url = link.get('href')
                        # Rendre l'URL absolue si elle est relative
                        if not url.startswith('http'):
                            url = urljoin('https://www.france-galop.com', url)
                        row_data[f"{header_name}_url"] = url
        
        # Ajouter les données de cette ligne aux résultats s'il y a au moins une clé autre que l'URL
        if any(not k.endswith('_url') for k in row_data.keys()):
            results.append(row_data)
    
    return results

def extract_filters(soup):
    """Extrait les filtres appliqués (année, spécialité, etc.)"""
    filters = {}
    
    # Chercher les filtres dans les selects
    selects = soup.find_all('select')
    for select in selects:
        filter_name = select.get('name', '').strip()
        if not filter_name:
            # Essayer de récupérer le label si disponible
            label = soup.find('label', {'for': select.get('id', '')})
            if label:
                filter_name = label.text.strip()
            else:
                continue
        
        # Chercher l'option sélectionnée
        selected_option = select.find('option', selected=True)
        if selected_option:
            filter_value = selected_option.text.strip()
            filters[filter_name] = filter_value
    
    # Chercher aussi les filtres dans les éléments input (type=radio, checkbox)
    inputs = soup.find_all('input', {'type': ['radio', 'checkbox']})
    checked_inputs = [inp for inp in inputs if inp.get('checked') == True or inp.has_attr('checked')]
    
    for input_elem in checked_inputs:
        filter_name = input_elem.get('name', '').strip()
        if filter_name:
            filter_value = input_elem.get('value', '')
            # Pour les cases à cocher, la valeur peut être simplement "on"
            if filter_value and filter_value != 'on':
                filters[filter_name] = filter_value
            elif filter_value == 'on':
                # Essayer de récupérer le texte du label
                label = soup.find('label', {'for': input_elem.get('id', '')})
                if label:
                    filters[filter_name] = label.text.strip()
                else:
                    filters[filter_name] = "Activé"
    
    # Récupérer les filtres actifs dans les boutons ou spans avec classe "active" ou "selected"
    filter_elements = soup.select('.filter.active, .filter.selected, .tab.active, .btn.active')
    for elem in filter_elements:
        filter_name = elem.get('data-filter', '') or elem.get('data-type', '') or 'filtre'
        if filter_name:
            filter_value = elem.text.strip()
            if filter_value:
                filters[filter_name] = filter_value
    
    return filters

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
    logger.info("Démarrage du script d'extraction France Galop (version améliorée)")
    
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
        
        # Extraction des données avec plusieurs méthodes
        data = extract_data(url, category)
        
        # Sauvegarde des données
        if data:
            success = save_to_json(data, category)
            results[category] = {
                "success": success,
                "count": len(data.get("resultats", [])),
                "error": data.get("metadata", {}).get("erreur", None)
            }
        
        # Pause pour éviter de surcharger le serveur
        time.sleep(2)
    
    # Résumé de l'extraction
    logger.info("Résumé de l'extraction:")
    for category, result in results.items():
        status = "✅ Succès" if result["success"] and not result.get("error") else "❌ Échec"
        count = result["count"]
        error = result.get("error", "")
        logger.info(f"{category}: {status}, {count} résultats" + (f", Erreur: {error}" if error else ""))
    
    logger.info("Extraction terminée avec succès!")

if __name__ == "__main__":
    main()
