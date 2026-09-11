# Pré-spécification — dérive sur les outsiders

Écrit le **11 septembre 2026**, avant toute observation des données postérieures
au 10 septembre 2026. Aucun paramètre ci-dessous ne sera modifié après coup.

## D'où vient l'hypothèse

Exploration du 11/09/2026 (`bench/outsiders_gagnants.mjs`) sur les partants
**hors du top 2 du marché**, avril → septembre 2026, classements point-in-time
issus des dix snapshots de `data/rankings/`.

Ce sous-univers compte 28 627 partants, gagne 6,1 % du temps et rend **−19,8 %**.
Le décile de plus forte dérive de cote y gagne 10,5 % du temps (+4,3 pt, écart
solide) mais son ROI ne suit qu'en partie : **−11,2 % en avril-juin, −0,9 % en
juillet-septembre**. Segmenté, le champ de 9 à 13 partants ressort à −7,2 % puis
**+12,6 %**.

**Ce n'est pas un résultat.** Quatorze leviers ont été testés, puis neuf segments
sur le levier retenu — soit plus de vingt essais. À ce nombre, un segment à
+12,6 % ± 14 est attendu par le seul hasard. Le train n'est d'ailleurs pas
positif.

## La règle, figée

| | |
|---|---|
| univers | plat FR, courses courues, 5 partants et plus |
| filtre 1 | le cheval est classé **3e ou au-delà** par la cote |
| filtre 2 | la course compte **9 à 13 partants** |
| filtre 3 | le cheval est dans le **décile supérieur de dérive** de sa course, dérive = (cote de référence − cote) / cote de référence |
| pari | simple gagnant, mise plate |
| référence | tous les partants hors top 2 du même univers |

## Le critère, écrit d'avance

Période de test : **1er octobre 2026 → 31 mars 2027**, jamais examinée à ce jour.

- **Confirmé** si le ROI de la règle dépasse celui de la référence d'un écart
  supérieur à 1,96 erreur-type, ET si le ROI de la règle est lui-même positif.
- **Rejeté** dans tous les autres cas.
- Un seul run. Ni le seuil du décile, ni les bornes 9-13, ni la période ne
  seront ajustés après coup. Si le résultat déçoit, l'hypothèse est abandonnée,
  pas re-réglée.

## Ce qu'il faut savoir avant d'y croire

La dérive a déjà été réfutée deux fois sur d'autres univers : en logit
conditionnel (poids appris 0,033, aucune amélioration hors échantillon) et sur
le couplé par dérive (t = 0,70). Elle n'est testée ici que dans un sous-univers
beaucoup plus étroit, où le marché est le moins précis.

Et même confirmée, cette règle ne concernerait pas la pratique courante : elle
porte sur des chevaux à cote médiane 10, hors du top 2 du marché, quand le
dossier joue le favori.
