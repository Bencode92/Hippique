#!/usr/bin/env python3
"""Lecture d'une réunion d'obstacle course par course → data/jour/<date>_<hip>_obstacle.md

    python3 bench/analyse_obstacle.py 2026-10-11 AUTEUIL

Le classement des jockeys par distance (bench/jockeys_distance.py) ne voit que
le PLAT. Ici, sur data/histo_obstacle/ (HISTO_DISCIPLINE=OBSTACLE backfill_histo.py) :

  jockey   — rang dans la discipline (haies OU steeple) sur la bande de distance
             (±400 m : les distances d'obstacle sont plus dispersées qu'en plat),
             et à l'hippodrome dans la discipline ;
  cheval   — ses courses passées sur cet hippodrome dans la discipline ;
  entraîneur — taux de victoire sur l'hippodrome dans la discipline.

tx = taux de victoire ; rp = réel/promis (victoires ÷ somme des probas implicites,
1,00 = au prix du marché). LECTURE, PAS SIGNAL : en plat, la spécialité d'un
jockey ne persiste pas d'une période à l'autre (corrélation +0,15).
"""
import json, glob, sys, collections, os, urllib.request

BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"
BANDE, MIN_J, MIN_HIP = 400, 25, 15
DISC_LIB = {"HAIE": "haies", "STEEPLECHASE": "steeple", "CROSS": "cross"}

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None

def nom_jk(p):
    d = p.get("driver")
    return (d if isinstance(d, str) else (d or {}).get("nom") or "?").upper().strip()

def nom_en(p):
    e = p.get("entraineur")
    return (e if isinstance(e, str) else (e or {}).get("nom") or "?").upper().strip()

jour_iso, hip_cible = sys.argv[1], sys.argv[2].upper()

# ── historique : une ligne par monte, AVANT le jour analysé (aucun leakage)
montes = []
for f in sorted(glob.glob("data/histo_obstacle/*.jsonl")):
    for l in open(f, encoding="utf-8"):
        d = json.loads(l)
        if d["date"] >= jour_iso: continue
        ps = [p for p in d["parts"] if p.get("c") and p["c"] > 1]
        if len(ps) < 4 or not any(p.get("a") == 1 for p in ps): continue
        inv = sum(1 / p["c"] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        for p in ps:
            montes.append({"date": d["date"], "hip": (d["hip"] or "").upper(), "disc": d.get("disc"),
                           "dist": d.get("dist") or 0, "jk": (p.get("jk") or "?").upper().strip(),
                           "en": (p.get("en") or "?").upper().strip(), "ch": (p.get("nom") or "").upper(),
                           "c": p["c"], "a": p.get("a"), "v": p.get("a") == 1, "pi": (1 / p["c"]) / inv,
                           "lib": d.get("lib"), "np": len(ps)})
if not montes:
    sys.exit("data/histo_obstacle/ vide : lancer HISTO_DISCIPLINE=OBSTACLE python3 backfill_histo.py …")
periode = (min(m["date"] for m in montes), max(m["date"] for m in montes))

def agrege(rows, cle):
    g = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])
    for m in rows:
        s = g[m[cle]]; s[0] += 1; s[1] += m["v"]; s[2] += m["pi"]; s[3] += (m["c"] - 1 if m["v"] else -1)
    return g

def classement(rows, cle, mini):
    g = agrege(rows, cle)
    cl = sorted(((k, s) for k, s in g.items() if s[0] >= mini), key=lambda t: (-t[1][1] / t[1][0], -t[1][0]))
    return {k: (i + 1, len(cl), s) for i, (k, s) in enumerate(cl)}, g

def fmt(s):
    n, v, pi, _ = s
    return f"{v}/{n} ({100*v/n:.0f} %, rp {v/pi:.2f})" if n else "–"

# ── programme du jour (cotes du moment si publiées)
prog = get(f"{BASE}/programme/{jour_iso[8:10]}{jour_iso[5:7]}{jour_iso[:4]}?specialisation=INTERNET")
reu = next((r for r in (prog or {}).get("programme", {}).get("reunions", [])
            if hip_cible in ((r.get("hippodrome") or {}).get("libelleCourt") or "").upper()), None)
if not reu: sys.exit(f"{hip_cible} absent du programme PMU du {jour_iso}")

out = [f"# {hip_cible} — {jour_iso[8:10]}/{jour_iso[5:7]}/{jour_iso[:4]} · lecture obstacle", "",
       f"Historique obstacle FR {periode[0]} → {periode[1]} : {len(montes):,} montes".replace(",", " ")
       + f". Jockey : rang au taux de victoire dans la discipline, bande ±{BANDE} m (min {MIN_J} montes),"
       f" puis sur l'hippodrome (min {MIN_HIP}). **rp** = réel/promis : > 1 = a gagné plus que ses cotes ne le disaient."
       " *Lecture, pas signal de pari : sur 45 629 paris en plat, aucune case ne battait le prélèvement.*", ""]

for c in reu.get("courses", []):
    disc = c.get("discipline")
    if disc not in DISC_LIB: continue
    dist = c.get("distance") or 0
    rn, cn = reu.get("numOfficiel"), c.get("numOrdre")
    data = get(f"{BASE}/programme/{jour_iso[8:10]}{jour_iso[5:7]}{jour_iso[:4]}/R{rn}/C{cn}/participants?specialisation=INTERNET") or {}
    ps = [p for p in data.get("participants", []) if p.get("statut") != "NON_PARTANT"]
    rows_d = [m for m in montes if m["disc"] == disc]
    rows_b = [m for m in rows_d if abs(m["dist"] - dist) <= BANDE]
    rows_h = [m for m in rows_d if hip_cible in m["hip"]]
    cl_b, g_b = classement(rows_b, "jk", MIN_J)
    cl_h, g_h = classement(rows_h, "jk", MIN_HIP)
    _, en_h = classement(rows_h, "en", 1)
    heure = c.get("heureDepart")
    from datetime import datetime
    hh = datetime.fromtimestamp(heure / 1000).strftime("%Hh%M") if heure else "?"
    out += [f"### C{cn}. {c.get('libelle')}", "",
            f"*{hh} · {DISC_LIB[disc]} · {dist} m · {len(ps)} partants · {c.get('categorieParticularite','').replace('_',' ').lower()}"
            f" · {(c.get('montantPrix') or 0):,} €*".replace(",", " "), ""]
    lignes = []
    for p in ps:
        jk, en, ch = nom_jk(p), nom_en(p), (p.get("nom") or "").upper()
        cote = (p.get("dernierRapportDirect") or {}).get("rapport") or (p.get("dernierRapportReference") or {}).get("rapport")
        rb = cl_b.get(jk); rh = cl_h.get(jk)
        jb = f"**{rb[0]}{'er' if rb[0]==1 else 'e'}**/{rb[1]} · {fmt(rb[2])}" if rb else (f"({fmt(g_b[jk])})" if g_b[jk][0] else "–")
        jh = f"**{rh[0]}{'er' if rh[0]==1 else 'e'}**/{rh[1]} · {fmt(rh[2])}" if rh else (f"({fmt(g_h[jk])})" if g_h[jk][0] else "–")
        passe = [m for m in rows_h if m["ch"] == ch]
        hist = " ".join(("**1**" if m["a"] == 1 else str(m["a"] or "0")) for m in sorted(passe, key=lambda m: m["date"])[-6:]) or "–"
        lignes.append((rb[0] if rb else 999, f"| {p.get('numPmu')} | {ch} | {cote or '–'} | {jk} | {jb} | {jh} | {hist} | {en} {fmt(en_h[en]) if en_h[en][0] else '–'} | {p.get('musique') or ''} |"))
    out += ["| n° | cheval | cote | jockey | jockey · bande ±400 m | jockey · " + hip_cible.lower() + " | cheval ici (6 dern.) | entraîneur ici | musique |",
            "|--:|:--|--:|:--|:--|:--|:--|:--|:--|"]
    out += [l for _, l in sorted(lignes, key=lambda t: t[0])]
    out.append("")

dest = f"data/jour/{jour_iso}_{hip_cible.lower()}_obstacle.md"
open(dest, "w", encoding="utf-8").write("\n".join(out))
print(dest)
