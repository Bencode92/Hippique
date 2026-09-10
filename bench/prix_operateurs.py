#!/usr/bin/env python3
"""
Écart de prix entre opérateurs — le seul levier non mesuré du dossier.

    python3 bench/prix_operateurs.py

Se nourrit de data/prix.csv, rempli à la main avant chaque mise. Trois nombres
par pari : la cote PMU, la cote ZEturf, la meilleure cote fixe. Rien d'autre.

POURQUOI ÇA VAUT LE DÉTOUR. Jouer le favori à Longchamp et Saint-Cloud rend
+0,7 % sur 1 853 courses — l'équilibre. Sur un pari à l'équilibre, deux à trois
points de meilleur prix suffisent à faire passer l'espérance au-dessus de zéro.
Aucun modèle, aucune prédiction : le même cheval, à un prix différent.

POURQUOI À LA MAIN. ZEturf ferme l'accès automatisé — l'API réclame un en-tête
non documenté et le site renvoie 404 sur toute requête programmatique. Et il
n'existe aucun historique public de ses rapports. La collecte manuelle n'est pas
un pis-aller, c'est la seule voie.

COMBIEN D'OBSERVATIONS. Le script calcule lui-même à partir de quel effectif
l'écart devient significatif, en fonction de sa dispersion. En pratique, si
l'écart moyen est de 5 % avec un écart-type de 4 %, une trentaine de lignes
suffisent ; s'il est de 1 %, il en faudra des centaines — et ce sera la réponse.
"""
import csv, math, os, sys

CHEMIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'prix.csv')

def charge():
    lignes = []
    with open(CHEMIN, encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            if 'EFFACER' in (r.get('cheval') or '').upper(): continue
            try:
                pmu = float(r['cote_pmu'])
                if pmu <= 1: continue
            except (ValueError, KeyError, TypeError):
                continue
            def f(c):
                try:
                    v = float(r.get(c) or 0); return v if v > 1 else None
                except ValueError:
                    return None
            lignes.append({'pmu': pmu, 'zeturf': f('cote_zeturf'), 'fixe': f('cote_fixe'),
                           'cheval': r.get('cheval', ''), 'date': r.get('date', ''),
                           'gagnant': (r.get('resultat') or '').strip() in ('1', 'gagnant', 'G')})
    return lignes

def stat(v):
    n = len(v)
    if not n: return None
    mu = sum(v) / n
    sd = (sum((x - mu) ** 2 for x in v) / n) ** 0.5 if n > 1 else 0
    return n, mu, sd, sd / math.sqrt(n) if n else 0

if __name__ == '__main__':
    L = charge()
    if len(L) < 5:
        print(f"\n{len(L)} ligne(s) dans data/prix.csv — il en faut au moins 5.\n")
        print("Colonnes : date, hippodrome, course, cheval, cote_pmu, cote_zeturf,")
        print("           cote_fixe, operateur_fixe, mise, resultat")
        print("\nRemplis `resultat` avec 1 si le cheval a gagné, vide sinon.\n")
        sys.exit()
    print(f"\n{len(L)} paris relevés\n")
    for nom, cle in (('ZEturf', 'zeturf'), ('cote fixe', 'fixe')):
        e = [(x[cle] - x['pmu']) / x['pmu'] * 100 for x in L if x[cle]]
        s = stat(e)
        if not s: print(f"{nom:>12} : aucune cote relevée"); continue
        n, mu, sd, se = s
        mieux = sum(1 for x in e if x > 0) / n * 100
        print(f"{nom:>12} : écart moyen {mu:+.2f} % ± {se:.2f}   meilleur que le PMU {mieux:.0f}% du temps   ({n} relevés)")
        if sd > 0:
            besoin = math.ceil((1.96 * sd / max(abs(mu), 0.5)) ** 2)
            print(f"{'':>12}   {'significatif' if abs(mu) > 1.96 * se else f'il faut ~{besoin} relevés pour trancher'}")
    # ROI comparé, si les résultats sont renseignés
    res = [x for x in L if x.get('gagnant') is not None and (x['zeturf'] or x['fixe'])]
    joues = [x for x in L if (x.get('resultat') if isinstance(x, dict) else None) is not None]
    g = [x for x in L if x['gagnant']]
    if g:
        pmu = sum(x['pmu'] for x in g) / len(L) - 1
        best = sum(max(x['pmu'], x['zeturf'] or 0, x['fixe'] or 0) for x in g) / len(L) - 1
        print(f"\n{'ROI au PMU':>26} : {pmu*100:+.1f} %")
        print(f"{'ROI au meilleur prix':>26} : {best*100:+.1f} %   (gain {(best-pmu)*100:+.1f} points)")
    else:
        print("\n  Aucun résultat renseigné : remplis la colonne `resultat` pour comparer les ROI.")
