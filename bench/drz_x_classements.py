#!/usr/bin/env python3
"""
Les classements France Galop ajoutent-ils quelque chose au ratio Dr Z ?

    python3 bench/drz_x_classements.py

C'est le seul croisement jamais testé : le ratio Dr Z n'existe que là où les
masses sont collectées, les classements France Galop n'existent que depuis le
16/04/2026. Ce script les réunit sur la seule période où les deux coexistent.

PRÉ-SPÉCIFIÉ avant d'avoir les données 2026 en base.

Univers      : FR plat, 8 partants et plus, avril → septembre 2026
Référence    : ROI placé de l'univers ratio >= 1,15 (l'effet déjà établi)
Question     : à l'intérieur de cet univers, un critère de classement
               améliore-t-il encore le ROI ?
Critères testés, tous connus AVANT la course via le snapshot daté antérieur :
   - rang du cheval dans le classement France Galop (percentile)
   - rang du jockey
   - présence du jockey au classement Cravache d'or
   - éleveur classé
   - propriétaire classé
Seuil de lecture : un écart doit dépasser 2 erreurs-types pour être retenu.

PUISSANCE, annoncée d'avance : ~1 200 courses, donc ~2 500 chevaux à ratio
>= 1,15, soit ~1 250 par sous-groupe et une erreur-type de l'ordre de 4 à 5
points sur le ROI placé. Ce test peut détecter une interaction de 10 points ou
plus. Il ne peut PAS détecter un effet de 2 ou 3 points — l'absence de résultat
ne vaudra donc pas preuve d'absence d'effet, et je le dirai comme tel.
"""
import json, glob, os, csv, math, re

def f2(x):
    try: return float(str(x).replace(',', '.').replace(' ', ''))
    except Exception: return 0.0

def snapshots():
    base = 'data/rankings'
    out = []
    for d in sorted(os.listdir(base)):
        if not re.match(r'^\d{4}-\d{2}-\d{2}', d): continue
        tables = {}
        for k in ('chevaux', 'jockeys', 'cravache_or', 'eleveurs', 'proprietaires'):
            p = f'{base}/{d}/{k}.csv'
            if not os.path.exists(p): continue
            m = {}
            with open(p, encoding='utf-8', errors='replace') as fh:
                for i, row in enumerate(csv.DictReader(fh, delimiter='\t')):
                    # la colonne varie : « Cheval » pour les chevaux, « Nom » ailleurs
                    n = (row.get('Nom') or row.get('Cheval') or row.get('NomPostal') or '').upper().strip()
                    if n: m.setdefault(n, {'rang': i + 1, 'row': row})
            tables[k] = m
            # index par NOM DE FAMILLE pour les personnes : le flux PMU rend
            # « A.POUCHIN » là où France Galop écrit « AURELIEN POUCHIN ».
            if k in ('jockeys', 'cravache_or'):
                fam = {}
                for n, v in m.items():
                    dernier = n.split()[-1] if n.split() else ''
                    if dernier and dernier not in fam: fam[dernier] = v
                tables[k + '_fam'] = fam
        if tables: out.append((d[:10], tables))
    return out

def nomfam(n):
    """« A.POUCHIN » ou « MME K. MORICE » -> « POUCHIN », « MORICE »."""
    n = (n or '').upper().replace('.', ' ').strip()
    parts = [x for x in n.split() if len(x) > 2 and x not in ('MME', 'MLLE', 'MR')]
    return parts[-1] if parts else ''

SNAP = snapshots()
def avant(date):
    best = None
    for d, t in SNAP:
        if d <= date: best = t
        else: break
    return best

def charge():
    M, R = {}, {}
    for f in sorted(glob.glob('data/masses/2026-*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); M[(d['date'], d['r'], d['c'])] = d['pools']
    for f in sorted(glob.glob('data/rapports/2026-*.jsonl')):
        for l in open(f, encoding='utf-8'):
            d = json.loads(l); R[(d['date'], d['r'], d['c'])] = d['paris']
    # noms complets (éleveur, propriétaire) : seulement dans data/courses
    detail = {}
    for f in sorted(glob.glob('data/courses/2026-*.json')):
        if os.path.basename(f)[:10] < '2026-04-16': continue
        try: d = json.load(open(f))
        except Exception: continue
        date = os.path.basename(f)[:10]
        for c in d.get('courses', []):
            num = int(re.sub(r'[^0-9]', '', str(c.get('numero') or 0)) or 0)
            for p in c.get('participants') or []:
                n = re.sub(r'[^0-9]', '', str(p.get('n°') or ''))
                if n:
                    detail[(date, num, n)] = {
                        'el': (p.get('éleveurs') or p.get('eleveurs') or '').upper().strip(),
                        'pr': (p.get('propriétaire') or p.get('proprietaire') or '').upper().strip()}
    B = []
    for f in sorted(glob.glob('data/histo/2026-*.jsonl')):
        for l in open(f, encoding='utf-8'):
            r = json.loads(l); k = (r['date'], r['r'], r['c'])
            if k not in M or k not in R: continue
            d3 = {x['comb']: x['div'] / 100.0 for x in (R[k].get('E_SIMPLE_PLACE') or [])
                  if 'NP' not in x['comb'] and x.get('div')}
            if len(d3) < 3: continue
            pg = M[k].get('E_SIMPLE_GAGNANT') or {}; pp = M[k].get('E_SIMPLE_PLACE') or {}
            sg, sp = sum(pg.values()), sum(pp.values())
            if sg <= 0 or sp <= 0: continue
            ps = [p for p in r['parts'] if p.get('c') and p['c'] > 1]
            if len(ps) < 8: continue
            T = avant(r['date'])
            if not T: continue
            nch, njk = len(T.get('chevaux', {})) or 1, len(T.get('jockeys', {})) or 1
            for p in ps:
                n = str(p['n'])
                if n not in pg or n not in pp or pp[n] <= 0: continue
                nom = (p.get('nom') or '').upper().strip()
                jk = (p.get('jk') or '').upper().strip()
                dt = detail.get((r['date'], r['c'], n), {})
                ch = T.get('chevaux', {}).get(nom)
                jo = T.get('jockeys', {}).get(jk) or T.get('jockeys_fam', {}).get(nomfam(jk))
                crav = jk in T.get('cravache_or', {}) or nomfam(jk) in T.get('cravache_or_fam', {})
                B.append({
                    'ratio': (pg[n] / sg) / (pp[n] / sp), 'c': p['c'], 'pl': d3.get(n, 0.0),
                    'ch_pct': (1 - (ch['rang'] - 1) / nch) * 100 if ch else None,
                    'jk_pct': (1 - (jo['rang'] - 1) / njk) * 100 if jo else None,
                    'cravache': crav,
                    'el': dt.get('el', '') in T.get('eleveurs', {}) if dt.get('el') else False,
                    'pr': dt.get('pr', '') in T.get('proprietaires', {}) if dt.get('pr') else False})
    return B

def st(S):
    n = len(S)
    if n < 150: return None
    g = [x['pl'] for x in S]; mu = sum(g) / n
    se = (sum((y - mu) ** 2 for y in g) / n) ** 0.5 / math.sqrt(n)
    return n, (mu - 1) * 100, se * 100

if __name__ == '__main__':
    B = charge()
    U = [x for x in B if x['ratio'] >= 1.15]
    print(f"\n{len(B)} chevaux (avril → sept. 2026), dont {len(U)} à ratio >= 1,15\n")
    r = st(B); u = st(U)
    if r: print(f"{'tout l univers':>34}{r[0]:>8}{r[1]:>9.1f}%{r[2]:>7.1f}")
    if u: print(f"{'ratio >= 1,15 (référence)':>34}{u[0]:>8}{u[1]:>9.1f}%{u[2]:>7.1f}")
    print(f"\n{'critère ajouté dans l univers ratio >= 1,15':>34}{'chevaux':>8}{'ROI':>9}{'± SE':>7}{'écart':>8}")
    print('-' * 68)
    if not u: raise SystemExit("univers trop mince")
    TESTS = [
        ('cheval classé FG', lambda x: x['ch_pct'] is not None),
        ('cheval top 25% FG', lambda x: (x['ch_pct'] or 0) >= 75),
        ('cheval hors top 50% FG', lambda x: x['ch_pct'] is not None and x['ch_pct'] < 50),
        ('jockey classé FG', lambda x: x['jk_pct'] is not None),
        ('jockey top 25% FG', lambda x: (x['jk_pct'] or 0) >= 75),
        ('jockey Cravache d or', lambda x: x['cravache']),
        ('éleveur classé', lambda x: x['el']),
        ('propriétaire classé', lambda x: x['pr']),
    ]
    for lab, f in TESTS:
        s = st([x for x in U if f(x)])
        if not s: print(f"{lab:>34}{'—':>8}   effectif insuffisant"); continue
        ec = s[1] - u[1]; sig = ' ←' if abs(ec) > 2 * math.sqrt(s[2] ** 2 + u[2] ** 2) else ''
        print(f"{lab:>34}{s[0]:>8}{s[1]:>9.1f}%{s[2]:>7.1f}{ec:>+8.1f}{sig}")
    print("\n  ← = écart supérieur à 2 erreurs-types. Sans marqueur, rien n'est établi —")
    print("  et vu la puissance annoncée, cela ne prouve pas qu'il n'y a rien.")
