#!/usr/bin/env python3
"""
LIVE SCORING — Résultat en 10 secondes, pas besoin de GitHub

Usage : python3 live-scoring.py
  → Scrape les courses du jour
  → Calcule le scoring
  → Affiche le résultat dans le terminal

Ou : python3 live-scoring.py R1 C3
  → Scoring d'une course spécifique (Réunion 1, Course 3)
"""

import requests
import json
import sys
import math
import os
from datetime import datetime, timezone, timedelta

BASE_URL = "https://online.turfinfo.api.pmu.fr/rest/client/61"
HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}

# Charger les classements 2025 (locaux)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_rankings():
    rankings = {}
    for cat, key in [('chevaux_2025', 'Nom'), ('jockeys_2025', 'NomPostal')]:
        try:
            path = os.path.join(SCRIPT_DIR, f'data/{cat}_ponderated_latest.json')
            d = json.load(open(path))
            rankings[cat] = {}
            for item in d.get('resultats', []):
                k = (item.get(key) or '').upper().strip()
                if k:
                    rankings[cat][k] = item
        except:
            rankings[cat] = {}
    return rankings


def match_initiale(data, nom):
    if not nom or len(nom) < 3:
        return None
    n = nom.upper().strip()
    if n in data:
        return data[n]
    import re
    cleaned = re.sub(r'^MME\s+|^MLLE\s+', '', n, flags=re.I)
    m = re.match(r'^([A-Z]{1,3})\.?\s*(.+?)(?:\s*\(.*\))?$', cleaned)
    if not m:
        return None
    init = m.group(1)[0]
    fam = re.sub(r'\s*\([A-Z]\)\s*$', '', m.group(2)).strip()
    if len(fam) < 3:
        return None
    for k, v in data.items():
        if (k.endswith(fam) or f' {fam}' in k):
            prenom = k.replace(fam, '').replace('MME ', '').strip()
            if prenom and prenom[0] == init:
                return v
    return None


def parse_musique(m):
    if not m:
        return 50
    import re
    positions = re.sub(r'\(\d+\)', '', m)
    matches = re.findall(r'(\d+|[DRT])[a-z]', positions, re.I)
    if len(matches) < 2:
        return 50
    last5 = []
    for x in matches[:5]:
        if x in 'DRT':
            last5.append(12)
        else:
            n = int(x)
            last5.append(12 if n == 0 else n)
    sc, w = 0, 0
    for i, pos in enumerate(last5):
        wt = (len(last5) - i) / len(last5)
        ps = {1: 100, 2: 80, 3: 65}.get(pos, 45 if pos <= 5 else (25 if pos <= 8 else 10))
        sc += ps * wt
        w += wt
    return sc / w if w > 0 else 50


def score_participant(p, dist, rankings):
    """Calcule le score d'un participant."""
    ch_name = p.get('nom', '').upper().strip()
    j_name = (p.get('driver') or '').strip() if isinstance(p.get('driver'), str) else ''
    if isinstance(p.get('driver'), dict):
        j_name = p['driver'].get('nom', '')

    # Valeur FG
    valeur = 0
    handicap = p.get('handicapPoids')
    if handicap and isinstance(handicap, (int, float)):
        valeur = handicap / 10

    # Cote
    rd = p.get('dernierRapportDirect', {}) or {}
    cote = rd.get('rapport', 0) if isinstance(rd, dict) else 0
    score_cote = (1 / cote) * 100 if cote > 1 else 50

    # Cote reference
    rr = p.get('dernierRapportReference', {}) or {}
    cote_ref = rr.get('rapport', 0) if isinstance(rr, dict) else 0

    # Musique
    musique = p.get('musique', '')
    score_musique = parse_musique(musique)

    # Classement 2025
    rc = rankings['chevaux_2025'].get(ch_name)
    taux_v = float(rc.get('TauxVictoire', 0)) if rc else 8

    # Scoring par distance
    if dist < 1400:  # Sprint
        score = score_musique * 0.4 + score_cote * 0.4 + valeur * 0.2
    elif dist < 1700:  # Mile
        score = valeur * 0.5 + score_cote * 0.3 + score_musique * 0.2
    elif dist < 2200:  # Middle
        nb_courses = p.get('nombreCourses', 0) or 0
        nb_victoires = p.get('nombreVictoires', 0) or 0
        indiv_v = (nb_victoires / nb_courses * 100) if nb_courses >= 2 else 8
        score = score_cote * 0.5 + valeur * 0.3 + indiv_v * 0.2
    else:  # Staying
        score = score_cote * 0.4 + valeur * 0.3 + score_musique * 0.3

    # Dérive cote
    derive = ''
    if cote > 1 and cote_ref > 1:
        pct = round((cote / cote_ref - 1) * 100)
        if abs(pct) > 5:
            derive = f'{"↑" if pct > 0 else "↓"}{pct:+d}%'

    return {
        'num': p.get('numPmu', '?'),
        'nom': ch_name,
        'jockey': j_name,
        'cote': cote,
        'cote_ref': cote_ref,
        'derive': derive,
        'valeur': valeur,
        'musique_score': round(score_musique),
        'score': round(score, 1),
        'favori': rd.get('favoris', False) if isinstance(rd, dict) else False,
    }


def main():
    date_pmu = datetime.now().strftime("%d%m%Y")
    date_iso = datetime.now().strftime("%Y-%m-%d")

    print(f"\n🏇 LIVE SCORING — {date_iso}")
    print("=" * 60)

    # Charger les classements
    rankings = load_rankings()
    print(f"📊 {len(rankings['chevaux_2025'])} chevaux 2025, {len(rankings['jockeys_2025'])} jockeys")

    # Récupérer le programme
    resp = requests.get(f"{BASE_URL}/programme/{date_pmu}?specialisation=INTERNET", headers=HEADERS)
    if resp.status_code != 200:
        print("❌ Pas de programme aujourd'hui")
        return

    reunions = resp.json().get('programme', {}).get('reunions', [])

    # Filtrer par R/C si spécifié
    filter_r = None
    filter_c = None
    if len(sys.argv) >= 2:
        import re
        m = re.match(r'R(\d+)', sys.argv[1], re.I)
        if m:
            filter_r = int(m.group(1))
        if len(sys.argv) >= 3:
            m = re.match(r'C(\d+)', sys.argv[2], re.I)
            if m:
                filter_c = int(m.group(1))

    for reunion in reunions:
        r_num = reunion.get('numOfficiel', 0)
        if filter_r and r_num != filter_r:
            continue

        hippo = reunion.get('hippodrome', {})
        hippo_nom = hippo.get('libelleCourt', '?') if isinstance(hippo, dict) else str(hippo)

        for course in reunion.get('courses', []):
            c_num = course.get('numOrdre', 0)
            if filter_c and c_num != filter_c:
                continue

            c_nom = course.get('libelle', '')
            distance = course.get('distance', 0)
            depart_ts = course.get('heureDepart')
            depart = ''
            if depart_ts:
                dt = datetime.fromtimestamp(depart_ts / 1000, tz=timezone.utc) + timedelta(hours=2)
                depart = dt.strftime("%Hh%M")

            # Charger les participants
            p_resp = requests.get(
                f"{BASE_URL}/programme/{date_pmu}/R{r_num}/C{c_num}/participants?specialisation=INTERNET",
                headers=HEADERS
            )
            if p_resp.status_code != 200:
                continue

            participants = p_resp.json().get('participants', [])
            partants = [p for p in participants
                        if not p.get('estNonPartant') and p.get('statut', '').upper() != 'NON_PARTANT']

            if not partants:
                continue

            # Scorer
            scored = [score_participant(p, distance, rankings) for p in partants]
            scored.sort(key=lambda x: -x['score'])

            # Normaliser 10-90
            scores = [s['score'] for s in scored]
            min_s, max_s = min(scores), max(scores)
            rng = max_s - min_s or 1
            for s in scored:
                s['score_norm'] = round((s['score'] - min_s) / rng * 80 + 10, 1)

            # Afficher
            dist_label = 'Sprint' if distance < 1400 else 'Mile' if distance < 1700 else 'Middle' if distance < 2200 else 'Staying'
            print(f"\n{'━' * 60}")
            print(f"🏟️  {hippo_nom} R{r_num}C{c_num} — {c_nom}")
            print(f"📏 {distance}m ({dist_label}) | ⏰ {depart} | 🐴 {len(partants)} partants")
            print(f"{'━' * 60}")
            print(f"{'#':>3} {'Cheval':<22} {'Cote':>5} {'Dérive':>7} {'Val':>4} {'Mus':>4} {'Score':>6}")
            print(f"{'─' * 60}")

            for i, s in enumerate(scored):
                medal = '🥇' if i == 0 else '🥈' if i == 1 else '🥉' if i == 2 else '  '
                cote_str = f"{s['cote']:.1f}" if s['cote'] > 0 else '-'
                derive_color = s['derive']
                print(f"{medal}{s['num']:>2} {s['nom'][:21]:<22} {cote_str:>5} {derive_color:>7} {s['valeur']:>4.0f} {s['musique_score']:>4} {s['score_norm']:>6}")

            # Favori marché
            by_cote = sorted([s for s in scored if s['cote'] > 1], key=lambda x: x['cote'])
            if by_cote:
                fav = by_cote[0]
                notre1 = scored[0]
                if fav['num'] != notre1['num']:
                    print(f"\n⭐ Favori marché: #{fav['num']} {fav['nom'][:20]} (cote {fav['cote']:.1f})")
                    print(f"🎯 Notre #1:      #{notre1['num']} {notre1['nom'][:20]} (cote {notre1['cote']:.1f})")
                    print(f"   → DIVERGENCE = potentiel VALUE BET")
                else:
                    print(f"\n✅ Notre #1 = Favori marché: #{notre1['num']} {notre1['nom'][:20]}")

    print(f"\n{'=' * 60}")
    print("Terminé.")


if __name__ == '__main__':
    main()
