#!/usr/bin/env python3
"""
Reconstitution de l'historique des courses FR plat depuis l'API PMU.

    python3 backfill_histo.py 2025
    python3 backfill_histo.py 2025-10-01 2025-12-31

Jeu de données SÉPARÉ de data/courses/ : il ne sert pas au scoring par leviers
(qui exige les snapshots de classements, donc >= 16/04/2026) mais à l'étude de
la structure de marché — taille de peloton, distance, allocation, cote.
Aucun risque de leakage : la cote finale et l'arrivée sont figées à la course.

Format : un fichier JSONL par mois, une ligne par course. Surtout PAS un
fichier par course — data/courses/ a déjà fait exploser le plafond de 1000
entrées de l'API GitHub en août.
"""
import json, os, sys, time, urllib.request, urllib.error
from datetime import date, timedelta

BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "histo")
PAUSE = 0.12          # politesse envers l'API
TIMEOUT = 25

def get(url, essais=3):
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if i == essais - 1:
                return None
        except Exception:
            if i == essais - 1:
                return None
        time.sleep(0.6 * (i + 1))
    return None

def compacte(p):
    rd = p.get("dernierRapportDirect") or {}
    rr = p.get("dernierRapportReference") or {}
    g = p.get("gainsParticipant") or {}
    return {
        "n": p.get("numPmu"),
        "c": rd.get("rapport"),                       # cote finale
        "cr": rr.get("rapport"),                      # cote de référence
        "a": p.get("ordreArrivee"),                   # rang d'arrivée (None = non classé)
        "p": p.get("handicapPoids"),                  # poids ×10 = Valeur FG ×10
        "m": p.get("musique"),
        "nc": p.get("nombreCourses"), "nv": p.get("nombreVictoires"), "np": p.get("nombrePlaces"),
        "g": g.get("gainsCarriere"),
        "co": p.get("placeCorde"),
        "ag": p.get("age"), "sx": p.get("sexe"),
        "jk": p.get("driver") if isinstance(p.get("driver"), str) else (p.get("driver") or {}).get("nom"),
        "en": p.get("entraineur") if isinstance(p.get("entraineur"), str) else (p.get("entraineur") or {}).get("nom"),
        "nom": p.get("nom"),
    }

def jour(d):
    """Retourne la liste des courses FR plat terminées de cette date."""
    prog = get(f"{BASE}/programme/{d.strftime('%d%m%Y')}?specialisation=INTERNET")
    if not prog:
        return []
    out = []
    for r in (prog.get("programme") or {}).get("reunions", []):
        if (r.get("pays") or {}).get("code") != "FRA":
            continue
        hip = (r.get("hippodrome") or {}).get("libelleCourt") or "?"
        for c in r.get("courses", []):
            if c.get("discipline") != "PLAT" or not c.get("arriveeDefinitive"):
                continue
            rn, cn = r.get("numOfficiel"), c.get("numOrdre")
            data = get(f"{BASE}/programme/{d.strftime('%d%m%Y')}/R{rn}/C{cn}/participants?specialisation=INTERNET")
            time.sleep(PAUSE)
            ps = (data or {}).get("participants") or []
            ps = [compacte(p) for p in ps]
            ps = [p for p in ps if p["c"] and p["c"] > 1]
            if len(ps) < 4 or not any(p["a"] == 1 for p in ps):
                continue
            out.append({
                "date": d.isoformat(), "hip": hip, "r": rn, "c": cn,
                "lib": c.get("libelle"),
                "dist": c.get("distance"),
                "alloc": c.get("montantPrix"),          # niveau de la course
                "cat": c.get("categorieParticularite"),
                "spe": c.get("specialite"),
                "corde": c.get("corde"),
                "np_dec": c.get("nombreDeclaresPartants"),
                "parts": ps,
            })
    return out

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    a = sys.argv[1]
    if len(a) == 4:
        d1, d2 = date(int(a), 1, 1), date(int(a), 12, 31)
    else:
        d1 = date.fromisoformat(a)
        d2 = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else d1
    d2 = min(d2, date.today() - timedelta(days=1))
    os.makedirs(OUT, exist_ok=True)

    # reprise : on saute les dates déjà collectées
    vues = set()
    for f in os.listdir(OUT):
        if f.endswith(".jsonl"):
            for l in open(os.path.join(OUT, f), encoding="utf-8"):
                try: vues.add(json.loads(l)["date"])
                except Exception: pass
    fini = {d for d in vues}

    d, tot, t0 = d1, 0, time.time()
    while d <= d2:
        if d.isoformat() in fini:
            d += timedelta(days=1); continue
        cs = jour(d)
        if cs:
            p = os.path.join(OUT, f"{d.strftime('%Y-%m')}.jsonl")
            with open(p, "a", encoding="utf-8") as fh:
                for c in cs:
                    fh.write(json.dumps(c, ensure_ascii=False) + "\n")
            tot += len(cs)
        if d.day == 1 or d == d2:
            el = time.time() - t0
            print(f"  {d}  cumul {tot} courses  ({el/60:.1f} min)", flush=True)
        d += timedelta(days=1)
    print(f"\n{tot} courses FR plat écrites dans data/histo/ en {(time.time()-t0)/60:.1f} min")

if __name__ == "__main__":
    main()
