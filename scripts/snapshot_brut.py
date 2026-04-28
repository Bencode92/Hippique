#!/usr/bin/env python3
"""
Snapshot brut — copie les fichiers JSON bruts de data/ vers data/rankings/YYYY-MM-DD_HHhMM/
en gardant le Rang officiel France Galop. Calcule les ratios usuels (TauxVictoire,
TauxPlace, GainMoyen) à la volée pour rester compatible avec live-scoring.js / stats.html
qui les attendent, mais SANS recalculer le Rang ni inventer un ScoreMixte.

Usage : python3 scripts/snapshot_brut.py [stamp]
        stamp défaut = date UTC actuelle (YYYY-MM-DD_HHhMM)
"""
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

# Fichiers bruts à snapshoter (clé = nom du fichier dans data/, valeur = nom dans le snapshot)
SOURCES = [
    'chevaux.json', 'jockeys.json', 'cravache_or.json',
    'chevaux_2025.json', 'jockeys_2025.json', 'cravache_or_2025.json',
    # Les autres restent disponibles en local mais on n'en a pas besoin pour le scoring
    # 'eleveurs.json', 'entraineurs.json', 'proprietaires.json',
]


def to_float(v, default=0.0):
    if v is None:
        return default
    try:
        return float(str(v).replace(',', '.').replace(' ', ''))
    except (ValueError, TypeError):
        return default


def enrich_entry(r):
    """Ajoute TauxVictoire/TauxPlace/GainMoyen sans toucher au Rang."""
    # Champs varient selon la catégorie : jockeys/cravache utilisent 'Partants'/'Victoires',
    # chevaux utilisent 'NbCourses'/'NbVictoires'.
    partants = to_float(r.get('Partants') or r.get('NbCourses') or r.get('Courses'))
    victoires = to_float(r.get('Victoires') or r.get('NbVictoires'))
    places = to_float(r.get('Places') or r.get('NbPlace') or r.get('Place'))
    alloc = to_float(r.get('Allocation tot.') or r.get('Alloc. tot.'))

    if partants > 0:
        r.setdefault('TauxVictoire', f'{victoires / partants * 100:.1f}')
        r.setdefault('TauxPlace', f'{places / partants * 100:.1f}')
        r.setdefault('GainMoyen', round(alloc / partants, 2))

    # ScoreMixte : on garde un proxy simple = TauxVictoire (% de victoires brut)
    # comme ça quand le code consommateur fait mxF(... 'ScoreMixte') ça reste cohérent
    # avec un signal "plus c'est haut mieux c'est". On NE recalcule PAS le Rang.
    if 'ScoreMixte' not in r and 'TauxVictoire' in r:
        r['ScoreMixte'] = r['TauxVictoire']

    # Pour les chevaux, harmoniser la clé "Nom" si seulement "Cheval" / "LibelleCheval"
    if 'Nom' not in r:
        r['Nom'] = r.get('Cheval') or r.get('LibelleCheval') or r.get('Nom') or ''

    return r


def snapshot_one(src_path, dst_path, category):
    with open(src_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    resultats = data.get('resultats', [])
    if isinstance(resultats, dict):
        # Format alternatif : {nom: {...}} → liste de {Nom: nom, ...}
        resultats = [{'Nom': k, **v} for k, v in resultats.items()]

    for r in resultats:
        enrich_entry(r)

    enriched = {
        'metadata': {
            'category': category,
            'extraction_date': datetime.now(timezone.utc).isoformat(),
            'extraction_method': 'brut_snapshot',  # vs 'pondered_ranking' avant
            'source_file': f'data/{os.path.basename(src_path)}',
            'totalPopulation': len(resultats),
            'note': 'Rang = officiel France Galop. Ratios calculés mais Rang non recalculé.',
        },
        'resultats': resultats,
    }

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with open(dst_path, 'w', encoding='utf-8') as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)

    return len(resultats)


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else datetime.now(timezone.utc).strftime('%Y-%m-%d_%Hh%M')
    out_dir = os.path.join(DATA, 'rankings', stamp)

    print(f'📸 Snapshot brut → {out_dir}')
    total = 0
    for fn in SOURCES:
        src = os.path.join(DATA, fn)
        if not os.path.exists(src):
            print(f'  ⚠️  {fn} absent, skip')
            continue
        category = fn.replace('.json', '')
        dst = os.path.join(out_dir, fn)
        n = snapshot_one(src, dst, category)
        total += n
        print(f'  ✅ {fn} ({n} entrées)')

    print(f'\nTotal : {total} entrées dans {out_dir}')


if __name__ == '__main__':
    main()
