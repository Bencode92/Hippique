# Briefing — Système Prédictif Hippique
## Pour nouvelle session Claude Code — Avril 2026

---

## PROMPT À COLLER EN DÉBUT DE SESSION

```
Tu as accès à mon repo https://github.com/Bencode92/Hippique

C'est un système de prédiction hippique pour les courses de galop françaises.
Lis docs/BRIEFING_NOUVELLE_SESSION.md pour comprendre l'état actuel du projet,
ce qui a été fait, ce qui fonctionne, et les prochaines étapes.

Le site est live sur GitHub Pages. Le pipeline est automatique.
Je vais principalement aux courses à SAINT-CLOUD et LONGCHAMP.
Mon objectif : trouver des biais exploitables par type de course (distance,
peloton, hippodrome) pour battre le favori marché sur des segments ciblés.
```

---

## 1. OBJECTIF DU PROJET

### Focus : grandes courses françaises (Saint-Cloud, Longchamp)

On ne cherche PAS à battre le marché sur TOUTES les courses. On cherche des **biais exploitables** sur des segments spécifiques :
- Par **distance** (sprint vs mile vs middle vs staying)
- Par **hippodrome** (Saint-Cloud a ses propres patterns)
- Par **taille de peloton** (petit vs grand champ)
- Par **type de course** (Groupe, Handicap, Claimer)

### Pourquoi c'est possible

Les paris hippiques sont un marché **imparfait** :
- Le favori marché ne gagne que ~32% du temps
- Sur certains segments, nos critères fondamentaux **battent déjà le favori** :
  - Saint-Cloud 1400-1700m : **Valeur FG = 60% top1** vs favori 30%
  - Le Bouscat 1400-1700m : **Valeur FG = 57%** vs favori 29%
  - Global récent (31 courses) : **35% vs 32%** (+3 pts)

### Ce qui a été prouvé par backtest

Le marché est faible quand :
1. La **valeur FG** (rating officiel) contredit la cote → le handicapeur sait mieux
2. La **musique** montre un cheval en forme que le marché sous-cote (ex: ZASTER cote 20, venait de gagner)
3. En **sprint**, le jockey fait la différence et le marché ne le pondère pas assez

---

## 2. SCORING ADAPTATIF — Comment ça fonctionne

### Formules par distance (backtestées sur 446 courses françaises)

```
SPRINT (1000-1400m) :
  Score = Musique × 0.4 + Cote × 0.4 + Valeur FG × 0.2
  Pourquoi : la musique détecte les surprises, le jockey compte en sprint
  Backtest : bat le favori sur sprints provinciaux

MILE (1400-1700m) :
  Score = Valeur FG × 0.5 + Cote × 0.3 + Musique × 0.2
  Pourquoi : la valeur FG domine à Saint-Cloud (60% top1 vs 30% favori)
  C'est notre meilleur segment

MIDDLE (1800-2100m) :
  Score = Cote × 0.5 + Valeur FG × 0.3 + IndivV × 0.2
  Pourquoi : la cote est plus fiable sur cette distance (78% à Borely)
  IndivV = taux victoire individuel PMU du cheval

STAYING (2200m+) :
  Score = Cote × 0.4 + Valeur FG × 0.3 + Musique × 0.3
  Pourquoi : mix équilibré, la corde comptait en backtest mais leakage possible
```

### Ajustements
- **Petit champ (<9)** : +Valeur FG × 0.15 (la qualité pure domine)
- **Grand champ (14+)** : +ChTauxV 2025 × 0.3 (historique annuel aide)
- **Normalisation** : scores ramenés à 10-90 par course (meilleur=90, pire=10)

### Données combinées 2025 + 2026
Le scoring cherche chaque cheval/jockey dans les **deux classements** (2025 et 2026) et prend le meilleur score. Matching actuel : ~9 207 chevaux uniques.

---

## 3. RÉSULTATS DÉTAILLÉS PAR HIPPODROME

### Saint-Cloud (21 courses plat analysées)

| Distance | Critère #1 | Top1% | Favori | Bat ? |
|----------|-----------|-------|--------|-------|
| 1400-1700m | **Valeur FG** | **60%** | 30% | **✅ +30 pts** |
| 1800-2100m | IndivV | 50% | 33% | ✅ +17 pts |
| 2200m+ | Cote | 50% | 50% | = |

**Saint-Cloud est notre meilleur terrain.** La valeur FG (rating handicapeur) bat massivement le favori sur les courses de mile.

### Le Bouscat (9 courses plat analysées)

| Distance | Critère #1 | Top1% | Favori | Bat ? |
|----------|-----------|-------|--------|-------|
| 1400-1700m | **Valeur FG** | **57%** | 29% | **✅ +28 pts** |
| 1000m | IndivV | 100% (1c) | 0% | ✅ |

**Analyse course par course Le Bouscat (11 avril) :**
- ZASTER FOR ALL gagne à cote **20** → notre modèle le détectait en **#2 par musique** (venait de gagner)
- PITCH PERFECT (cote 4.7) gagne → détectable par **valeur FG + indivV 40%**
- FLEUR DE SEL (cote 3.0) → notre #1 = **✅ correct**
- Courses arabes (Kriss II, Al Sakbe) : matching faible, résultats moyens

### Analyse globale par distance (446 courses)

| Distance | Meilleur critère | Top1% | Favori | Bat ? |
|----------|-----------------|-------|--------|-------|
| Sprint | gainPC/indivV* | 64-81% | 17% | ✅ (*leakage probable) |
| Mile | gainPC/indivV* | 73-76% | 26% | ✅ (*leakage probable) |
| Middle | indivV* | 84% | 34% | ✅ (*leakage probable) |
| Staying | indivV* | 88% | 29% | ✅ (*leakage probable) |

*Les critères indivV/gainPC ont du leakage potentiel (stats PMU incluent 2026). Les critères fiables sans leakage : **valeur FG, cote, musique, classements 2025**.

---

## 4. DONNÉES DISPONIBLES

### Sources

| Source | Données | Volume |
|--------|---------|--------|
| CSV France Galop 2025 | Chevaux, jockeys, entraîneurs, éleveurs, propriétaires, cravache d'or | 8 358 + 515 + 971 + 2 150 + 2 200 + 493 |
| CSV France Galop 2026 | Idem | 4 386 + 268 + 657 + 2 916 + 3 802 + 241 |
| API PMU (2×/jour) | Courses + participants + cotes + arrivées + terrain | 730+ courses, 453 fichiers |
| Stats dérivées | Distance, forme, combos, stable form, intervalle | Calculées automatiquement |

### 129 critères inventoriés — 5 dans le scoring

**DANS le scoring :**
1. Cote PMU (30-50% selon distance)
2. Valeur France Galop (20-50% selon distance)
3. Musique = score pondéré des 5 dernières positions (20-40%)
4. IndivV = taux victoire individuel PMU (20% en middle)
5. Corde (via ajustement peloton staying)

**AFFICHÉ dans le tooltip (info pour l'utilisateur) :**
- Rang cheval 2025+2026 + taux victoire + source (2025/2026/les deux)
- Rang jockey 2025+2026 + Cravache d'or
- Combo jockey × entraîneur (1 215 duos analysés)
- Forme récente (score 0-100 + tendance ▲▲/▼▼ + 5 dernières positions)
- Spé distance (taux victoire à cette distance)
- Stable form (forme écurie 30 jours)
- Intervalle depuis dernière course
- Valeur FG, musique score

**SCRAPÉ mais pas encore exploité :**
- Terrain/pénétromètre (depuis 11/04) → exploitable dans 2 semaines
- Cote ouverture vs cote finale (les deux stockées)
- Avis entraîneur (POSITIF/NEGATIF)

**PAS exploité :**
- Pedigree (père × mère) — trop complexe
- Équipement (oeillères) — signal inconnu
- Jockey × hippodrome — à construire
- Classe de course (Groupe/Listed/Handicap) — à extraire via allocation
- Speed figures — données payantes

---

## 5. BACKTESTING — Méthodologie et résultats

### Walk-forward strict (zero leakage)
- Classements 2025 (année fermée) → prédictions courses 2026
- Validation jan-fév (349 courses) → Holdout mars+ (381 courses)
- Pas de features calculées sur les données qu'on prédit

| Test | Notre modèle | Favori marché | Hasard |
|------|-------------|---------------|--------|
| Walk-forward global | 25.6% | 33.9% | 9.1% |
| Réunions récentes (31c) | **35%** | **32%** | 9% |

### Test résidus marché (fait avec OpenAI)
- Corrélation modèle-résidus = -0.03 → globalement le modèle est redondant avec le marché
- Alpha optimal stacking = 0% → le modèle seul ne bat pas le favori globalement
- **MAIS par segment** (Saint-Cloud mile, sprint provincial) → signal exploitable

### Grid search exhaustif
- 2 232 configs testées sur le grid search principal
- 210 configs testées avec critères 2025 uniquement
- 584 configs testées par type de course
- Résultat : les formules actuelles par distance sont optimales pour nos données

### Ce qu'on a appris des backtests
1. **Plus simple = mieux** — 5 critères battent 13 couches
2. **La valeur FG est sous-utilisée par le marché** sur les courses de mile
3. **La musique détecte les surprises** (chevaux en forme non cotés)
4. **Le terrain sera probablement le prochain game changer** (pas encore assez de data)
5. **Le matching (% de chevaux trouvés)** est le facteur limitant principal

---

## 6. ARCHITECTURE TECHNIQUE

### Pipeline automatique
```
CSV France Galop push → data/raw_csv/*.csv
  ↓ Auto (workflow)
convert_csv_rankings.py → data/*.json
  ↓ Auto (workflow)
extract-pondered-rankings.js → data/*_ponderated_latest.json
build-distance-stats.js → data/*_distance_stats.json
build-recent-form.js → data/*_forme_recente.json
build-combo-stats.js → data/combo_jockey_entraineur.json
build-stable-form.js → data/stable_form.json + data/intervalle_courses.json
  ↓ Auto (workflow)
claude-matcher.js → data/claude_correspondances.json

Scraper courses 2×/jour :
  10h UTC → cotes ouverture + programme
  20h UTC → cotes finales + arrivées + terrain

Backtest quotidien 22h UTC :
  mega-optimize-clean.js → data/backtest/clean_optimization.json
```

### Fichiers clés
```
js/ranking-loader.js          — Le cerveau : scoring adaptatif par distance
                                 Lignes 2608-2700 : formules
                                 Lignes 2565-2605 : matching 2025+2026
                                 Lignes 2749-2800 : normalisation par course

index.html                    — Frontend
                                 Ligne 1231 : chargement ranking-loader.js
                                 Lignes 1676-1730 : bandeau résumé réunion
                                 Lignes 2060-2100 : tooltip détaillé
                                 Lignes 2099-2135 : stats course par course

scraper_courses_pmu.py        — Scraper API PMU
                                 Lignes 156-223 : mapping participant
                                 Lignes 317-340 : terrain + arrivées
                                 Base URL : https://online.turfinfo.api.pmu.fr/rest/client/61

convert_csv_rankings.py       — CSV France Galop → JSON
extract-pondered-rankings.js  — Rankings pondérés (tauxV, tauxP, gainMoyen, nbV)
build-distance-stats.js       — Stats par distance (sprint/mile/middle/staying)
build-recent-form.js          — Forme récente (decay 30j)
build-combo-stats.js          — Combos jockey × entraîneur
build-stable-form.js          — Forme stable écurie + intervalle courses
claude-matcher.js             — Résolution noms via Claude API (proxy Cloudflare)
mega-optimize-clean.js        — Walk-forward strict backtest
backtest-par-type.js          — Grid search par segment
```

### Workflows GitHub Actions
| Workflow | Déclenchement | Statut |
|----------|---------------|--------|
| Convert Rankings CSV to JSON | Auto sur push data/raw_csv/*.csv | ✅ |
| Pipeline Complet | Auto après conversion | ✅ |
| Extraction des courses | 2×/jour (10h + 20h UTC) | ✅ |
| Backtest quotidien | 22h UTC | ✅ |
| Claude Matcher | Auto après pipeline | ✅ |

### Proxy Cloudflare (pour Claude API)
URL : `https://studyforge-proxy.benoit-comas.workers.dev`
Utilisé par claude-matcher.js pour résoudre les noms non matchés via Claude.

---

## 7. BIAIS EXPLOITABLES IDENTIFIÉS

### Biais #1 : Valeur FG sous-pondérée par le marché (CONFIRMÉ)
- **Où** : Saint-Cloud 1400-1700m, Le Bouscat 1400-1700m, Argentan 2200m+
- **Quoi** : Le rating officiel des handicapeurs (valeur FG) prédit mieux que la cote
- **Pourquoi** : Les parieurs suivent les cotes/favoris mais ignorent la valeur technique
- **Impact** : +28 à +30 pts au-dessus du favori sur ces segments

### Biais #2 : Musique en sprint (À CONFIRMER)
- **Où** : Courses 1000-1400m, particulièrement en province
- **Quoi** : Un cheval qui vient de gagner (musique commence par 1) est sous-coté
- **Pourquoi** : Les cotes reflètent le palmarès global, pas la forme immédiate
- **Impact** : ZASTER (cote 20) détecté en #2 par musique au Bouscat

### Biais #3 : Cote fiable en staying (CONFIRMÉ)
- **Où** : Courses 2200m+, grands hippodromes
- **Quoi** : Le favori marché est plus fiable sur longue distance (50% top1)
- **Pourquoi** : Moins de variance, les meilleurs chevaux dominent
- **Impact** : = favori, pas d'edge mais fiable pour le top2

### Biais #4 : Terrain (À EXPLORER)
- **Où** : Partout, mais surtout plat français
- **Quoi** : Certains chevaux excellent sur terrain lourd/souple et s'effondrent sur bon
- **Pourquoi** : Morphologie, action, préférence de surface
- **Impact estimé** : +5 à +10 pts (estimation expert, pas encore testé)
- **Data** : Scrapé depuis le 11/04, exploitable dans 2 semaines

### Biais #5 : Jockey × hippodrome (À CONSTRUIRE)
- **Où** : Hippodromes spécifiques (Saint-Cloud, Longchamp, Chantilly)
- **Quoi** : Certains jockeys dominent certaines pistes
- **Impact estimé** : +2 à +3 pts

---

## 8. PROCHAINES ÉTAPES

### Court terme (cette semaine)
- [ ] Vérifier scraping terrain quotidien
- [ ] Mettre à jour CSV 2026 régulièrement (pour le matching)
- [ ] Analyser les réunions terminées pour valider les formules

### Moyen terme (2-4 semaines)
- [ ] Feature `cheval × terrain` quand 200+ courses avec terrain
- [ ] Classe de course (Groupe/Handicap via allocation dans les données PMU)
- [ ] Jockey × hippodrome (stats croisées)
- [ ] Re-backtester avec les nouvelles données + terrain

### Long terme (3-6 mois)
- [ ] Accumuler 2000+ courses pour conclusions robustes
- [ ] Value betting ciblé sur les segments où on bat le favori
- [ ] Speed figures DIY (temps normalisé)

---

## 9. AVERTISSEMENTS IMPORTANTS

### Leakage
- **indivV/gainPC** (stats PMU du participant) : leakage probable car les stats incluent les résultats 2026 → ne PAS utiliser pour backtester honnêtement, OK pour le scoring live
- **Classements 2026** : snapshot actuel → leakage pour backtester sur 2026, OK combiné avec 2025 pour le scoring live
- **Classements 2025** : année fermée → ZERO leakage pour prédire 2026

### Ce qui ne marche PAS
- Entraîneur, éleveur, propriétaire dans le scoring → signal nul en backtest
- Forme récente dans le scoring → dégrade le holdout (-15 pts)
- Stable form dans le scoring → pas de signal
- Intervalle courses dans le scoring → pas de signal
- 13 couches de scoring → overfitting, 5 critères battent 13

### Le marché est efficient GLOBALEMENT
- Le favori marché gagne ~32% des courses
- Notre modèle global fait ~25-35% selon la période
- L'edge n'est PAS global, il est **par segment** (Saint-Cloud mile, sprint provincial)
