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


def _empreinte(dossier):
    """Empreinte du contenu d'un dossier de classements (taille + hash des CSV)."""
    import hashlib
    h = hashlib.sha256()
    for f in sorted(os.listdir(dossier)):
        if not f.endswith('.csv'):
            continue
        with open(os.path.join(dossier, f), 'rb') as fh:
            h.update(f.encode()); h.update(fh.read())
    return h.hexdigest()


def refuser_si_identique(stamp):
    """Un snapshot n'a de sens que si les CSV France Galop ont changé.

    data/raw_csv/ n'est PAS téléchargé automatiquement : ce sont les exports que
    Benoit récupère sur le site France Galop et pousse à la main. Le cron
    hebdomadaire ne fait que les horodater. Sans cette garde, il fabriquait des
    dossiers « 2026-09-21 » et « 2026-09-28 » contenant les données du 5
    septembre — un faux horodatage que le code prenait pour un classement frais.
    """
    base = OUT_BASE
    anciens = sorted(d for d in os.listdir(base) if d[:4].isdigit() and d != stamp)
    if not anciens:
        return
    dernier = os.path.join(base, anciens[-1])
    if _empreinte(dernier) == _empreinte(RAW):
        print(f"\n⛔ ABANDON : data/raw_csv est identique au snapshot {anciens[-1]}.")
        print("   Les classements France Galop n'ont pas été réimportés depuis.")
        print("   Télécharge les CSV sur France Galop, pousse-les dans data/raw_csv/,")
        print("   et le snapshot se fera au prochain passage (ou à la main).")
        sys.exit(78)   # 78 = EX_CONFIG : échec volontaire, visible dans Actions


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else datetime.now(timezone.utc).strftime('%Y-%m-%d_%Hh%M')
    refuser_si_identique(stamp)
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
