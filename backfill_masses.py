#!/usr/bin/env python3
"""
Masses d'enjeux par cheval et par pool, pour les courses de data/histo/.

    python3 backfill_masses.py

L'endpoint `combinaisons` de l'API PMU sert, y compris sur l'historique, le
total misé sur chaque cheval dans chaque pool. C'est ce qui permet le test de
Hausch-Ziemba (« Dr Z ») : comparer la part d'un cheval dans le pool GAGNANT à
sa part dans le pool PLACÉ. Un rapport élevé signale un cheval que le public
joue pour gagner mais pas pour se placer — la seule inefficience du pari mutuel
documentée qui survive hors échantillon dans la littérature.

Sortie : data/masses/YYYY-MM.jsonl, reprise automatique.
"""
import json, os, sys, time, urllib.request, urllib.error
BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"
RAC = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(RAC, "data", "histo"), os.path.join(RAC, "data", "masses")
GARDE = {"E_SIMPLE_GAGNANT", "E_SIMPLE_PLACE"}

def get(url, essais=3):
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 204, 400): return None
        except Exception: pass
        time.sleep(0.5 * (i + 1))
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    deja = set()
    for f in os.listdir(OUT):
        if f.endswith(".jsonl"):
            for l in open(os.path.join(OUT, f), encoding="utf-8"):
                try:
                    d = json.loads(l); deja.add((d["date"], d["r"], d["c"]))
                except Exception: pass
    t0, n = time.time(), 0
    for src in sorted(os.listdir(SRC)):
        if not src.endswith(".jsonl"): continue
        mois = src[:-6]
        with open(os.path.join(OUT, f"{mois}.jsonl"), "a", encoding="utf-8") as fh:
            for l in open(os.path.join(SRC, src), encoding="utf-8"):
                cr = json.loads(l); k = (cr["date"], cr["r"], cr["c"])
                if k in deja: continue
                d = cr["date"].replace("-", ""); d = d[6:8] + d[4:6] + d[0:4]
                data = get(f"{BASE}/programme/{d}/R{cr['r']}/C{cr['c']}/combinaisons?specialisation=INTERNET")
                time.sleep(0.1)
                if not data: continue
                pools = {}
                for cb in (data.get("combinaisons") or []):
                    t = cb.get("pariType")
                    if t not in GARDE: continue
                    lc = cb.get("listeCombinaisons") or []
                    m = {}
                    for x in lc:
                        c = x.get("combinaison") or []
                        if len(c) == 1 and x.get("totalEnjeu"): m[str(c[0])] = x["totalEnjeu"]
                    if m: pools[t] = m
                if len(pools) < 2: continue
                fh.write(json.dumps({"date": cr["date"], "r": cr["r"], "c": cr["c"],
                                     "pools": pools}, ensure_ascii=False) + "\n")
                n += 1
                if n % 400 == 0: print(f"  {n} courses  ({(time.time()-t0)/60:.1f} min)", flush=True)
        print(f"{mois} — {n} cumulées", flush=True)
    print(f"\n{n} courses écrites en {(time.time()-t0)/60:.1f} min")

if __name__ == "__main__":
    main()
