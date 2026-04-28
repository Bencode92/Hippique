#!/usr/bin/env python3
"""
Snapshot brut — copie pure des fichiers data/*.json (extraits France Galop)
vers data/rankings/YYYY-MM-DD_HHhMM/, **sans aucune transformation**.

Le snapshot contient les données telles que retournées par le scraper :
- 'Rang' = officiel France Galop
- 'Victoires', 'Partants', 'Places', 'Allocation tot.', etc.
- Aucun ratio calculé, aucun ScoreMixte inventé. C'est au consommateur
  (live-scoring.js, stats.html, …) de calculer ce dont il a besoin.

Usage : python3 scripts/snapshot_brut.py [stamp]
        stamp défaut = date UTC actuelle (YYYY-MM-DD_HHhMM)
"""
import os
import shutil
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

SOURCES = [
    'chevaux.json', 'jockeys.json', 'cravache_or.json',
    'chevaux_2025.json', 'jockeys_2025.json', 'cravache_or_2025.json',
]


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else datetime.now(timezone.utc).strftime('%Y-%m-%d_%Hh%M')
    out_dir = os.path.join(DATA, 'rankings', stamp)
    os.makedirs(out_dir, exist_ok=True)

    print(f'📸 Snapshot brut → {out_dir}')
    for fn in SOURCES:
        src = os.path.join(DATA, fn)
        if not os.path.exists(src):
            print(f'  ⚠️  {fn} absent, skip')
            continue
        dst = os.path.join(out_dir, fn)
        shutil.copy2(src, dst)
        print(f'  ✅ {fn}')


if __name__ == '__main__':
    main()
