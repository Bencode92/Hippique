#!/usr/bin/env python3
"""
Génère data/courses/_index.json — liste des fichiers de courses pour
permettre le listing côté frontend SANS taper api.github.com (rate limit
60/h) ni dépendre de jsdelivr (limite 50 MB sur ce repo).

Le frontend fetch ensuite ce fichier via raw.githubusercontent.com avec
cache-buster → aucun rate limit, données fraîches.

Usage : python3 scripts/update_courses_index.py
"""
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES_DIR = os.path.join(ROOT, 'data', 'courses')
INDEX_PATH = os.path.join(COURSES_DIR, '_index.json')


def main():
    if not os.path.isdir(COURSES_DIR):
        print(f'❌ {COURSES_DIR} introuvable', file=sys.stderr)
        sys.exit(1)

    files = []
    for name in sorted(os.listdir(COURSES_DIR)):
        if not name.endswith('.json') or name.startswith('_'):
            continue
        path = os.path.join(COURSES_DIR, name)
        files.append({
            'name': name,
            'size': os.path.getsize(path),
        })

    payload = {
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'count': len(files),
        'files': files,
    }

    with open(INDEX_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(INDEX_PATH) / 1024
    print(f'✅ {INDEX_PATH} — {len(files)} fichiers ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
