#!/usr/bin/env python3
"""Lecture d'une réunion course par course → data/jour/<date>_<hip>_lecture.json

    python3 bench/analyse_reunion.py 2026-11-08 SAINT-CLOUD
    python3 bench/analyse_reunion.py 2026-10-11 AUTEUIL

Pour chaque jockey de chaque course, trois ou quatre classements au taux de
victoire, tous calculés sur l'historique AVANT le jour analysé :

  hb  — l'hippodrome SUR la longueur (même discipline) ;
  fb  — la France sur la longueur. En plat c'est EXACTEMENT la pastille de la
        carte (data/jockeys_distance.json, ±100 m, 50 montes) ; en obstacle,
        ±400 m (à ±100 m aucun jockey n'a 25 montes sur 4 700 m) ;
  g   — plat seulement : les courses de groupe sur la longueur (la « belle
        course », même table que la pastille 🏆 de la carte) ;
  h   — l'hippodrome, toutes longueurs.

rp = réel/promis (victoires ÷ somme des probas implicites ; 1,00 = au prix).
LECTURE, PAS SIGNAL : la spécialité d'un jockey ne persiste pas d'une période
à l'autre (corrélation +0,15, bench/jockeys_par_type.py).
"""
import json, glob, sys, collections, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"
DISC_LIB = {"PLAT": "plat", "HAIE": "haies", "STEEPLECHASE": "steeple", "CROSS": "cross"}
# (bande hippodrome, min hippodrome, bande France, min France)
PARAMS = {"PLAT": (200, 15, 100, 50), "OBST": (400, 15, 400, 25)}

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None

def nom(x):
    return (x if isinstance(x, str) else (x or {}).get("nom") or "?").upper().strip()

jour_iso, hip_cible = sys.argv[1], sys.argv[2].upper()
jj = f"{jour_iso[8:10]}{jour_iso[5:7]}{jour_iso[:4]}"

def charge(motif):
    montes = []
    for f in sorted(glob.glob(motif)):
        for l in open(f, encoding="utf-8"):
            d = json.loads(l)
            if d["date"] >= jour_iso: continue
            ps = [p for p in d["parts"] if p.get("c") and p["c"] > 1]
            if len(ps) < 4 or not any(p.get("a") == 1 for p in ps): continue
            inv = sum(1 / p["c"] for p in ps)
            if not (1.05 <= inv <= 1.6): continue
            for p in ps:
                montes.append({"date": d["date"], "hip": (d["hip"] or "").upper(), "disc": d.get("disc") or "PLAT",
                               "dist": d.get("dist") or 0, "jk": (p.get("jk") or "?").upper().strip(),
                               "en": (p.get("en") or "?").upper().strip(), "ch": (p.get("nom") or "").upper(),
                               "c": p["c"], "a": p.get("a"), "v": p.get("a") == 1, "pi": (1 / p["c"]) / inv})
    return montes

def classement(rows, cle, mini):
    g = collections.defaultdict(lambda: [0, 0, 0.0])
    for m in rows:
        s = g[m[cle]]; s[0] += 1; s[1] += m["v"]; s[2] += m["pi"]
    cl = sorted(((k, s) for k, s in g.items() if s[0] >= mini), key=lambda t: (-t[1][1] / t[1][0], -t[1][0]))
    rangs = {k: dict(r=i + 1, tot=len(cl), n=s[0], v=s[1], tx=round(100 * s[1] / s[0]), rp=round(s[1] / s[2], 2) if s[2] else 0)
             for i, (k, s) in enumerate(cl)}
    brut = {k: dict(n=s[0], v=s[1]) for k, s in g.items()}
    return rangs, brut

def depuis_fichier(table):
    """Une case de data/jockeys_distance.json → même format que classement()."""
    if not table: return {}
    tot = len(table["classement"])
    return {c["jk"]: dict(r=c["rang"], tot=tot, n=c["n"], v=c["v"], tx=round(c["tx"]), rp=c["rp"]) for c in table["classement"]}

plat = charge("data/histo/*.jsonl")
obst = charge("data/histo_obstacle/*.jsonl")
JD = json.load(open("data/jockeys_distance.json", encoding="utf-8"))

# relevé précédent (même jour) : cote vue la fois d'avant et première cote vue
dest = f"data/jour/{jour_iso}_{hip_cible.lower().replace(' ', '')}_lecture.json"
try:
    _prev = json.load(open(dest, encoding="utf-8"))
    PREV = {(c["num"], p["n"]): p for c in _prev["courses"] for p in c["partants"]}
    PREV_T = _prev.get("releve")
except Exception:
    PREV, PREV_T = {}, None

prog = get(f"{BASE}/programme/{jj}?specialisation=INTERNET")
reu = next((r for r in (prog or {}).get("programme", {}).get("reunions", [])
            if hip_cible in ((r.get("hippodrome") or {}).get("libelleCourt") or "").upper()), None)
if not reu: sys.exit(f"{hip_cible} absent du programme PMU du {jour_iso}")

courses = []
for c in reu.get("courses", []):
    disc = c.get("discipline")
    if disc not in DISC_LIB: continue
    est_plat = disc == "PLAT"
    BH, MH, BF, MF = PARAMS["PLAT" if est_plat else "OBST"]
    dist = c.get("distance") or 0
    base = plat if est_plat else obst
    rows_d = [m for m in base if m["disc"] == disc]
    rows_h = [m for m in rows_d if hip_cible in m["hip"]]
    hb, hb_b = classement([m for m in rows_h if abs(m["dist"] - dist) <= BH], "jk", MH)
    h, h_b = classement(rows_h, "jk", MH)
    if est_plat:
        cle = str(round(dist / 100) * 100)
        fb = depuis_fichier(JD["bandes"].get(cle)); fb_b = {}
        g = depuis_fichier(JD["belles_par_distance"]["bandes"].get(cle))
    else:
        fb, fb_b = classement([m for m in rows_d if abs(m["dist"] - dist) <= BF], "jk", MF); g = None
    en, _ = classement(rows_h, "en", 1)
    data = get(f"{BASE}/programme/{jj}/R{reu.get('numOfficiel')}/C{c.get('numOrdre')}/participants?specialisation=INTERNET") or {}
    # masse du pool simple gagnant (centimes → €) : juge si une dérive est du bruit
    cb = get(f"{BASE}/programme/{jj}/R{reu.get('numOfficiel')}/C{c.get('numOrdre')}/combinaisons?specialisation=INTERNET") or {}
    sg = next((x for x in cb.get("combinaisons", []) if x.get("pariType") == "E_SIMPLE_GAGNANT"), {})
    masse = round((sg.get("totalEnjeu") or 0) / 100)
    parts = []
    for p in data.get("participants", []):
        if p.get("statut") == "NON_PARTANT": continue
        jk, ent, ch = nom(p.get("driver")), nom(p.get("entraineur")), (p.get("nom") or "").upper()
        cote = (p.get("dernierRapportDirect") or {}).get("rapport") or (p.get("dernierRapportReference") or {}).get("rapport")
        cote_ref = (p.get("dernierRapportReference") or {}).get("rapport")
        pv = PREV.get((c.get("numOrdre"), p.get("numPmu"))) or {}
        passe = sorted((m for m in rows_h if m["ch"] == ch), key=lambda m: m["date"])[-6:]
        parts.append(dict(n=p.get("numPmu"), nom=ch, cote=cote, cote_ref=cote_ref, cote_prec=pv.get("cote"),
                          cote_ouv=pv.get("cote_ouv") or pv.get("cote") or cote, jk=jk, en=ent, musique=p.get("musique") or "",
                          hb=hb.get(jk), hb_brut=hb_b.get(jk), fb=fb.get(jk), fb_brut=fb_b.get(jk),
                          g=(g or {}).get(jk) if g is not None else None, h=h.get(jk),
                          ici=[m["a"] or 0 for m in passe], en_ici=en.get(ent)))
    # heureDepart est un instant UTC : on l'affiche à l'heure de Paris (été comme hiver)
    hd = c.get("heureDepart")
    courses.append(dict(num=c.get("numOrdre"), nom=c.get("libelle"), heure=datetime.fromtimestamp(hd / 1000, tz=ZoneInfo("Europe/Paris")).strftime("%Hh%M") if hd else "?",
                        disc=DISC_LIB[disc], plat=est_plat, dist=dist, cat=(c.get("categorieParticularite") or "").replace("_", " ").lower(),
                        alloc=c.get("montantPrix"), masse=masse, bandes=dict(h=BH, f=BF, g=JD["belles_par_distance"]["bande"] if est_plat else None),
                        groupe_dispo=bool(g), partants=parts))

doc = dict(date=jour_iso, hippodrome=hip_cible, releve=datetime.now().strftime("%Y-%m-%d %H:%M"), releve_prec=PREV_T,
           cotes_publiees=any(p["cote"] for c in courses for p in c["partants"]),
           histo=dict(plat=len(plat), obstacle=len(obst)), courses=courses)
json.dump(doc, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(dest, "·", len(courses), "courses ·", "cotes publiées" if doc["cotes_publiees"] else "pas encore de cotes")
