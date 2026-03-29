#!/usr/bin/env python3
"""
Scraper des classements France Galop (chevaux, jockeys, entraîneurs, propriétaires, éleveurs).
Utilise requests + BeautifulSoup au lieu de Selenium.

France Galop rend les données côté serveur dans le HTML initial,
donc pas besoin de Chrome/Selenium pour le premier batch de résultats.

Usage:
    python scraper_rankings.py                    # Toutes les catégories
    python scraper_rankings.py jockeys,chevaux    # Catégories spécifiques
    python scraper_rankings.py --year 2025        # Année spécifique
"""

import requests
from bs4 import BeautifulSoup
import json
import os
import sys
import time
import logging
import re
import random
import argparse
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# Configuration
# ============================================================
BASE_URL = "https://www.france-galop.com"

CATEGORIES = {
    "chevaux": {
        "url": f"{BASE_URL}/fr/hommes-chevaux/chevaux",
        "params": {}
    },
    "proprietaires": {
        "url": f"{BASE_URL}/fr/hommes-chevaux/proprietaires",
        "params": {}
    },
    "entraineurs": {
        "url": f"{BASE_URL}/fr/hommes-chevaux/entraineurs",
        "params": {}
    },
    "eleveurs": {
        "url": f"{BASE_URL}/fr/hommes-chevaux/eleveurs",
        "params": {}
    },
    "jockeys": {
        "url": f"{BASE_URL}/fr/hommes-chevaux/jockeys",
        "params": {}
    }
}

DATA_DIR = "data"
DEBUG_DIR = os.path.join(DATA_DIR, "debug")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
]


# ============================================================
# HTTP Session
# ============================================================

def create_session():
    """Crée une session HTTP avec headers réalistes."""
    session = requests.Session()
    session.headers.update({
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
    })
    return session


def fetch_page(session, url, params=None, max_retries=3):
    """Fetch une page avec retry."""
    for attempt in range(max_retries):
        try:
            response = session.get(url, params=params, timeout=30, allow_redirects=True)
            if response.status_code == 200:
                return response.text
            else:
                logger.warning(f"HTTP {response.status_code} pour {url} (tentative {attempt+1})")
        except requests.exceptions.RequestException as e:
            logger.warning(f"Erreur réseau: {e} (tentative {attempt+1})")
        if attempt < max_retries - 1:
            time.sleep(2 * (attempt + 1))
    return None


# ============================================================
# Parsing HTML
# ============================================================

def find_data_table(soup):
    """Trouve le tableau de données dans la page."""
    # Stratégie 1: table avec role='grid'
    table = soup.find('table', attrs={'role': 'grid'})
    if table:
        logger.info("Table trouvée via role='grid'")
        return table
    
    # Stratégie 2: table avec classe tablesorter
    table = soup.find('table', class_=lambda c: c and 'tablesorter' in c)
    if table:
        logger.info("Table trouvée via classe 'tablesorter'")
        return table
    
    # Stratégie 3: chercher dans le contenu principal
    main_content = soup.find('main') or soup.find('div', class_='main-content') or soup.find('article')
    if main_content:
        tables = main_content.find_all('table')
        if tables:
            # Prendre la table avec le plus de lignes
            best = max(tables, key=lambda t: len(t.find_all('tr')))
            row_count = len(best.find_all('tr'))
            if row_count > 1:
                logger.info(f"Table trouvée dans le contenu principal ({row_count} lignes)")
                return best
    
    # Stratégie 4: toutes les tables, prendre la plus grande
    all_tables = soup.find_all('table')
    if all_tables:
        best = max(all_tables, key=lambda t: len(t.find_all('tr')))
        row_count = len(best.find_all('tr'))
        if row_count > 1:
            logger.info(f"Table trouvée (fallback, {row_count} lignes)")
            return best
    
    return None


def extract_headers(table):
    """Extrait les en-têtes du tableau."""
    headers = []
    thead = table.find('thead')
    
    if thead:
        # Chercher dans les <th> du thead
        for th in thead.find_all('th'):
            text = th.get_text(strip=True)
            # Aussi vérifier data-label
            if not text:
                text = th.get('data-label', '') or th.get('aria-label', '')
            if not text:
                text = f"Column_{len(headers)+1}"
            headers.append(text)
    
    if not headers:
        # Prendre la première ligne
        first_row = table.find('tr')
        if first_row:
            for cell in first_row.find_all(['th', 'td']):
                text = cell.get_text(strip=True) or f"Column_{len(headers)+1}"
                headers.append(text)
    
    return headers


def clean_numeric(value, is_financial=False):
    """Nettoie et convertit une valeur numérique."""
    if not value or not isinstance(value, str):
        return value
    
    clean = value.strip().replace('\xa0', '').replace(' ', '')
    
    if not re.match(r'^[\d.,]+$', clean):
        return value
    
    try:
        clean = clean.replace(',', '.')
        if '.' in clean:
            result = float(clean)
            if is_financial and result < 1000:
                return int(round(result * 1000))
            return result if result != int(result) else int(result)
        else:
            return int(clean)
    except (ValueError, TypeError):
        return value


def extract_rows(table, headers):
    """Extrait les données des lignes du tableau."""
    results = []
    
    tbody = table.find('tbody')
    if tbody:
        rows = tbody.find_all('tr')
    else:
        all_rows = table.find_all('tr')
        rows = all_rows[1:] if len(all_rows) > 1 else []
    
    # Colonnes financières
    financial_cols = {'allocation', 'alloc', 'prime', 'gain', 'prix', 'valeur'}
    
    for row in rows:
        cells = row.find_all(['td', 'th'])
        if len(cells) < 2:
            continue
        
        row_data = {}
        for idx, cell in enumerate(cells):
            if idx >= len(headers):
                continue
            
            # Valeur
            value = cell.get('data-text') or cell.get('data-value') or cell.get_text(strip=True)
            if not value:
                continue
            
            header = headers[idx]
            is_fin = any(term in header.lower() for term in financial_cols)
            
            # Convertir les nombres
            value = clean_numeric(value, is_financial=is_fin)
            
            row_data[header] = value
            
            # Capturer les URLs
            link = cell.find('a')
            if link and link.get('href'):
                href = link['href']
                if not href.startswith('http'):
                    href = f"{BASE_URL}{href}"
                row_data[f"{header}_url"] = href
        
        if row_data:
            results.append(row_data)
    
    return results


# ============================================================
# Pipeline principal
# ============================================================

def extract_category(session, category, config, year=None):
    """Extrait les données d'une catégorie."""
    url = config['url']
    params = dict(config.get('params', {}))
    
    if year:
        params['annee'] = str(year)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"📊 Extraction: {category.upper()}")
    logger.info(f"🔗 URL: {url}")
    
    html = fetch_page(session, url, params)
    
    if not html:
        logger.error(f"❌ Impossible de charger la page pour {category}")
        return {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "erreur": "Impossible de charger la page"
            },
            "resultats": []
        }
    
    # Sauvegarder HTML debug
    os.makedirs(DEBUG_DIR, exist_ok=True)
    debug_path = os.path.join(DEBUG_DIR, f"{category}_requests.html")
    with open(debug_path, 'w', encoding='utf-8') as f:
        f.write(html)
    logger.info(f"📄 HTML sauvegardé: {debug_path}")
    
    # Parser
    soup = BeautifulSoup(html, 'html.parser')
    
    # Trouver le tableau
    table = find_data_table(soup)
    
    if not table:
        logger.error(f"❌ Aucun tableau trouvé pour {category}")
        # Log le titre de la page pour debug
        title = soup.find('title')
        logger.info(f"   Titre page: {title.text if title else 'N/A'}")
        # Vérifier s'il y a un message d'erreur ou redirection
        body_text = soup.get_text()[:500]
        logger.info(f"   Début page: {body_text[:200]}")
        
        return {
            "metadata": {
                "source": url,
                "date_extraction": datetime.now().isoformat(),
                "category": category,
                "erreur": "Aucun tableau trouvé"
            },
            "resultats": []
        }
    
    # Extraire headers et données
    headers = extract_headers(table)
    logger.info(f"📋 En-têtes: {headers}")
    
    rows = extract_rows(table, headers)
    logger.info(f"✅ {len(rows)} résultats extraits pour {category}")
    
    # Construire le résultat
    data = {
        "metadata": {
            "source": url,
            "date_extraction": datetime.now().isoformat(),
            "category": category,
            "nombre_resultats": len(rows),
            "methode": "requests+beautifulsoup"
        },
        "resultats": rows
    }
    
    return data


def save_json(data, category):
    """Sauvegarde les données en JSON."""
    os.makedirs(DATA_DIR, exist_ok=True)
    filepath = os.path.join(DATA_DIR, f"{category}.json")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"💾 Sauvegardé: {filepath}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Extraction des classements France Galop")
    parser.add_argument('categories', nargs='?', default='',
                       help='Catégories (séparées par virgule)')
    parser.add_argument('--year', type=int, default=None,
                       help='Année du classement')
    parser.add_argument('--max-clicks', type=int, default=100,
                       help='Ignoré (compatibilité avec ancien scraper)')
    args = parser.parse_args()
    
    # Sélection des catégories
    if args.categories:
        selected = [c.strip() for c in args.categories.split(',') if c.strip() in CATEGORIES]
    else:
        selected = list(CATEGORIES.keys())
    
    if not selected:
        selected = list(CATEGORIES.keys())
    
    logger.info("🚀 Scraper Rankings France Galop (requests + BeautifulSoup)")
    logger.info(f"📅 Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    logger.info(f"📊 Catégories: {', '.join(selected)}")
    if args.year:
        logger.info(f"📅 Année: {args.year}")
    
    # Créer la session
    session = create_session()
    
    # Résultats
    results = {}
    
    for category in selected:
        config = CATEGORIES[category]
        
        data = extract_category(session, category, config, year=args.year)
        
        success = save_json(data, category)
        count = len(data.get('resultats', []))
        error = data.get('metadata', {}).get('erreur')
        
        results[category] = {
            'success': success and count > 0,
            'count': count,
            'error': error
        }
        
        # Pause entre les catégories
        time.sleep(random.uniform(1.0, 3.0))
    
    # Résumé
    logger.info(f"\n{'='*60}")
    logger.info("📊 RÉSUMÉ")
    logger.info(f"{'='*60}")
    
    all_success = True
    for category, result in results.items():
        status = "✅" if result['success'] else "❌"
        logger.info(f"  {status} {category}: {result['count']} résultats" + 
                   (f" — Erreur: {result['error']}" if result.get('error') else ""))
        if not result['success']:
            all_success = False
    
    logger.info(f"\n{'✅ Extraction terminée!' if all_success else '⚠️ Extraction terminée avec des erreurs'}")
    
    return all_success


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
