#!/usr/bin/env python3
"""
Génère data/cotes_live/_index.json — liste des fichiers de cotes pré-course
disponibles, pour que le frontend puisse les overrider sur les cotes
initiales du matin (data/courses/).

Format : { generated_at, count, files: [{name, hippo, reunion, numero, scraped_at}] }
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_DIR = os.path.join(ROOT, 'data', 'cotes_live')
INDEX_PATH = os.path.join(LIVE_DIR, '_index.json')

PATTERN = re.compile(r'^(\d{4}-\d{2}-\d{2})_(.+?)_R(\d+)C(\d+)_live\.json$')


def main():
    if not os.path.isdir(LIVE_DIR):
        print(f'❌ {LIVE_DIR} introuvable', file=sys.stderr)
        sys.exit(1)

    files = []
    for name in sorted(os.listdir(LIVE_DIR)):
        if not name.endswith('.json') or name.startswith('_'):
            continue
        m = PATTERN.match(name)
        if not m:
            continue
        date, hippo, reunion, numero = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
        scraped_at = None
        try:
            with open(os.path.join(LIVE_DIR, name), encoding='utf-8') as f:
                d = json.load(f)
                scraped_at = d.get('scraped_at')
        except Exception:
            pass
        files.append({
            'name': name,
            'date': date,
            'hippo': hippo,
            'reunion': reunion,
            'numero': numero,
            'scraped_at': scraped_at,
        })

    payload = {
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'count': len(files),
        'files': files,
    }

    with open(INDEX_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    print(f'✅ {INDEX_PATH} — {len(files)} fichiers')


if __name__ == '__main__':
    main()
