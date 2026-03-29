#!/usr/bin/env python3
"""
Convertit les CSV de classements France Galop en JSON.

Workflow:
1. Télécharger les CSV depuis france-galop.com (bouton ".csv")
2. Les mettre dans data/raw_csv/ (nommer: chevaux.csv, jockeys.csv, etc.)
3. Lancer ce script

Le script produit les mêmes fichiers data/{categorie}.json
que l'ancien scraper Selenium.

Usage:
    python convert_csv_rankings.py              # Tous les CSV trouvés
    python convert_csv_rankings.py chevaux      # Un seul
"""

import csv
import json
import os
import sys
import re
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

RAW_CSV_DIR = "data/raw_csv"
DATA_DIR = "data"

# Catégories et leurs URLs sources
CATEGORIES = {
    "chevaux": "https://www.france-galop.com/fr/hommes-chevaux/chevaux",
    "jockeys": "https://www.france-galop.com/fr/hommes-chevaux/jockeys",
    "entraineurs": "https://www.france-galop.com/fr/hommes-chevaux/entraineurs",
    "proprietaires": "https://www.france-galop.com/fr/hommes-chevaux/proprietaires",
    "eleveurs": "https://www.france-galop.com/fr/hommes-chevaux/eleveurs",
}


def detect_encoding(filepath):
    """Détecte l'encoding du fichier CSV."""
    encodings = ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                f.read(1000)
            return enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 'utf-8'


def detect_delimiter(filepath, encoding):
    """Détecte le délimiteur du CSV."""
    with open(filepath, 'r', encoding=encoding) as f:
        first_line = f.readline()
    
    for delim in [';', ',', '\t', '|']:
        if delim in first_line:
            count = first_line.count(delim)
            if count >= 2:  # Au moins 3 colonnes
                return delim
    return ';'  # France Galop utilise généralement ';'


def clean_value(val):
    """Nettoie une valeur CSV."""
    if val is None:
        return ""
    val = val.strip().strip('"').strip()
    if val in ('', '-', 'N/A', 'n/a'):
        return ""
    return val


def to_number(val):
    """Convertit en nombre si possible."""
    val = clean_value(val)
    if not val:
        return val
    
    # Retirer les espaces dans les nombres (ex: "1 234 567")
    clean = val.replace('\xa0', '').replace(' ', '')
    
    # Gestion virgule vs point décimal
    if ',' in clean and '.' not in clean:
        clean = clean.replace(',', '.')
    elif ',' in clean and '.' in clean:
        clean = clean.replace(',', '')  # 1,234.56 format
    
    try:
        if '.' in clean:
            result = float(clean)
            return int(result) if result == int(result) else result
        else:
            return int(clean)
    except (ValueError, TypeError):
        return val


def convert_csv_to_json(csv_path, category):
    """Convertit un fichier CSV en structure JSON."""
    logger.info(f"\n{'='*50}")
    logger.info(f"📊 Conversion: {category.upper()}")
    logger.info(f"📄 Fichier: {csv_path}")
    
    encoding = detect_encoding(csv_path)
    delimiter = detect_delimiter(csv_path, encoding)
    logger.info(f"   Encoding: {encoding}, Délimiteur: '{delimiter}'")
    
    results = []
    headers = []
    
    with open(csv_path, 'r', encoding=encoding, newline='') as f:
        reader = csv.reader(f, delimiter=delimiter)
        
        # Lire les en-têtes
        for row in reader:
            # Ignorer les lignes vides ou de commentaire
            if not row or all(not cell.strip() for cell in row):
                continue
            
            # Première ligne non-vide = en-têtes
            headers = [clean_value(h) for h in row]
            logger.info(f"   En-têtes: {headers}")
            break
        
        if not headers:
            logger.error(f"❌ Pas d'en-têtes trouvées dans {csv_path}")
            return None
        
        # Identifier les colonnes financières
        financial_keywords = ['alloc', 'prime', 'gain', 'prix']
        financial_cols = set()
        for i, h in enumerate(headers):
            if any(kw in h.lower() for kw in financial_keywords):
                financial_cols.add(i)
        
        # Lire les données
        for row in reader:
            if not row or all(not cell.strip() for cell in row):
                continue
            
            row_data = {}
            for i, cell in enumerate(row):
                if i >= len(headers):
                    continue
                
                header = headers[i]
                value = clean_value(cell)
                
                if not value:
                    continue
                
                # Convertir les nombres
                if i in financial_cols:
                    value = to_number(value)
                elif re.match(r'^[\d\s.,]+$', value.replace('\xa0', '')):
                    value = to_number(value)
                
                row_data[header] = value
            
            if row_data:
                results.append(row_data)
    
    logger.info(f"✅ {len(results)} entrées converties")
    
    # Construire le JSON de sortie
    source_url = CATEGORIES.get(category, f"CSV upload: {category}")
    
    data = {
        "metadata": {
            "source": source_url,
            "date_extraction": datetime.now().isoformat(),
            "category": category,
            "nombre_resultats": len(results),
            "methode": "csv_upload"
        },
        "resultats": results
    }
    
    return data


def save_json(data, category):
    """Sauvegarde en JSON."""
    os.makedirs(DATA_DIR, exist_ok=True)
    filepath = os.path.join(DATA_DIR, f"{category}.json")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"💾 Sauvegardé: {filepath}")


def find_csv_files(filter_categories=None):
    """Trouve les fichiers CSV dans le dossier raw_csv."""
    if not os.path.exists(RAW_CSV_DIR):
        logger.error(f"❌ Dossier {RAW_CSV_DIR} introuvable")
        return {}
    
    found = {}
    
    for filename in os.listdir(RAW_CSV_DIR):
        if not filename.lower().endswith('.csv'):
            continue
        
        filepath = os.path.join(RAW_CSV_DIR, filename)
        
        # Déterminer la catégorie depuis le nom du fichier
        name_lower = filename.lower().replace('.csv', '').replace('-', '_')
        
        category = None
        for cat in CATEGORIES:
            if cat in name_lower:
                category = cat
                break
        
        if not category:
            # Essayer le nom exact
            category = name_lower.split('_')[0] if '_' in name_lower else name_lower
            if category not in CATEGORIES:
                logger.warning(f"⚠️  Impossible d'identifier la catégorie pour {filename}")
                logger.info(f"   Noms attendus: {', '.join(CATEGORIES.keys())}")
                continue
        
        if filter_categories and category not in filter_categories:
            continue
        
        found[category] = filepath
    
    return found


def main():
    logger.info("🚀 Convertisseur CSV → JSON (classements France Galop)")
    logger.info(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Filtre optionnel
    filter_cats = None
    if len(sys.argv) > 1:
        filter_cats = [c.strip() for c in sys.argv[1].split(',')]
        logger.info(f"🎯 Filtre: {filter_cats}")
    
    # Trouver les CSV
    csv_files = find_csv_files(filter_cats)
    
    if not csv_files:
        logger.warning(f"\n⚠️  Aucun fichier CSV trouvé dans {RAW_CSV_DIR}/")
        logger.info(f"")
        logger.info(f"Pour utiliser ce script:")
        logger.info(f"1. Va sur france-galop.com/fr/hommes-chevaux/chevaux")
        logger.info(f"2. Clique le bouton '.csv' pour télécharger")
        logger.info(f"3. Mets le fichier dans {RAW_CSV_DIR}/chevaux.csv")
        logger.info(f"4. Répète pour: jockeys, entraineurs, proprietaires, eleveurs")
        logger.info(f"5. Relance: python convert_csv_rankings.py")
        return False
    
    logger.info(f"\n📂 CSV trouvés: {', '.join(csv_files.keys())}")
    
    # Convertir chaque CSV
    success_count = 0
    for category, filepath in csv_files.items():
        try:
            data = convert_csv_to_json(filepath, category)
            if data and data['resultats']:
                save_json(data, category)
                success_count += 1
            else:
                logger.warning(f"⚠️  Aucune donnée valide dans {filepath}")
        except Exception as e:
            logger.error(f"❌ Erreur pour {category}: {e}")
            import traceback
            traceback.print_exc()
    
    # Résumé
    logger.info(f"\n{'='*50}")
    logger.info(f"📊 RÉSUMÉ: {success_count}/{len(csv_files)} catégories converties")
    logger.info(f"✅ Terminé!")
    
    return success_count > 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
