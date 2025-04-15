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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.google.com/"
}

# Dossier pour stocker les données
DATA_DIR = "data"

def ensure_data_dir():
    """Crée le dossier de données s'il n'existe pas"""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        logger.info(f"Dossier de données créé: {DATA_DIR}")

def download_csv(url_base, category):
    """
    Télécharge directement le CSV depuis le bouton de téléchargement
    et le convertit en format JSON
    """
    logger.info(f"Tentative de téléchargement CSV pour {category} depuis {url_base}")
    
    try:
        # Première étape: visiter la page pour obtenir les cookies/session et trouver l'URL de téléchargement
        session = requests.Session()
        response = session.get(url_base, headers=HEADERS, timeout=30)
        response.raise_for_status()
        
        # Analyser la page pour trouver le bouton de téléchargement
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Chercher le lien de téléchargement CSV
        download_link = None
        
        # Méthode 1: Chercher un bouton/lien avec le texte "télécharger" ou "exporter"
        for link in soup.find_all('a', href=True):
            link_text = link.text.lower()
            if 'télécharger' in link_text or 'exporter' in link_text or 'csv' in link_text:
                download_link = link['href']
                break

        # Méthode 2: Chercher un bouton avec la classe "download" ou similaire
        if not download_link:
            download_button = soup.find('button', class_=lambda c: c and ('download' in c.lower() or 'telecharger' in c.lower()))
            if download_button and download_button.find_parent('a', href=True):
                download_link = download_button.find_parent('a')['href']
        
        # Méthode 3: Chercher des éléments spécifiques au site France Galop
        if not download_link:
            download_element = soup.find(attrs={"data-print-chevaux": True})
            if download_element and 'data-url' in download_element.attrs:
                download_link = download_element['data-url']

        # Si on ne trouve toujours pas, utiliser un format d'URL probable
        if not download_link:
            # Tenter différents formats possibles d'URL
            possible_paths = [
                f"/fr/export/csv/{category}",
                f"/fr/hommes-chevaux/{category}/export/csv",
                f"/export/{category}.csv",
                f"/fr/export-classement/{category}"
            ]
            
            for path in possible_paths:
                test_url = f"https://www.france-galop.com{path}"
                logger.info(f"Tentative avec URL générée: {test_url}")
                try:
                    test_response = session.head(test_url, headers=HEADERS, timeout=10)
                    if test_response.status_code == 200:
                        download_link = path
                        logger.info(f"URL de téléchargement trouvée: {test_url}")
                        break
                except Exception as e:
                    logger.warning(f"URL {test_url} non disponible: {str(e)}")
        
        if not download_link:
            logger.warning(f"Impossible de trouver le lien de téléchargement pour {category}")
            return None
        
        # Construire l'URL complète si nécessaire
        if download_link.startswith('http'):
            download_url = download_link
        else:
            # Gérer les chemins relatifs
            if download_link.startswith('/'):
                download_url = f"https://www.france-galop.com{download_link}"
            else:
                download_url = f"{url_base}/{download_link}"
        
        logger.info(f"URL de téléchargement: {download_url}")
        
        # Télécharger le fichier CSV
        csv_response = session.get(download_url, headers=HEADERS, timeout=30)
        csv_response.raise_for_status()
        
        # Vérifier si nous avons bien reçu un CSV (vérification de l'en-tête Content-Type)
        content_type = csv_response.headers.get('Content-Type', '')
        if 'text/csv' in content_type or 'application/csv' in content_type:
            logger.info(f"Téléchargement réussi: Content-Type: {content_type}")
        elif 'text/html' in content_type:
            logger.warning(f"Le serveur a renvoyé du HTML au lieu d'un CSV. Content-Type: {content_type}")
            # Sauvegarde du HTML pour diagnostic
            debug_dir = os.path.join(DATA_DIR, "debug")
            if not os.path.exists(debug_dir):
                os.makedirs(debug_dir)
            with open(os.path.join(debug_dir, f"{category}_download_error.html"), "wb") as f:
                f.write(csv_response.content)
            logger.info(f"HTML sauvegardé pour diagnostic dans {debug_dir}/{category}_download_error.html")
            # Continuer quand même - parfois le Content-Type est incorrect mais les données sont bonnes
        else:
            logger.warning(f"Type de contenu inattendu: {content_type}")
        
        # Détecter l'encodage - tenter UTF-8 d'abord, puis Latin-1 (ISO-8859-1) si ça échoue
        encoding = 'utf-8'
        try:
            csv_content = csv_response.content.decode(encoding)
        except UnicodeDecodeError:
            encoding = 'latin-1'
            csv_content = csv_response.content.decode(encoding)
            logger.info(f"Utilisation de l'encodage {encoding} pour le décodage du CSV")
        
        # Analyser le CSV pour le convertir en JSON
        csv_lines = csv_content.splitlines()
        csv_reader = csv.DictReader(csv_lines, delimiter=',')
        
        # Extraire les en-têtes
        headers = csv_reader.fieldnames if csv_reader.fieldnames else []
        logger.info(f"En-têtes CSV trouvés: {headers}")
        
        # Convertir les lignes CSV en structure JSON
        results = []
        for row in csv_reader:
            # Nettoyer les valeurs (supprimer les espaces inutiles, convertir en nombres quand c'est possible)
            cleaned_row = {}
            for key, value in row.items():
                if key is None:  # Ignorer les clés None qui peuvent apparaître avec un CSV mal formé
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
        
        # Construire l'objet de réponse
        result_data = {
            "metadata": {
                "source": url_base,
                "download_url": download_url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "nombre_resultats": len(results)
            },
            "resultats": results
        }
        
        # Sauvegarder aussi le CSV original pour référence
        csv_save_path = os.path.join(DATA_DIR, f"{category}.csv")
        with open(csv_save_path, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        logger.info(f"CSV original sauvegardé dans {csv_save_path}")
        
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
    
    # S'assurer que le dossier de données existe
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
