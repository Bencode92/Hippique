import requests
from bs4 import BeautifulSoup
import json
import os
import time
from datetime import datetime
import sys

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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8"
}

# Dossier pour stocker les données
DATA_DIR = "data"


def ensure_data_dir():
    """Crée le dossier de données s'il n'existe pas"""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)


def extract_data(url, category):
    """Extrait les données de la page"""
    print(f"Extraction des données pour {category} depuis {url}")
    
    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Recherche de tables de classement par différentes méthodes
        table = None
        
        # Méthode 1: Par ID spécifique (moins fiable)
        table_id = f"classement_{category}"
        table = soup.find('table', id=table_id)
        
        # Méthode 2: Par classe (plus générique)
        if not table:
            table = soup.find('table', class_='tablesorter')
        
        # Méthode 3: Par attribut role="grid" (plus précis pour les tableaux de données)
        if not table:
            table = soup.find('table', attrs={'role': 'grid'})
            
        # Méthode 4: Prendre la première table de la page
        if not table:
            table = soup.find('table')
        
        if not table:
            # Si aucune table n'est trouvée, on crée un jeu de données vide mais valide
            print(f"Aucune table trouvée pour {category}. Création d'un jeu de données vide.")
            return {
                "metadata": {
                    "source": url,
                    "date_extraction": datetime.now().isoformat(),
                    "category": category,
                    "erreur": "Aucune table de données trouvée"
                },
                "filters": {},
                "resultats": []
            }
        
        # Extraire les en-têtes de colonnes
        headers = []
        header_row = table.find('thead').find('tr')
        for th in header_row.find_all('th'):
            # Essayer de trouver le data-label ou utiliser le texte
            header_name = th.get('data-label', th.text.strip())
            headers.append(header_name)
        
        # Extraire les données des lignes
        results = []
        tbody = table.find('tbody')
        for tr in tbody.find_all('tr'):
            row_data = {}
            for i, td in enumerate(tr.find_all('td')):
                if i < len(headers):
                    # Pour chaque cellule, obtenir sa valeur
                    header_name = headers[i]
                    value = td.text.strip()
                    
                    # Pour les cellules avec des nombres, convertir en nombre si possible
                    if td.get('data-type') == 'number':
                        try:
                            # Gestion des nombres avec des séparateurs français (virgule et espace)
                            value = value.replace(' ', '').replace(',', '.')
                            value = float(value) if '.' in value else int(value)
                        except ValueError:
                            pass  # Garder comme chaîne si la conversion échoue
                    
                    row_data[header_name] = value
                    
                    # Si c'est une colonne avec un lien (comme le nom), capturer également l'URL
                    if header_name.lower() in ['jockey', 'nom', 'nompostal', 'cheval', 'proprietaire', 'entraineur', 'eleveur']:
                        link = td.find('a')
                        if link and 'href' in link.attrs:
                            row_data[f"{header_name}_url"] = link.get('href')
            
            results.append(row_data)
        
        # Ajouter des métadonnées
        metadata = {
            "source": url,
            "date_extraction": datetime.now().isoformat(),
            "category": category,
            "nombre_resultats": len(results)
        }
        
        # Récupérer les filtres actifs (année, spécialité, etc.)
        filters = {}
        filter_elements = soup.select('select option[selected]')
        for elem in filter_elements:
            filter_name = elem.parent.get('name', '').strip()
            filter_value = elem.text.strip()
            if filter_name and filter_value:
                filters[filter_name] = filter_value
        
        return {
            "metadata": metadata,
            "filters": filters,
            "resultats": results
        }
        
    except Exception as e:
        print(f"Erreur lors de l'extraction des données pour {category}: {str(e)}")
        return {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "erreur": str(e)
            },
            "resultats": []
        }


def save_to_json(data, category):
    """Sauvegarde les données dans un fichier JSON"""
    filename = os.path.join(DATA_DIR, f"{category}.json")
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Données sauvegardées dans {filename}")


def main():
    """Fonction principale"""
    ensure_data_dir()
    
    # Vérifier si des catégories spécifiques sont demandées via les arguments
    selected_categories = []
    if len(sys.argv) > 1:
        arg_categories = sys.argv[1].split(',')
        selected_categories = [cat.strip() for cat in arg_categories if cat.strip() in CATEGORIES]
    
    # Si aucune catégorie spécifique n'est demandée, traiter toutes les catégories
    if not selected_categories:
        selected_categories = list(CATEGORIES.keys())
    
    print(f"Catégories à extraire: {', '.join(selected_categories)}")
    
    for category in selected_categories:
        config = CATEGORIES[category]
        url = config["url"]
        
        # Extraction des données
        data = extract_data(url, category)
        
        # Sauvegarde des données
        save_to_json(data, category)
        
        # Pause pour éviter de surcharger le serveur
        time.sleep(2)
    
    print("Extraction terminée avec succès!")


if __name__ == "__main__":
    main()