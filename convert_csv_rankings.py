#!/usr/bin/env python3
"""
Convertit les CSV de classements France Galop en JSON.

IMPORTANT: Ajoute des alias de champs pour la compatibilité avec les scripts JS
(extract-pondered-rankings.js, generate-rankings) qui attendent des noms spécifiques.

Mapping CSV France Galop → champs JS:
  chevaux:  Cheval→LibelleCheval, Courses→NbCourses, Victoires→NbVictoires, Places→NbPlace
  autres:   Nom→NomPostal, Partants→Partants, Places→Place
  tous:     position → Rang

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

CATEGORIES = {
    "chevaux": "https://www.france-galop.com/fr/hommes-chevaux/chevaux",
    "jockeys": "https://www.france-galop.com/fr/hommes-chevaux/jockeys",
    "entraineurs": "https://www.france-galop.com/fr/hommes-chevaux/entraineurs",
    "proprietaires": "https://www.france-galop.com/fr/hommes-chevaux/proprietaires",
    "eleveurs": "https://www.france-galop.com/fr/hommes-chevaux/eleveurs",
}

# Alias de champs pour compatibilité avec les scripts JS
# Format: { catégorie: { champ_csv: champ_alias_js } }
FIELD_ALIASES = {
    "chevaux": {
        "Cheval": "LibelleCheval",
        "Courses": "NbCourses",
        "Victoires": "NbVictoires",
        "Places": "NbPlace",
    },
    "jockeys": {
        "Nom": "NomPostal",
        "Partants": "Partants",
        "Places": "Place",
    },
    "entraineurs": {
        "Nom": "NomPostal",
        "Partants": "Partants",
        "Places": "Place",
    },
    "proprietaires": {
        "Nom": "NomPostal",
        "Partants": "Partants",
        "Places": "Place",
    },
    "eleveurs": {
        "Nom": "NomPostal",
        "Partants": "Partants",
        "Places": "Place",
    },
}


def detect_encoding(filepath):
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
    with open(filepath, 'r', encoding=encoding) as f:
        first_line = f.readline()
    
    # Compter les occurrences de chaque délimiteur possible
    candidates = [
        ('\t', first_line.count('\t')),
        (';', first_line.count(';')),
        (',', first_line.count(',')),
        ('|', first_line.count('|')),
    ]
    # Prendre celui avec le plus d'occurrences (min 2)
    candidates.sort(key=lambda x: x[1], reverse=True)
    if candidates[0][1] >= 2:
        return candidates[0][0]
    return ';'


def clean_value(val):
    if val is None:
        return ""
    val = val.strip().strip('"').strip()
    if val in ('', '-', 'N/A', 'n/a'):
        return ""
    return val


def to_number(val):
    val = clean_value(val)
    if not val:
        return val
    
    clean = val.replace('\xa0', '').replace(' ', '')
    
    # Virgule décimale française (ex: "597039,00")
    if ',' in clean and '.' not in clean:
        clean = clean.replace(',', '.')
    elif ',' in clean and '.' in clean:
        clean = clean.replace(',', '')
    
    try:
        if '.' in clean:
            result = float(clean)
            return int(result) if result == int(result) else result
        else:
            return int(clean)
    except (ValueError, TypeError):
        return val


def convert_csv_to_json(csv_path, category):
    logger.info(f"\n{'='*50}")
    logger.info(f"📊 Conversion: {category.upper()}")
    logger.info(f"📄 Fichier: {csv_path}")
    
    encoding = detect_encoding(csv_path)
    delimiter = detect_delimiter(csv_path, encoding)
    logger.info(f"   Encoding: {encoding}, Délimiteur: {'TAB' if delimiter == chr(9) else repr(delimiter)}")
    
    results = []
    headers = []
    aliases = FIELD_ALIASES.get(category, {})
    
    with open(csv_path, 'r', encoding=encoding, newline='') as f:
        reader = csv.reader(f, delimiter=delimiter)
        
        # Lire les en-têtes
        for row in reader:
            if not row or all(not cell.strip() for cell in row):
                continue
            headers = [clean_value(h) for h in row]
            logger.info(f"   En-têtes CSV: {headers}")
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
        row_num = 0
        for row in reader:
            if not row or all(not cell.strip() for cell in row):
                continue
            
            row_num += 1
            row_data = {}
            
            # Ajouter le Rang (= position dans le CSV)
            row_data["Rang"] = row_num
            
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
                
                # Stocker avec le nom d'en-tête original
                row_data[header] = value
                
                # Ajouter les alias JS si nécessaire
                if header in aliases:
                    alias = aliases[header]
                    if alias != header:  # Éviter les doublons
                        row_data[alias] = value
            
            # Pour chevaux: copier aussi Cheval → Nom (utilisé par le JS)
            if category == "chevaux":
                if "Cheval" in row_data and "Nom" not in row_data:
                    row_data["Nom"] = row_data["Cheval"]
            
            if row_data:
                results.append(row_data)
    
    logger.info(f"✅ {len(results)} entrées converties")
    
    # Log les alias ajoutés
    if aliases:
        logger.info(f"   Alias JS ajoutés: {dict(aliases)}")
    
    # Vérifier les champs attendus par les scripts JS
    if results:
        sample = results[0]
        if category == "chevaux":
            expected = ["LibelleCheval", "NbCourses", "NbVictoires", "NbPlace", "Rang"]
        else:
            expected = ["NomPostal", "Partants", "Victoires", "Place", "Rang"]
        
        missing = [f for f in expected if f not in sample]
        present = [f for f in expected if f in sample]
        logger.info(f"   ✅ Champs JS présents: {present}")
        if missing:
            logger.warning(f"   ⚠️  Champs JS manquants: {missing}")
    
    source_url = CATEGORIES.get(category, f"CSV upload: {category}")
    
    data = {
        "metadata": {
            "source": source_url,
            "date_extraction": datetime.now().isoformat(),
            "category": category,
            "nombre_resultats": len(results),
            "methode": "csv_upload",
            "field_aliases": aliases
        },
        "resultats": results
    }
    
    return data


def save_json(data, category):
    os.makedirs(DATA_DIR, exist_ok=True)
    filepath = os.path.join(DATA_DIR, f"{category}.json")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"💾 Sauvegardé: {filepath}")


def find_csv_files(filter_categories=None):
    if not os.path.exists(RAW_CSV_DIR):
        logger.error(f"❌ Dossier {RAW_CSV_DIR} introuvable")
        return {}
    
    found = {}
    
    for filename in os.listdir(RAW_CSV_DIR):
        if not filename.lower().endswith('.csv'):
            continue
        
        filepath = os.path.join(RAW_CSV_DIR, filename)
        
        # Vérifier que le fichier n'est pas un template vide
        file_size = os.path.getsize(filepath)
        if file_size < 200:
            logger.warning(f"⚠️  {filename} trop petit ({file_size} octets) — template vide?")
            continue
        
        name_lower = filename.lower().replace('.csv', '').replace('-', '_')
        
        category = None
        for cat in CATEGORIES:
            if cat in name_lower:
                category = cat
                break
        
        if not category:
            category = name_lower.split('_')[0] if '_' in name_lower else name_lower
            if category not in CATEGORIES:
                logger.warning(f"⚠️  Impossible d'identifier la catégorie pour {filename}")
                continue
        
        if filter_categories and category not in filter_categories:
            continue
        
        found[category] = filepath
    
    return found


def main():
    logger.info("🚀 Convertisseur CSV → JSON (classements France Galop)")
    logger.info(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    logger.info(f"   Avec mapping de champs pour compatibilité JS")
    
    filter_cats = None
    if len(sys.argv) > 1:
        filter_cats = [c.strip() for c in sys.argv[1].split(',')]
        logger.info(f"🎯 Filtre: {filter_cats}")
    
    csv_files = find_csv_files(filter_cats)
    
    if not csv_files:
        logger.warning(f"\n⚠️  Aucun fichier CSV valide dans {RAW_CSV_DIR}/")
        logger.info(f"Mets les CSV France Galop dans {RAW_CSV_DIR}/")
        return False
    
    logger.info(f"\n📂 CSV trouvés: {', '.join(csv_files.keys())}")
    
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
    
    logger.info(f"\n{'='*50}")
    logger.info(f"📊 RÉSUMÉ: {success_count}/{len(csv_files)} catégories converties")
    logger.info(f"✅ Terminé!")
    
    return success_count > 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
