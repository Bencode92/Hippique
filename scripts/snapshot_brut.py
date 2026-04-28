#!/usr/bin/env python3
"""
Snapshot brut — copie pure des CSV France Galop (data/raw_csv/) vers
data/rankings/YYYY-MM-DD_HHhMM/, **sans aucune transformation**.

Le snapshot contient les CSV exactement tels que téléchargés depuis
France Galop, avec le Rang officiel et les colonnes brutes
(Chevaux, Partants, Victoires, Places, Allocation tot., etc.).
Aucun ratio calculé, aucun ScoreMixte inventé. Charge au consommateur
de faire son analyse.

Usage : python3 scripts/snapshot_brut.py [stamp]
        stamp défaut = date UTC actuelle (YYYY-MM-DD_HHhMM)
"""
import os
import shutil
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw_csv')
OUT_BASE = os.path.join(ROOT, 'data', 'rankings')

SOURCES = [
    'chevaux.csv', 'chevaux_2025.csv',
    'jockeys.csv', 'jockeys_2025.csv',
    'cravache_or.csv', 'cravache_or_2025.csv',
    'entraineurs.csv', 'entraineurs_2025.csv',
    'eleveurs.csv', 'eleveurs_2025.csv',
    'proprietaires.csv', 'proprietaires_2025.csv',
]


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else datetime.now(timezone.utc).strftime('%Y-%m-%d_%Hh%M')
    out_dir = os.path.join(OUT_BASE, stamp)
    os.makedirs(out_dir, exist_ok=True)

    print(f'📸 Snapshot CSV brut → {out_dir}')
    copied = 0
    for fn in SOURCES:
        src = os.path.join(RAW, fn)
        if not os.path.exists(src):
            print(f'  ⚠️  {fn} absent, skip')
            continue
        dst = os.path.join(out_dir, fn)
        shutil.copy2(src, dst)
        copied += 1
        size_kb = os.path.getsize(dst) / 1024
        print(f'  ✅ {fn} ({size_kb:.1f} KB)')

    print(f'\n{copied} fichiers copiés.')


if __name__ == '__main__':
    main()
