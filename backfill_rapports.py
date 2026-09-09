#!/usr/bin/env python3
"""
Rapports définitifs PMU pour les courses déjà présentes dans data/histo/.

    python3 backfill_rapports.py            # tout data/histo/
    python3 backfill_rapports.py 2025-03    # un mois

Un appel API par course. Sortie : data/rapports/YYYY-MM.jsonl, une ligne par
course, reprise automatique. Permet de chiffrer le ROI réel de n'importe
quelle stratégie sur simple gagnant, simple placé, couplé gagnant, couplé
placé, trio et super quatre — au lieu de le déduire des seules cotes gagnant.

dividendePourUnEuro est en CENTIMES pour 1 € misé : 560 = 5,60 €.
"""
import json, os, sys, time, urllib.request, urllib.error
BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"
RAC = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(RAC, "data", "histo"), os.path.join(RAC, "data", "rapports")
# On garde TOUS les types exposés : outre les six habituels, certaines courses
# offrent E_DEUX_SUR_QUATRE et E_MINI_MULTI, et les grandes E_TIERCE/QUARTE/QUINTE.
GARDE = None

def get(url, essais=3):
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 204): return None
        except Exception:
            pass
        time.sleep(0.5 * (i + 1))
    return None

def main():
    filtre = sys.argv[1] if len(sys.argv) > 1 else ""
    os.makedirs(OUT, exist_ok=True)
    deja = set()
    for f in os.listdir(OUT):
        if f.endswith(".jsonl"):
            for l in open(os.path.join(OUT, f), encoding="utf-8"):
                try:
                    d = json.loads(l); deja.add((d["date"], d["r"], d["c"]))
                except Exception: pass
    t0, n, vus = time.time(), 0, 0
    for src in sorted(os.listdir(SRC)):
        if not src.endswith(".jsonl") or (filtre and not src.startswith(filtre)): continue
        mois = src[:-6]
        with open(os.path.join(OUT, f"{mois}.jsonl"), "a", encoding="utf-8") as fh:
            for l in open(os.path.join(SRC, src), encoding="utf-8"):
                cr = json.loads(l); k = (cr["date"], cr["r"], cr["c"])
                vus += 1
                if k in deja: continue
                d = cr["date"].replace("-", "")
                d = d[6:8] + d[4:6] + d[0:4]
                data = get(f"{BASE}/programme/{d}/R{cr['r']}/C{cr['c']}/rapports-definitifs?specialisation=INTERNET")
                time.sleep(0.1)
                if not data: continue
                paris = {}
                for p in data:
                    t = p.get("typePari")
                    if GARDE and t not in GARDE: continue
                    paris[t] = [{"comb": r.get("combinaison"),
                                 "div": r.get("dividendePourUnEuro"),
                                 "ng": r.get("nombreGagnants")}
                                for r in (p.get("rapports") or []) if r.get("combinaison")]
                if not paris: continue
                fh.write(json.dumps({"date": cr["date"], "hip": cr["hip"], "r": cr["r"],
                                     "c": cr["c"], "paris": paris}, ensure_ascii=False) + "\n")
                n += 1
                if n % 250 == 0:
                    print(f"  {n} rapports  ({(time.time()-t0)/60:.1f} min)", flush=True)
        print(f"{mois} terminé — {n} rapports cumulés", flush=True)
    print(f"\n{n} rapports écrits sur {vus} courses en {(time.time()-t0)/60:.1f} min")

if __name__ == "__main__":
    main()
