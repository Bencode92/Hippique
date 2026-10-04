#!/usr/bin/env python3
"""Classement des jockeys par type de course — et la question qui compte :
un « spécialiste » d'une distance gagne-t-il PLUS que sa cote ne le promet ?

« Barzalona est très fort sur 2100-2300 m » : un jockey peut être très bon sur
un segment ET être un mauvais pari, si le public le sait déjà et raccourcit sa
cote. On mesure donc deux choses séparément :
  - la PERFORMANCE : taux de victoire par segment (ce que tout le monde voit) ;
  - la VALEUR : réel / promis = victoires / somme des probas implicites. 1,00 =
    exactement au prix. C'est elle qui dit s'il y a un pari.

Et le test honnête : la spécialité d'un jockey sur 2022-2024 se retrouve-t-elle
sur 2025-2026 ? Avec ~400 jockeys × 4 segments, des « spécialités » apparaissent
par hasard ; seule la persistance compte.

    python3 bench/jockeys_par_type.py [NOM]
"""
import json, glob, sys, math, collections
import numpy as np

SEG = lambda d: 'sprint <1400' if d < 1400 else 'mile 1400-1900' if d < 1900 else 'intermédiaire 1900-2400' if d < 2400 else 'tenue 2400+'
rows = []
for f in sorted(glob.glob('data/histo/*.jsonl')):
    for l in open(f, encoding='utf-8'):
        d = json.loads(l)
        if d.get('spe') != 'PLAT': continue
        ps = [p for p in d['parts'] if p.get('c') and p['c'] > 1]
        if len(ps) < 5 or not any(p.get('a') == 1 for p in ps): continue
        inv = sum(1 / p['c'] for p in ps)
        if not (1.05 <= inv <= 1.6): continue
        dist = d.get('dist') or 0
        for p in ps:
            rows.append((p.get('jk') or '?', SEG(dist), d['date'], p['c'], p.get('a') == 1, (1 / p['c']) / inv))

def stats(sel):
    n = len(sel); 
    if not n: return None
    v = sum(1 for r in sel if r[4]); prom = sum(r[5] for r in sel)
    g = np.array([(r[3] - 1) if r[4] else -1.0 for r in sel])
    return dict(n=n, v=v, tx=100 * v / n, rp=v / prom if prom else 0, roi=100 * g.mean(),
                se=100 * g.std(ddof=1) / math.sqrt(n) if n > 1 else 0, cote=np.mean([r[3] for r in sel]))

if len(sys.argv) > 1:
    nom = sys.argv[1].upper()
    sel = [r for r in rows if nom in r[0].upper()]
    if not sel: print(f"aucune monte pour « {nom} »"); sys.exit()
    print(f"{sel[0][0]} — {len(sel)} montes, {sum(1 for r in sel if r[4])} victoires\n")
    print(f"   {'segment':26s} {'montes':>7s} {'victoires':>10s} {'taux':>7s} {'cote moy':>9s} {'réel/promis':>12s} {'ROI':>16s}")
    for s in ['sprint <1400', 'mile 1400-1900', 'intermédiaire 1900-2400', 'tenue 2400+']:
        st = stats([r for r in sel if r[1] == s])
        if not st or st['n'] < 20: print(f"   {s:26s} {st['n'] if st else 0:>7d}   (trop peu)"); continue
        print(f"   {s:26s} {st['n']:>7d} {st['v']:>10d} {st['tx']:>6.1f} % {st['cote']:>9.1f} {st['rp']:>12.2f} {st['roi']:>+8.1f} % ±{st['se']:4.0f}")
    st = stats(sel); print(f"   {'TOUTES':26s} {st['n']:>7d} {st['v']:>10d} {st['tx']:>6.1f} % {st['cote']:>9.1f} {st['rp']:>12.2f} {st['roi']:>+8.1f} % ±{st['se']:4.0f}")
    sys.exit()

print("══ Top jockeys par segment (200 montes minimum), classés par taux de victoire")
par = collections.defaultdict(list)
for r in rows: par[(r[0], r[1])].append(r)
for s in ['sprint <1400', 'mile 1400-1900', 'intermédiaire 1900-2400', 'tenue 2400+']:
    cells = [(k[0], stats(v)) for k, v in par.items() if k[1] == s and len(v) >= 200]
    cells.sort(key=lambda x: -x[1]['tx'])
    print(f"\n── {s}")
    print(f"   {'jockey':26s} {'montes':>7s} {'taux V':>8s} {'réel/promis':>12s} {'ROI':>16s}")
    for nom, st in cells[:8]:
        print(f"   {nom:26s} {st['n']:>7d} {st['tx']:>7.1f} % {st['rp']:>12.2f} {st['roi']:>+8.1f} % ±{st['se']:4.0f}")

# ── la spécialité persiste-t-elle ? -------------------------------------
print("\n══ La spécialité d'un jockey se répète-t-elle ? (apprise 2022-2024, vérifiée 2025-2026)")
A = [r for r in rows if r[2] < '2025-01-01']; B = [r for r in rows if r[2] >= '2025-01-01']
pa = collections.defaultdict(list); pb = collections.defaultdict(list)
for r in A: pa[(r[0], r[1])].append(r)
for r in B: pb[(r[0], r[1])].append(r)
# pour chaque jockey ayant >= 150 montes dans un segment sur les deux périodes
dup = [(k, stats(v), stats(pb[k])) for k, v in pa.items() if len(v) >= 150 and len(pb.get(k, [])) >= 80]
if dup:
    xa = np.array([a['rp'] for _, a, b in dup]); xb = np.array([b['rp'] for _, a, b in dup])
    r = np.corrcoef(xa, xb)[0, 1]
    print(f"   {len(dup)} couples jockey×segment · corrélation du réel/promis entre les deux périodes : {r:+.2f}")
    top = sorted(dup, key=lambda t: -t[1]['rp'])[:10]
    print(f"   Les 10 « meilleurs rapports qualité-prix » de 2022-2024, et ce qu'ils ont donné ensuite :")
    print(f"   {'jockey × segment':44s} {'2022-24':>18s} {'2025-26':>18s}")
    for k, a, b in top:
        print(f"   {(k[0]+' · '+k[1]):44s} {a['rp']:>6.2f} ({a['n']:4d}) {b['rp']:>10.2f} ({b['n']:4d})")
    ga = np.mean([b['roi'] for _, a, b in top]); gse = np.std([b['roi'] for _, a, b in top], ddof=1) / math.sqrt(len(top))
    print(f"\n   → jouer ces 10 cellules sur 2025-2026 : ROI moyen {ga:+.1f} % ± {gse:.0f}")
