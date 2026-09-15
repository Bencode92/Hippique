# Pré-spécification — grands champs à Longchamp et Saint-Cloud

Écrite le **11 septembre 2026**. Aucun paramètre ne sera modifié après coup.

## Ce qui a été observé

Sur `data/histo`, 2022 → septembre 2026, favori au simple gagnant, dividende
réel avec plancher PMU :

| Longchamp + Saint-Cloud | ROI | n |
|---|---|---|
| **14 partants et plus** | **+7,5 % ± 7,2** | 743 |
| moins de 14 partants | −8,9 % ± 3,4 | 1 581 |
| ensemble | −3,7 % ± 3,3 | 2 324 |

Écart grand champ / reste : **+16,4 ± 7,9** (t = 2,08). Positif **cinq années
sur cinq** : +12,4 / +18,3 / +0,5 / +4,0 / +0,6.

## Ce qu'il ne faut PAS en conclure

**Le ROI positif n'est pas démontré.** +7,5 % ± 7,2 donne un intervalle de
[−6,6 ; +21,6] : il contient zéro. Ce qui est démontré, c'est l'ÉCART entre
grands champs et petits champs sur ce terrain — pas que les grands champs
rapportent.

**La découpe a été trouvée après une longue exploration** du 11/09/2026 :
fiabilité des données → taille de champ → croisement avec l'hippodrome. Des
dizaines de coupes ont été essayées ce jour-là. À ce compte, un écart à
t = 2,08 est attendu.

**L'effet décroît** : +10,4 % ± 9,3 sur 2022-2024, +2,8 % ± 11,2 sur 2025-2026.

**Hors premium, l'effet n'existe pas** : les grands champs y rendent −11,9 %,
et sur l'ensemble des sept hippodromes premium −5,7 % ± 3,7, positifs une seule
année sur cinq. L'effet est donc propre à tes deux hippodromes, ce qui le rend
moins crédible, pas plus : il n'a aucun mécanisme, comme l'effet hippodrome
lui-même.

## Affinage du 11/09/2026, même jour

Dans les grands champs, tout tient aux courses **ouvertes** :

| simple gagnant, 14 partants et plus | ROI | n |
|---|---|---|
| **favori à 4 ou plus** | **+14,0 % ± 9,2** | 523 |
| favori entre 2,5 et 4 | −7,1 % ± 10,4 | 209 |

Positif cinq années sur cinq — +14,9 / +21,0 / +6,3 / +21,1 / +1,2 — et
répliqué sur deux moitiés indépendantes de l'historique : +14,1 % puis +13,9 %.
À 20 € la mise : **+1 462 € sur quatre ans et demi, soit 116 courses et +325 €
par an.**

Le croisement complet (3 tailles de champ × 3 ouvertures × 4 instruments) a par
ailleurs montré que le choix d'instrument se réplique : le même gagne dans
5 cases sur 7 entre les deux périodes, là où le hasard en donnerait 1,8.

## La règle, figée

| | |
|---|---|
| univers | plat, ParisLongchamp ou Saint-Cloud |
| filtre 1 | **14 partants ou plus** au départ |
| filtre 2 | **cote du favori ≥ 4** |
| pari | simple gagnant sur le favori du marché, mise plate |
| référence | mêmes hippodromes, grands champs, favori sous 4 |

## Le critère, écrit d'avance

Période de test : **1er octobre 2026 → 30 septembre 2027**, jamais examinée.

- **Confirmé** si le ROI de la règle est positif ET si son écart à la référence
  dépasse 1,96 erreur-type sur cette seule période.
- **Rejeté** sinon. Un seul run. Ni le seuil de 14, ni la liste des
  hippodromes, ni la durée ne seront ajustés après coup.

À ~116 courses par an répondant aux deux filtres, l'erreur-type attendue est
de ±20 points sur douze mois. **Le test sera donc peu concluant en un an**, et
c'est une raison de plus de ne pas augmenter la mise avant.

L'intervalle du +14,0 % va de −4,0 à +32,0 : il contient encore zéro. C'est la
meilleure case des trente-six mesurées, pas un gain garanti — et « meilleure de
trente-six » est précisément ce qui appelle la prudence.

## Ce que ça change à la pratique, aujourd'hui

Rien. La règle de jeu reste celle du dossier. Si tu veux jouer cette piste,
c'est avec une bankroll séparée et la conscience qu'elle n'est pas démontrée.

## Amendement du 15 septembre 2026 — avant le premier pari

Le critère ci-dessus (« écart à la référence > 1,96 erreur-type sur douze
mois ») condamne la règle d'avance : avec ± 20 points sur 165 paris, il faut
un ROI d'environ +36 % pour confirmer, et une règle **vraie** à +7 % serait
rejetée le 30 septembre 2027 dans plus de 90 % des cas. Le test séquentiel
(`bench/sprt_regle.mjs`, H0 = −3,7 %, H1 = +7 %, bornes ± 2,94) existe
précisément pour ne pas dépendre d'une date.

Le verdict est donc **le franchissement d'une borne du SPRT**, quelle que
soit la date :
- borne haute franchie → confirmé ;
- borne basse franchie → rejeté ;
- ni l'une ni l'autre au 30 septembre 2027 → **point d'étape**, pas un
  verdict : le test continue, la mise ne change pas.

Ce qui ne change pas : la règle (14 partants et plus, ParisLongchamp ou
Saint-Cloud, favori, simple gagnant, mise plate), la référence, les
sous-hypothèses observées (favori ≥ 4, dérive), et l'interdiction de tout
ajustement après coup. Le seul chiffre modifié est le critère de lecture,
et il l'est avant que la première course soit jouée.

Les sous-hypothèses observées ne seront pas lisibles en un an non plus : la
différence entre « favori dont la cote a baissé » et « a monté » sur ~165
paris a une erreur-type d'environ 28 points. Effectif requis pour un écart
de 20 points à deux erreurs-types : ~600 paris, soit quatre saisons.

## Amendement 2 du 15 septembre 2026 — l'instant de la mise, et ce que le test peut dire

**Le pari est défini par son instant.** En pari mutuel le dividende est celui
de la clôture quel que soit le moment de la mise ; le seul aléa est *quel
cheval* est favori quand on mise. La mesure fondatrice porte sur le favori de
la clôture ; le pari réel porte sur le favori à T-2. Pour que le test mesure
un pari reproductible :

- le pari est le relevé le plus proche de T-2:00 dans la fenêtre
  **[T-2:40 ; T-1:20]** (`bench/sprt_regle.mjs`, `data/cotes_live`) ;
- hors fenêtre : **pas de pari, course exclue du test** — jamais de repli sur
  la clôture, qui mélangerait deux distributions ;
- le journal enregistre le taux de bascule (favori à T-2 ≠ favori à la
  clôture) ; il sera lu après une saison de relevés.

**Ce que le test peut dire** (`bench/sprt_simul.py`, 20 000 tirages, cotes
réelles des 742 paris historiques de la règle, favori médian à 4,6) :

| vraie espérance | P(H1) à 6 ans | P(H0) | sans verdict à 6 ans | verdict en 1 an | année 1 : moyenne ± sd | drawdown 4 ans médian |
|---|---|---|---|---|---|---|
| −3,7 % | 0,02 | 0,37 | 0,61 | 0 % | −125 € ± 485 | 1 306 € |
| +2 % | 0,13 | 0,10 | 0,77 | 0 % | +67 € ± 493 | 986 € |
| +7 % | 0,38 | 0,02 | 0,60 | 0 % | +233 € ± 501 | 805 € |
| +10 % | 0,58 | 0,01 | 0,42 | 0 % | +338 € ± 507 | 724 € |

σ d'un pari de la règle ≈ 1,7 unité : l'incrément moyen de vraisemblance est
de quelques millièmes par pari. **Aucun verdict n'est possible en un an**,
quelle que soit la vérité ; même à +7 %, six saisons ne concluent H1 que
quatre fois sur dix ; une saison perdante a une chance sur trois d'arriver
même si la règle est vraie ; un drawdown de 800 € sur quatre saisons est
médian. Le test est un **garde-fou de discipline** — il interdit de lire entre
les bornes et d'ajuster — pas une machine à verdict. Le 30 septembre 2027 sera
presque sûrement sans verdict ; c'est écrit ici pour ne pas céder à la
tentation de lire la statistique.

**Espérance rétrécie.** La règle est le produit d'une recherche hippodrome ×
champ × favori ; « positif cinq années sur cinq » est vu après coup. Avec le
prior — favoris nationaux à −13,7 %, calibration monotone, aucun mécanisme —
un rétrécissement vers la pratique parente (−3,7 %) donne une espérance
plausible de **+1 à +2 %**, pas +7,4. Le +7,4 % reste l'espérance de travail
du test (H1) ; il ne doit pas être lu comme une prévision.

**Retiré :** « avril → septembre 2026 hors échantillon : +5,4 % sur 95
courses ». La règle a été figée le 11/09 sur des données allant jusqu'au
08/09 ; 2026 fait partie de la mesure fondatrice. Ce n'était pas hors
échantillon, et à 95 courses l'erreur-type est d'environ ± 12.
