#!/usr/bin/env python3
"""Classement des jockeys par distance fine → data/jockeys_distance.json

Une pastille sur la carte : « 2e sur 2100 m ». Deux chiffres par case, parce
qu'ils disent des choses opposées (mesuré sur Barzalona : 3e meilleur taux de
victoire sur l'intermédiaire, et réel/promis 0,96) :

  taux de victoire  — la PERFORMANCE, ce que tout le monde voit ;
  réel / promis     — la VALEUR : victoires ÷ somme des probas implicites.
                      1,00 = exactement au prix du marché. > 1 = sous-estimé.

La bande est de ±100 m autour de la distance de la course : à la distance
exacte, 2 372 montes seulement à 2300 m, et aucune course à 1050 m. Minimum
50 montes dans la bande, sinon pas de pastille.

AVERTISSEMENT inscrit dans le fichier : la spécialité d'un jockey ne persiste
pas (corrélation +0,15 entre 2022-24 et 2025-26, et les dix meilleures cases
rendent -15,6 % ensuite, bench/jockeys_par_type.py). La pastille est une
lecture, pas un signal de pari.

    python3 bench/jockeys_distance.py
"""
import json, glob, math, collections

MIN_MONTES, BANDE = 50, 100
MIN_BELLE = 40          # belles courses : 543 groupes seulement, 20 jockeys à 50+ montes
rows, belles, noms_belles = [], [], set()
def _cle(t): return ''.join(ch for ch in (t or '').upper() if ch.isalpha())
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        dist = d.get('dist') or 0
        if dist < 800: continue
        for p in ps:
            rows.append(((p.get('jk') or '?').upper().strip(), dist, p['c'], p.get('a') == 1, (1 / p['c']) / inv))
        # « belle course » = groupe I, II ou III (ce que compte la cravache d'or).
        # data/courses ne porte pas la catégorie : on exporte aussi les NOMS des
        # groupes pour que la carte puisse les reconnaître (le parrain change,
        # « QATAR PRIX DE L'ARC DE TRIOMPHE » contient « PRIX DE L'ARC DE TRIOMPHE »).
        cat = (d.get('cat') or '')
        if 'GROUPE' in cat or 'CLASSIQUE' in cat:
            if d.get('lib'): noms_belles.add(_cle(d['lib']))
            for p in ps:
                belles.append(((p.get('jk') or '?').upper().strip(), dist, p['c'], p.get('a') == 1, (1 / p['c']) / inv, cat))

bandes = sorted({round(r[1] / 100) * 100 for r in rows})
out = {}
for b in bandes:
    sel = [r for r in rows if abs(r[1] - b) <= BANDE]
    if len(sel) < 300: continue
    par = collections.defaultdict(list)
    for r in sel: par[r[0]].append(r)
    cases = []
    for jk, v in par.items():
        if len(v) < MIN_MONTES: continue
        n = len(v); vic = sum(1 for r in v if r[3]); prom = sum(r[4] for r in v)
        gains = [(r[2] - 1) if r[3] else -1.0 for r in v]
        moy = sum(gains) / n
        sd = math.sqrt(sum((g - moy) ** 2 for g in gains) / (n - 1)) if n > 1 else 0
        cases.append(dict(jk=jk, n=n, v=vic, tx=round(100 * vic / n, 1),
                          rp=round(vic / prom, 2) if prom else 0,
                          roi=round(100 * moy, 1), se=round(100 * sd / math.sqrt(n), 1)))
    cases.sort(key=lambda c: -c['tx'])
    for i, c in enumerate(cases): c['rang'] = i + 1
    out[str(b)] = dict(montes=len(sel), jockeys=len(cases), classement=cases)

# ── classement en belles courses (toutes distances : 4 433 montes seulement) ──
parb = collections.defaultdict(list)
for r in belles: parb[r[0]].append(r)
casesb = []
for jk, v in parb.items():
    if len(v) < MIN_BELLE: continue
    n = len(v); vic = sum(1 for r in v if r[3]); prom = sum(r[4] for r in v)
    gains = [(r[2] - 1) if r[3] else -1.0 for r in v]
    moy = sum(gains) / n
    sd = math.sqrt(sum((g - moy) ** 2 for g in gains) / (n - 1)) if n > 1 else 0
    g1 = [r for r in v if 'GROUPE_I' == r[5]]
    casesb.append(dict(jk=jk, n=n, v=vic, tx=round(100 * vic / n, 1), rp=round(vic / prom, 2) if prom else 0,
                       roi=round(100 * moy, 1), se=round(100 * sd / math.sqrt(n), 1),
                       g1=len(g1), g1v=sum(1 for r in g1 if r[3])))
casesb.sort(key=lambda c: -c['tx'])
for i, c in enumerate(casesb): c['rang'] = i + 1

doc = {
    '_doc': ("Classement des jockeys par bande de distance (±%d m, minimum %d montes). "
             "tx = taux de victoire (performance) ; rp = réel/promis = victoires / somme des probas "
             "implicites (valeur : 1,00 = au prix du marché) ; roi = rendement d'un pari sur toutes "
             "ses montes de la bande, se = erreur-type. LECTURE SEULE : la spécialité d'un jockey ne "
             "persiste pas d'une période à l'autre (corrélation +0,15 ; les dix meilleures cases de "
             "2022-24 rendent -15,6 %% ± 8 sur 2025-26, bench/jockeys_par_type.py). Ce n'est pas un "
             "signal de pari.") % (BANDE, MIN_MONTES),
    'genere_le': __import__('datetime').date.today().isoformat(),
    'periode': [min(r[1] for r in rows) and '2022-01', '2026-10'],
    'montes_totales': len(rows), 'bandes': out,
    'belles_courses': dict(montes=len(belles), courses=len(noms_belles), jockeys=len(casesb), classement=casesb),
    'noms_belles_courses': sorted(noms_belles),
}
json.dump(doc, open('data/jockeys_distance.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f"{len(rows)} montes · {len(out)} bandes · {len(belles)} montes en belles courses ({len(noms_belles)} groupes) → data/jockeys_distance.json")
print("  belles courses, top 6 : " + " · ".join(f"{c['rang']}. {c['jk']} {c['tx']}% rp{c['rp']} ({c['n']}m, {c['g1v']}/{c['g1']} en Gr.I)" for c in casesb[:6]))
for b in ['1000', '1200', '1600', '2000', '2100', '2400', '3000']:
    if b not in out: continue
    c = out[b]['classement'][:3]
    print(f"  {b} m ({out[b]['jockeys']} jockeys) : " + " · ".join(f"{x['rang']}. {x['jk']} {x['tx']}% rp{x['rp']}" for x in c))
