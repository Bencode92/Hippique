#!/usr/bin/env python3
"""Page téléphone d'une réunion, depuis data/jour/<date>_<hip>_lecture.json.

    python3 bench/page_reunion.py data/jour/2026-11-08_saint-cloud_lecture.json sortie.html

Publiée comme Artifact claude.ai. Lecture, pas signal de pari.
"""
import json, sys, html

doc = json.load(open(sys.argv[1], encoding="utf-8"))
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

def e(s): return html.escape(str(s if s is not None else ""))
def fr(x): return str(x).replace(".", ",")
def rang(r): return f"{r}{'er' if r == 1 else 'e'}"
def cote_txt(c): return fr(c) if c else "–"
def hip_nom(h): return h.title().replace("Saint-", "Saint-")

def chip(d, label, brut=None):
    if not d:
        extra = f" ({brut['v']}/{brut['n']})" if brut else ""
        return f'<span class="chip peu"><b>{label}</b> trop peu de montes{extra}</span>'
    cls = "top" if d["r"] <= 3 else ("bas" if d["r"] > d["tot"] * 2 / 3 else "")
    rpc = "plus" if d["rp"] >= 1.2 else ("moins" if d["rp"] < 0.85 else "")
    return (f'<span class="chip {cls}"><b>{label}</b> {rang(d["r"])}<i>/{d["tot"]}</i> · {d["tx"]} % '
            f'<span class="rp {rpc}">rp {fr(d["rp"])}</span></span>')

def cell(d):
    if not d: return '<span class="mute">–</span>'
    return f'<b>{rang(d["r"])}</b><i>/{d["tot"]}</i> · {d["tx"]} %'

from datetime import date
dj = date.fromisoformat(doc["date"])
HIP = hip_nom(doc["hippodrome"])
titre = f"{HIP} {dj.day} {MOIS[dj.month - 1]}"
cotes = doc["cotes_publiees"]
releve = doc["releve"][11:16].replace(":", "h")

sections = []
for c in doc["courses"]:
    ps = c["partants"]
    ps.sort(key=lambda p: (p["cote"] or 999, p["n"]))
    for i, p in enumerate(ps): p["rc"] = i + 1 if cotes else None
    cl = sorted([p for p in ps if p["hb"]], key=lambda p: (p["hb"]["r"], p["fb"]["r"] if p["fb"] else 999))
    for i, p in enumerate(cl): p["rj"] = i + 1
    if cotes:
        for i, p in enumerate(sorted(cl, key=lambda p: p["cote"] or 999)): p["rcc"] = i + 1
    ordre = cl + sorted([p for p in ps if not p["hb"]], key=lambda p: p["fb"]["r"] if p["fb"] else 999)
    gcol = c["plat"]
    trs = []
    for p in ordre:
        flag = ""
        if p.get("rj") and cotes:
            ecart = p["rcc"] - p["rj"]
            flag = ' class="sous"' if ecart >= 3 else (' class="sur"' if ecart <= -3 else "")
        elif not p.get("rj"):
            flag = ' class="peu"'
        r = p.get("rj", "–")
        tds = [f'<td class="r">{r}</td>', f'<td>{e(p["jk"])} <span class="mute">n°{p["n"]}</span></td>',
               f'<td class="g">{cell(p["hb"])}</td>', f'<td class="g">{cell(p["fb"])}</td>']
        if gcol: tds.append(f'<td class="g">{cell(p["g"]) if c["groupe_dispo"] else "<span class=mute>–</span>"}</td>')
        tds.append(f'<td class="c">{cote_txt(p["cote"])}{f" <i>({p[chr(114)+chr(99)]})</i>" if p.get("rc") else ""}</td>')
        trs.append(f"<tr{flag}>{''.join(tds)}</tr>")
    head = ["#", "Jockey", f"{HIP} ±{c['bandes']['h']}", f"France ±{c['bandes']['f']}"]
    if gcol: head.append(f"Groupes ±{c['bandes']['g']}")
    head.append("Cote (rg)")
    groupe_note = "" if not gcol or c["groupe_dispo"] else f'<p class="mute small">Pas de classement « groupes » à {c["dist"]} m : trop peu de courses de groupe sur cette longueur.</p>'
    jtab = (f'<div class="jtab"><h3>Jockeys sur {c["dist"]} m <span class="mute">· {e(c["disc"])}</span></h3>'
            f'<div class="scroll"><table><thead><tr>{"".join(f"<th>{e(h)}</th>" for h in head)}</tr></thead>'
            f'<tbody>{"".join(trs)}</tbody></table></div>{groupe_note}</div>')
    # lecture
    notes = []
    if cl:
        t = cl[0]
        notes.append(f"Meilleur jockey à {HIP} sur la longueur : <b>{e(t['jk'])}</b> (n°{t['n']} {e(t['nom'])}{', ' + cote_txt(t['cote']) if cotes else ''}), {t['hb']['tx']} % de victoires.")
    tf = min((p for p in ps if p["fb"]), key=lambda p: p["fb"]["r"], default=None)
    if tf and (not cl or tf is not cl[0]):
        notes.append(f"Meilleur en France sur la longueur : <b>{e(tf['jk'])}</b> (n°{tf['n']}), {rang(tf['fb']['r'])} sur {tf['fb']['tot']}.")
    if gcol and c["groupe_dispo"]:
        tg = min((p for p in ps if p["g"]), key=lambda p: p["g"]["r"], default=None)
        if tg: notes.append(f"En courses de groupe sur la longueur : <b>{e(tg['jk'])}</b> (n°{tg['n']}) {rang(tg['g']['r'])} sur {tg['g']['tot']}.")
    if cotes:
        fav = ps[0]
        notes.append(f"Favori <b>{e(fav['nom'])}</b> ({cote_txt(fav['cote'])}) : " +
                     (f"son jockey est {rang(fav['rj'])} sur {len(cl)} classés de la course." if fav.get("rj") else f"jockey avec trop peu de montes à {HIP} sur cette longueur."))
        sous = [p for p in cl if p["rcc"] - p["rj"] >= 3]
        if sous: notes.append("Jockeys mieux classés que leur cote : " + ", ".join(f"{e(p['jk'])} (n°{p['n']}, {cote_txt(p['cote'])})" for p in sous) + ".")
    gagne = [p for p in ps if 1 in p["ici"]]
    if gagne: notes.append(f"Déjà gagnant à {HIP} : " + ", ".join(f"n°{p['n']} {e(p['nom'])}" for p in gagne) + ".")
    cards = []
    for p in ps:
        ici = " ".join(f'<b class="v">1</b>' if a == 1 else str(a) for a in p["ici"]) or '<span class="mute">jamais couru ici</span>'
        ei = p["en_ici"]
        ent = f'{e(p["en"])} <span class="mute">· ' + (f'{ei["tx"]} % ici ({ei["v"]}/{ei["n"]})' if ei else "pas de course ici") + "</span>"
        chips = chip(p["hb"], f"{HIP} · longueur", p.get("hb_brut")) + chip(p["fb"], "France · longueur", p.get("fb_brut"))
        if gcol and c["groupe_dispo"]: chips += chip(p["g"], "Groupes · longueur")
        chips += chip(p["h"], f"{HIP} · tout")
        cards.append(f'''<li class="cheval">
  <div class="tete"><span class="n">{p["n"]}</span><span class="nom">{e(p["nom"])}</span><span class="cote">{cote_txt(p["cote"])}</span></div>
  <div class="jk">{e(p["jk"])}</div>
  <div class="chips">{chips}</div>
  <dl>
    <div><dt>Ici</dt><dd class="hist">{ici}</dd></div>
    <div><dt>Entr.</dt><dd>{ent}</dd></div>
    <div><dt>Musique</dt><dd class="mus">{e(p["musique"]) or '<span class="mute">–</span>'}</dd></div>
  </dl>
</li>''')
    alloc = f" · {c['alloc']:,} €".replace(",", " ") if c.get("alloc") else ""
    sections.append(f'''<section class="course" id="c{c["num"]}">
  <header><span class="heure">{e(c["heure"])}</span><h2><span class="cn">C{c["num"]}</span> {e(c["nom"])}</h2>
  <p class="meta">{e(c["disc"])} · {c["dist"]} m · {len(ps)} partants · {e(c["cat"])}{alloc}</p></header>
  <div class="lecture">{"".join(f"<p>{n}</p>" for n in notes)}</div>
  {jtab}
  <ol class="chevaux">{"".join(cards)}</ol>
</section>''')

MISE = int(sys.argv[3]) if len(sys.argv) > 3 else 20
REGLE = doc["hippodrome"].replace(" ", "").replace("-", "") in ("LONGCHAMP", "SAINTCLOUD")
lignes = []
for c in doc["courses"]:
    ps = c["partants"]; regle = REGLE and len(ps) >= 14
    fav = ps[0] if cotes else None
    if fav:
        jkr = f'{rang(fav["fb"]["r"])} France' if fav["fb"] else "jockey non classé"
        cheval = f'<b class="pick">n°{fav["n"]} {e(fav["nom"])}</b><span class="mute small2">{e(fav["jk"])} · {jkr}</span>'
        cote = cote_txt(fav["cote"])
    else:
        cheval = '<b class="pick">le favori</b><span class="mute small2">la plus petite cote au moment de jouer</span>'
        cote = "–"
    lignes.append(f'<tr{" class=regle" if regle else ""}><td class="h">{e(c["heure"])}</td><td class="r">C{c["num"]}</td>'
                  f'<td class="ch">{cheval}{"<span class=tag>règle 14+</span>" if regle else ""}</td><td class="c">{cote}</td><td class="c">{MISE} €</td></tr>')
jeu = f'''<section class="jeu">
  <h2>À jouer</h2>
  <p class="consigne"><b>Simple gagnant, {MISE} € par course, sur le favori.</b> {"Les noms s'affichent dès que le PMU publie les cotes ; d'ici là, jouer le cheval à la plus petite cote dans l'appli au moment du pari." if not cotes else f"Favoris d'après les cotes PMU relevées à {releve} : si un autre cheval est passé favori au moment de jouer, garder celui de la fiche."}</p>
  <div class="scroll"><table><thead><tr><th>Heure</th><th>Course</th><th>Cheval</th><th>Cote</th><th>Mise</th></tr></thead><tbody>{"".join(lignes)}</tbody></table></div>
  <p class="mute small">Total : {MISE * len(doc["courses"])} € sur {len(doc["courses"])} courses.{" Les courses marquées « règle 14+ » (14 partants ou plus) sont celles de notre règle en test ; les autres sont jouées sur le favori sans avantage mesuré (en moyenne le favori rend environ −14 %)." if REGLE else ""}</p>
</section>'''
nav = "".join(f'<a href="#c{c["num"]}">C{c["num"]}</a>' for c in doc["courses"])
discs = sorted({c["disc"] for c in doc["courses"]})
sous_titre = (f"{len(doc['courses'])} courses · {', '.join(discs)} · " +
              (f"chevaux classés par cote · cotes PMU relevées à {releve}" if cotes else f"cotes pas encore publiées (relevé {releve}) · chevaux par numéro"))
CSS = open(__file__.replace("page_reunion.py", "page_reunion.css"), encoding="utf-8").read()
out = f'''<title>{e(titre)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
{CSS}</style>
<div class="wrap">
  <h1>{e(HIP)} · {JOURS[dj.weekday()]} {dj.day} {MOIS[dj.month - 1]}</h1>
  <p class="sous">{e(sous_titre)}</p>
  <div class="legende">
    <span><b>Tableau jockeys</b> : les jockeys de la course classés <b>à {e(HIP)} sur la longueur</b> (même discipline), puis leur rang <b>France</b> sur la longueur{", et en <b>courses de groupe</b> sur la longueur" if any(c["plat"] for c in doc["courses"]) else ""}. Rang = taux de victoire parmi tous les jockeys classés.</span>
    <span>En plat, la colonne France est exactement la pastille de la carte (« 5e · 2000m ») et la colonne Groupes la pastille 🏆.</span>
    <span><b class="g">Vert</b> = jockey mieux classé que sa cote d'au moins 3 places. <b class="b">Rouge</b> = cote nettement meilleure que son jockey. <b>rp</b> (réel/promis) = victoires ÷ ce que ses cotes annonçaient.</span>
    <span><b>Ici</b> : 6 dernières places du cheval sur l'hippodrome (0 = non classé).</span>
    <span>Historique PMU depuis 2022 en plat, 2024 en obstacle. Une lecture du passé, pas un conseil de pari : la cote intègre déjà la réputation des jockeys.</span>
  </div>
  {jeu}
  <nav aria-label="Courses">{nav}</nav>
  {"".join(sections)}
  <footer>Relevé PMU à {releve} le {doc["releve"][8:10]}/{doc["releve"][5:7]}. Calcul : bench/analyse_reunion.py.</footer>
</div>
'''
open(sys.argv[2], "w", encoding="utf-8").write(out)
print(sys.argv[2])
