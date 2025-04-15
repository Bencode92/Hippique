import requests
from bs4 import BeautifulSoup
import json
import os
import time
from datetime import datetime
import sys
import logging
import re
import csv
import io

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

# Headers pour simuler un navigateur
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.france-galop.com/",
    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
}

# Dossier pour stocker les données
DATA_DIR = "data"
DEBUG_DIR = os.path.join(DATA_DIR, "debug")

def ensure_data_dir():
    """Crée les dossiers nécessaires s'ils n'existent pas"""
    for directory in [DATA_DIR, DEBUG_DIR]:
        if not os.path.exists(directory):
            os.makedirs(directory)
            logger.info(f"Dossier créé: {directory}")

def extract_redirect_url(html_content, base_url="https://www.france-galop.com"):
    """Extrait l'URL de redirection depuis un script JavaScript"""
    try:
        # Chercher le pattern de redirection dans le script JavaScript
        redirect_match = re.search(r"window\.location\.href\s*=\s*['\"](.*?)['\"]", html_content)
        if redirect_match:
            redirect_path = redirect_match.group(1)
            # Construire l'URL complète si c'est un chemin relatif
            if redirect_path.startswith('/'):
                return f"{base_url}{redirect_path}"
            else:
                return redirect_path
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction de l'URL de redirection: {str(e)}")
    return None

def download_with_javascript_handling(session, url, category, headers=None):
    """Télécharge une ressource en gérant les redirections JavaScript"""
    if headers is None:
        headers = HEADERS
    
    logger.info(f"Tentative de téléchargement depuis {url}")
    
    try:
        # Première requête pour obtenir la page
        response = session.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', '')
        logger.info(f"Content-Type reçu: {content_type}")
        
        # Si c'est du HTML et qu'il pourrait contenir une redirection JavaScript
        if 'text/html' in content_type and 'window.location' in response.text:
            logger.info("Détection d'une redirection JavaScript")
            
            # Sauvegarder le HTML pour diagnostic
            with open(os.path.join(DEBUG_DIR, f"{category}_redirect.html"), "wb") as f:
                f.write(response.content)
            
            # Extraire l'URL de redirection
            redirect_url = extract_redirect_url(response.text)
            if redirect_url:
                logger.info(f"URL de redirection extraite: {redirect_url}")
                
                # Attendre un peu pour simuler un comportement humain
                time.sleep(2)
                
                # Effectuer une nouvelle requête vers l'URL de redirection
                redirect_headers = headers.copy()
                redirect_headers['Referer'] = url  # Mettre à jour le Referer
                
                logger.info(f"Suivi de la redirection vers: {redirect_url}")
                redirect_response = session.get(redirect_url, headers=redirect_headers, timeout=30)
                redirect_response.raise_for_status()
                
                # Vérifier le type de contenu de la réponse après redirection
                redirect_content_type = redirect_response.headers.get('Content-Type', '')
                logger.info(f"Content-Type après redirection: {redirect_content_type}")
                
                # Si c'est encore du HTML et contient une autre redirection, aller plus loin
                if 'text/html' in redirect_content_type and 'window.location' in redirect_response.text:
                    logger.info("Détection d'une seconde redirection JavaScript")
                    
                    # Sauvegarder le HTML pour diagnostic
                    with open(os.path.join(DEBUG_DIR, f"{category}_redirect2.html"), "wb") as f:
                        f.write(redirect_response.content)
                    
                    # Extraire la seconde URL de redirection
                    second_redirect_url = extract_redirect_url(redirect_response.text)
                    if second_redirect_url:
                        logger.info(f"Seconde URL de redirection extraite: {second_redirect_url}")
                        
                        # Attendre un peu pour simuler un comportement humain
                        time.sleep(2)
                        
                        # Effectuer une nouvelle requête vers la seconde URL de redirection
                        redirect_headers['Referer'] = redirect_url  # Mettre à jour le Referer
                        
                        logger.info(f"Suivi de la seconde redirection vers: {second_redirect_url}")
                        second_redirect_response = session.get(second_redirect_url, headers=redirect_headers, timeout=30)
                        second_redirect_response.raise_for_status()
                        
                        return second_redirect_response
                
                return redirect_response
        
        # Si c'est déjà un CSV ou si aucune redirection n'a été trouvée, retourner la réponse originale
        return response
        
    except Exception as e:
        logger.error(f"Erreur lors du téléchargement avec gestion JavaScript: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def find_download_url(soup, category, base_url):
    """Cherche l'URL de téléchargement du CSV dans la page"""
    download_link = None
    
    # Méthode 1: Chercher un bouton/lien avec le texte "télécharger" ou "exporter"
    keywords = ['télécharger', 'telecharger', 'exporter', 'export', 'csv', 'excel', 'download']
    for link in soup.find_all('a', href=True):
        link_text = link.text.lower()
        if any(keyword in link_text for keyword in keywords):
            download_link = link['href']
            logger.info(f"Lien de téléchargement trouvé via texte: {download_link}")
            break

    # Méthode 2: Chercher un bouton avec des classes spécifiques
    if not download_link:
        css_selectors = [
            'a.download', 'a.export', 'a.csv', 
            'button.download', 'button.export', 'button.csv',
            'a[download]', 'a[title*="télécharger"]', 'a[title*="export"]'
        ]
        for selector in css_selectors:
            elements = soup.select(selector)
            for element in elements:
                if element.name == 'a' and element.has_attr('href'):
                    download_link = element['href']
                    logger.info(f"Lien de téléchargement trouvé via sélecteur CSS {selector}: {download_link}")
                    break
                elif element.name == 'button' and element.find_parent('a', href=True):
                    download_link = element.find_parent('a')['href']
                    logger.info(f"Lien de téléchargement trouvé via parent de bouton: {download_link}")
                    break
            if download_link:
                break
    
    # Méthode 3: Chercher des attributs de données spécifiques
    if not download_link:
        data_attrs = [
            {'data-print-chevaux': True}, {'data-export': True}, {'data-csv': True},
            {'data-download': True}, {'data-action': 'export'}
        ]
        for attrs in data_attrs:
            elements = soup.find_all(attrs=attrs)
            for element in elements:
                if 'data-url' in element.attrs:
                    download_link = element['data-url']
                    logger.info(f"Lien de téléchargement trouvé via attribut de données: {download_link}")
                    break
                elif element.has_attr('href'):
                    download_link = element['href']
                    logger.info(f"Lien de téléchargement trouvé via élément avec attributs: {download_link}")
                    break
            if download_link:
                break

    # Méthode 4: Chercher des URLs spécifiques aux fichiers CSV dans les scripts JavaScript
    if not download_link:
        script_patterns = [
            r'["\'](?:https?:)?//[^"\']*export[^"\']*\.csv["\']',
            r'["\'](?:https?:)?//[^"\']*download[^"\']*\.csv["\']',
            r'["\'](?:/[^"\']*export[^"\']*\.csv)["\']',
            r'["\'](?:/[^"\']*download[^"\']*\.csv)["\']',
            r'["\'](?:/fr/export/csv/[^"\']*)["\']'
        ]
        
        for script in soup.find_all('script'):
            script_text = script.string if script.string else ""
            for pattern in script_patterns:
                matches = re.findall(pattern, script_text)
                if matches:
                    # Prendre le premier match
                    download_link = matches[0].strip('"\'')
                    logger.info(f"Lien de téléchargement trouvé dans script JS: {download_link}")
                    break
            if download_link:
                break
    
    # Si on ne trouve toujours pas, utiliser des URLs probables basées sur la catégorie
    if not download_link:
        # Construire différentes formes d'URL possibles
        possible_paths = [
            f"/fr/export/csv/{category}",
            f"/fr/hommes-chevaux/{category}/export/csv",
            f"/export/{category}.csv",
            f"/fr/export-classement/{category}"
        ]
        download_link = possible_paths[0]  # Prendre la première possibilité
        logger.info(f"Utilisation d'une URL probable: {download_link}")
    
    # Construire l'URL complète si nécessaire
    if download_link.startswith('http'):
        return download_link
    elif download_link.startswith('/'):
        return f"{base_url}{download_link}"
    else:
        return f"{base_url}/{download_link}"

def download_csv(url_base, category):
    """
    Télécharge directement le CSV depuis le bouton de téléchargement
    et le convertit en format JSON
    """
    logger.info(f"Début du téléchargement CSV pour {category} depuis {url_base}")
    
    # Créer une session pour maintenir les cookies et l'état entre les requêtes
    session = requests.Session()
    
    try:
        # Première étape: visiter la page pour obtenir les cookies/session
        response = session.get(url_base, headers=HEADERS, timeout=30)
        response.raise_for_status()
        
        # Analyser la page pour trouver le bouton de téléchargement
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver l'URL de téléchargement
        download_url = find_download_url(soup, category, "https://www.france-galop.com")
        logger.info(f"URL de téléchargement: {download_url}")
        
        # Ajouter un delai avant la prochaine requête pour simuler un comportement humain
        time.sleep(2)
        
        # Télécharger le fichier CSV en gérant les redirections JavaScript
        csv_response = download_with_javascript_handling(session, download_url, category)
        
        if not csv_response:
            logger.error(f"Échec du téléchargement pour {category}")
            return None
        
        # Vérifier si nous avons bien reçu un CSV ou du HTML
        content_type = csv_response.headers.get('Content-Type', '')
        logger.info(f"Type de contenu reçu: {content_type}")
        
        # Sauvegarder la réponse pour diagnostic
        with open(os.path.join(DEBUG_DIR, f"{category}_raw_response.txt"), "wb") as f:
            f.write(csv_response.content)
            
        # Tenter de déterminer si c'est un CSV ou du HTML
        content_start = csv_response.content[:100].decode('utf-8', errors='ignore').strip()
        logger.info(f"Début du contenu: {content_start[:50]}...")
        
        is_html = content_start.startswith('<!DOCTYPE html>') or content_start.startswith('<html')
        
        if is_html:
            logger.warning(f"Le serveur a renvoyé du HTML au lieu d'un CSV")
            # Sauvegarder le HTML pour diagnostic
            with open(os.path.join(DEBUG_DIR, f"{category}_download_error.html"), "w", encoding='utf-8') as f:
                f.write(csv_response.text)
                
            # Essayer d'extraire une autre URL de redirection et faire une nouvelle tentative
            redirect_url = extract_redirect_url(csv_response.text)
            if redirect_url:
                logger.info(f"Nouvel essai avec URL extraite: {redirect_url}")
                time.sleep(2)
                
                # Mise à jour du Referer
                headers_copy = HEADERS.copy()
                headers_copy['Referer'] = download_url
                
                second_attempt = download_with_javascript_handling(session, redirect_url, category, headers_copy)
                if second_attempt:
                    csv_response = second_attempt
                    
                    # Vérifier à nouveau si c'est du HTML
                    content_start = csv_response.content[:100].decode('utf-8', errors='ignore').strip()
                    is_html = content_start.startswith('<!DOCTYPE html>') or content_start.startswith('<html')
                    
                    if is_html:
                        logger.warning("La deuxième tentative a aussi renvoyé du HTML")
                        with open(os.path.join(DEBUG_DIR, f"{category}_download_error2.html"), "w", encoding='utf-8') as f:
                            f.write(csv_response.text)
        
        # Si nous avons toujours du HTML malgré toutes les tentatives, retourner une erreur
        if is_html:
            logger.error(f"Impossible d'obtenir un CSV pour {category}, toutes les tentatives retournent du HTML")
            return {
                "metadata": {
                    "source": url_base,
                    "download_url": download_url,
                    "date_extraction": datetime.now().isoformat(),
                    "category": category,
                    "erreur": "Le serveur a renvoyé du HTML au lieu d'un CSV"
                },
                "resultats": []
            }
        
        # Si nous sommes arrivés ici, nous avons probablement un CSV
        # Détecter l'encodage - tenter UTF-8 d'abord, puis Latin-1 (ISO-8859-1) si ça échoue
        encodings_to_try = ['utf-8', 'latin-1', 'cp1252']
        csv_content = None
        
        for encoding in encodings_to_try:
            try:
                csv_content = csv_response.content.decode(encoding)
                logger.info(f"Décodage réussi avec l'encodage {encoding}")
                break
            except UnicodeDecodeError:
                logger.warning(f"Échec du décodage avec l'encodage {encoding}")
        
        if not csv_content:
            logger.error(f"Impossible de décoder le contenu avec aucun des encodages essayés")
            return {
                "metadata": {
                    "source": url_base,
                    "download_url": download_url,
                    "date_extraction": datetime.now().isoformat(),
                    "category": category,
                    "erreur": "Impossible de décoder le contenu du CSV"
                },
                "resultats": []
            }
        
        # Sauvegarder le CSV brut pour référence
        csv_save_path = os.path.join(DATA_DIR, f"{category}.csv")
        with open(csv_save_path, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        logger.info(f"CSV original sauvegardé dans {csv_save_path}")
        
        # Analyser le CSV pour le convertir en JSON
        # Essayons différents délimiteurs
        delimiters = [',', ';', '\t']
        results = []
        headers = None
        
        for delimiter in delimiters:
            try:
                # Réinitialiser le lecteur CSV avec le nouveau délimiteur
                csv_lines = csv_content.splitlines()
                csv_reader = csv.DictReader(csv_lines, delimiter=delimiter)
                
                # Extraire les en-têtes
                headers = csv_reader.fieldnames
                if not headers:
                    logger.warning(f"Pas d'en-têtes trouvés avec délimiteur '{delimiter}'")
                    continue
                
                logger.info(f"En-têtes CSV trouvés avec délimiteur '{delimiter}': {headers}")
                
                # Convertir les lignes CSV en structure JSON
                results = []
                for row in csv_reader:
                    # Nettoyer les valeurs
                    cleaned_row = {}
                    for key, value in row.items():
                        if key is None:  # Ignorer les clés None
                            continue
                            
                        # Nettoyer la clé et la valeur
                        clean_key = key.strip() if key else f"Column_{len(cleaned_row)}"
                        clean_value = value.strip() if value else ""
                        
                        # Convertir en nombre si possible
                        if re.match(r'^-?\d+$', clean_value):
                            cleaned_row[clean_key] = int(clean_value)
                        elif re.match(r'^-?\d+[.,]\d+$', clean_value):
                            cleaned_row[clean_key] = float(clean_value.replace(',', '.'))
                        else:
                            cleaned_row[clean_key] = clean_value
                    
                    results.append(cleaned_row)
                
                # Si nous avons des résultats, nous avons trouvé le bon délimiteur
                if results:
                    logger.info(f"CSV analysé avec succès en utilisant le délimiteur '{delimiter}'")
                    break
                    
            except Exception as e:
                logger.warning(f"Erreur avec délimiteur '{delimiter}': {str(e)}")
        
        # Construire l'objet de réponse
        result_data = {
            "metadata": {
                "source": url_base,
                "download_url": download_url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "delimiter": delimiter if results else None,
                "nombre_resultats": len(results)
            },
            "resultats": results
        }
        
        logger.info(f"Extraction CSV réussie pour {category}: {len(results)} résultats")
        return result_data
        
    except Exception as e:
        logger.error(f"Erreur lors du téléchargement/traitement du CSV pour {category}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "metadata": {
                "source": url_base,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "erreur": str(e)
            },
            "resultats": []
        }

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
    logger.info("Démarrage du script d'extraction France Galop")
    
    # S'assurer que les dossiers nécessaires existent
    ensure_data_dir()
    
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
        
        # Extraction des données via CSV
        data = download_csv(url, category)
        
        # Sauvegarde des données
        if data:
            success = save_to_json(data, category)
            results[category] = {
                "success": success,
                "count": len(data.get("resultats", [])),
                "error": data.get("metadata", {}).get("erreur", None)
            }
        else:
            results[category] = {
                "success": False,
                "count": 0,
                "error": "Échec du téléchargement"
            }
        
        # Pause pour éviter de surcharger le serveur
        time.sleep(3)
    
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
