import requests
from bs4 import BeautifulSoup
import json
import os
import time
from datetime import datetime
import sys
import logging
import re

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
            
    # Si on arrive ici, on essaie les méthodes génériques
    
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
    
    # Méthode 3: Chercher le premier tableau de la page
    table = soup.find('table')
    if table:
        logger.info(f"Premier tableau de la page trouvé")
        return table
    
    # Méthode 4: Chercher toutes les tables et prendre la plus grande
    all_tables = soup.find_all('table')
    if all_tables:
        # Trouver la table avec le plus de lignes <tr>
        max_rows = 0
        largest_table = None
        for t in all_tables:
            rows = len(t.find_all('tr'))
            if rows > max_rows:
                max_rows = rows
                largest_table = t
        
        if largest_table:
            logger.info(f"Table la plus grande trouvée ({max_rows} lignes)")
            return largest_table
    
    # Méthode 5: Enregistrer le HTML pour diagnostic
    try:
        debug_dir = os.path.join(DATA_DIR, "debug")
        if not os.path.exists(debug_dir):
            os.makedirs(debug_dir)
        
        with open(os.path.join(debug_dir, f"{category}_page.html"), "w", encoding="utf-8") as f:
            f.write(str(soup))
        logger.info(f"HTML sauvegardé pour diagnostic dans {debug_dir}/{category}_page.html")
    except Exception as e:
        logger.warning(f"Impossible de sauvegarder le HTML pour diagnostic: {e}")
    
    logger.warning(f"Aucun tableau trouvé pour {category}")
    return None

def extract_data(url, category):
    """Extrait les données depuis l'URL fournie"""
    logger.info(f"Extraction des données pour {category} depuis {url}")
    
    try:
        # Faire la requête avec réessais
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                response = requests.get(url, headers=HEADERS, timeout=30)
                response.raise_for_status()
                break
            except requests.RequestException as e:
                if attempt == max_retries:
                    raise
                logger.warning(f"Tentative {attempt}/{max_retries} échouée: {str(e)}. Nouvel essai...")
                time.sleep(2)
        
        # Analyser la page HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Chercher le titre de la page ou de la section
        title = None
        page_title = soup.find('h1')
        if page_title:
            title = page_title.text.strip()
        
        # Trouver le tableau en utilisant plusieurs méthodes
        table = find_table(soup, category)
        
        if not table:
            # Si on ne trouve pas de tableau, on sauvegarde quand même un JSON valide avec données vides
            logger.warning(f"Aucun tableau trouvé pour {category}")
            return {
                "metadata": {
                    "source": url,
                    "date_extraction": datetime.now().isoformat(),
                    "category": category,
                    "title": title,
                    "erreur": "Aucun tableau trouvé"
                },
                "filters": extract_filters(soup),
                "resultats": []
            }
        
        # Extraire les en-têtes du tableau
        headers = extract_headers(table)
        
        # Extraire les données des lignes
        results = extract_rows(table, headers)
        
        # Récupérer les filtres appliqués (année, spécialité, etc.)
        filters = extract_filters(soup)
        
        # Construire l'objet de réponse
        result_data = {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "title": title,
                "nombre_resultats": len(results)
            },
            "filters": filters,
            "resultats": results
        }
        
        logger.info(f"Extraction réussie pour {category}: {len(results)} résultats")
        return result_data
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des données pour {category}: {str(e)}")
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
                        row_data[f"{header_name}_url"] = link.get('href')
        
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
        
        # Extraction des données
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