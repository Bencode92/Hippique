# Système de Prédiction Hippique — Documentation Expert

## Vue d'ensemble

Système de scoring prédictif pour les courses hippiques françaises (galop), basé sur 13 couches d'analyse combinant données France Galop, API PMU, et intelligence artificielle.

**Performance backtestée** : 56.1% de victoires prédites (#1) et 90% de top 3 trouvés sur 529 courses.

---

## Sources de données

| Source | Données | Fréquence |
|--------|---------|-----------|
| France Galop (CSV) | Classements 2025+2026 : chevaux, jockeys, entraîneurs, éleveurs, propriétaires, Cravache d'or | Manuelle (push CSV → pipeline auto) |
| API PMU Turfinfo | Courses du jour : participants, positions, distances, musique, gains, poids, corde, pedigree | Quotidienne automatique |
| Historique courses | 439+ fichiers de courses (nov 2025 — avr 2026) | Cumulatif |

### Volumes de données actuels

| Catégorie | 2026 | 2025 (historique) |
|-----------|------|-------------------|
| Chevaux | 3 750 | 9 100 |
| Jockeys | 266 | 515 |
| Entraîneurs | 655 | 971 |
| Éleveurs | 2 150 | 2 150 |
| Propriétaires | 1 550 | 2 200 |
| Cravache d'or | 239 | 493 |

---

## Les 13 couches de scoring

### Couche 1 — Rang percentile 2026 (score de base)

Chaque acteur (cheval, jockey, entraîneur, éleveur, propriétaire) est classé selon 4 critères pondérés :
- **40%** Nombre de victoires
- **25%** Taux de victoire (victoires / courses)
- **15%** Taux de placement (top 3 / courses)
- **20%** Gain moyen par course (indicateur du niveau des courses disputées)

Le rang est converti en score 0-100 par percentile :
```
Score = 100 × (1 - (rang - 1) / population)
Exemple : rang #200 sur 3750 chevaux = 94.7/100 (top 5%)
```

### Couche 2 — Historique 2025 (±10 points)

Compare le rang 2026 au rang 2025 (année complète = stats fiables). Un acteur confirmé sur 2 ans reçoit un bonus. Poids léger car 2026 prime.

**Logique** : Un entraîneur top 5 en 2025 ET top 10 en 2026 = très fiable → bonus. Un cheval absent en 2025 = pas de données → neutre.

### Couche 3 — Cravache d'or (±15 points)

Bonus proportionnel au rang dans le classement Cravache d'or (élite des jockeys).
```
Top 5 Cravache d'or → +15 pts sur le score jockey
Top 10 → +7 pts
Top 20 → +1 pt
```

### Couche 4 — Combo jockey × entraîneur (±15 points)

**1 215 combos analysés** à partir des courses historiques. Certains duos ont des taux de victoire très supérieurs à la moyenne.

```
Exemples :
FABIEN LEFEBVRE × S. GOUVAZE : 34 courses, 29.4% de victoires → +7.8 pts
MME LORETTE GALLO × M. BOUTIN : 36 courses, 25% de victoires → +6 pts
Duo moyen (~10% victoires) → neutre
Duo faible (<5% victoires) → malus
```

**Justification** : La confiance mutuelle entre jockey et entraîneur est un facteur réel. L'entraîneur donne ses meilleures montes à son jockey de confiance.

### Couche 5 — Forme stable / écurie (±8 points)

Agrège les résultats des **30 derniers jours** par entraîneur. Si l'écurie est en forme (plusieurs victoires récentes), tous les chevaux de l'écurie en bénéficient.

```
489 entraîneurs analysés
Ex : DELZANGLES 3V/8c (37.5%) en 30 jours → +8 pts pour tous ses chevaux
```

**Justification** : La forme d'une écurie reflète la qualité de la préparation générale, l'état des installations, la forme du staff.

### Couche 6 — Intervalle entre courses (±6 points)

Calcule les jours depuis la dernière course de chaque cheval.

| Intervalle | Catégorie | Bonus | Justification |
|------------|-----------|-------|---------------|
| < 7 jours | Très frais | -6 pts | Trop serré, fatigue accumulée |
| 7-14 jours | Frais | -2 pts | Un peu juste pour récupérer |
| **15-25 jours** | **Idéal** | **+4 pts** | **Intervalle optimal, cheval en rythme** |
| 25-45 jours | Repos | +1 pt | Repos normal, acceptable |
| 45-90 jours | Long repos | -3 pts | Manque de compétition |
| > 90 jours | Très long | -6 pts | Rouille, forme inconnue |

### Couche 7 — Stats individuelles du participant (±15 points)

Exploite les données PMU **propres à chaque cheval dans cette course** :

| Stat | Médiane | Calcul | Impact max |
|------|---------|--------|------------|
| Taux de victoire | 8.4% | (nb_victoires / nb_courses - 0.084) × 40 | ±8 pts |
| Taux de placement | 45.7% | (nb_places / nb_courses - 0.457) × 15 | ±4 pts |
| Gain par course | 2 425€ | Seuils : >50K€ = Groupe, <1K€ = petit | ±6 pts |
| Expérience | 13 courses | 30+ = routier, <3 = débutant | ±2 pts |

```
Exemple : 6V/42c (14.3%), 13P (31%), 78K€ gains
→ taux V bonus +2.3, taux P malus -2.2, gains = correct +1, expérience +2
→ Total : +3.1 pts
```

### Couche 8 — Spécialisation distance (±15 points)

Analyse les **taux de victoire par bucket de distance** pour chaque acteur à partir des courses historiques.

| Bucket | Distance |
|--------|----------|
| Sprint | < 1400m |
| Mile | 1400 - 1899m |
| Intermédiaire | 1900 - 2399m |
| Staying | 2400m+ |

```
Exemple : Barzalona
  Mile (1400-1899m) : 10% de victoires (10 courses)
  Staying (2400m+) : 25% de victoires (4 courses)
  Global : 18.2%
  
  → Course 1600m : delta = 10% - 18.2% = -8.2% → malus -4.1 pts
  → Course 2500m : delta = 25% - 18.2% = +6.8% → bonus +3.4 pts
```

**Données** : 8 693 chevaux, 1 663 jockeys, 2 257 entraîneurs avec stats par distance.

### Couche 9 — Forme récente avec decay temporel (±20 points)

Analyse les performances récentes avec un **decay exponentiel** (half-life 30 jours).

```
Dernière course : poids ×1.0
Il y a 1 mois : poids ×0.5
Il y a 2 mois : poids ×0.25
Il y a 3 mois : poids ×0.125
```

Produit un **score de forme 0-100** et une **tendance** :
- `forte_hausse` : 3 dernières courses nettement meilleures que les 3 précédentes → +25 pts
- `hausse` → +12 pts
- `stable` → neutre
- `baisse` → -12 pts
- `forte_baisse` → -25 pts

```
Exemple : PAINT FOR FUN (positions 1-1-1-2) → forme 98.8/100 → +19.5 pts
Exemple : PENRHEAD (positions 14-15-10-10-4) → forme 6/100 → -17.6 pts
```

### Couche 10 — Poids contextuels adaptatifs

Les poids des acteurs varient selon le **contexte de la course** :

**Par distance** (expertise hippique) :
| Distance | Cheval | Jockey | Entraîneur | Logique |
|----------|--------|--------|------------|---------|
| Sprint (<1400m) | **55%** | 15% | 15% | Vitesse brute domine |
| Mile (1400-1900m) | 50% | 20% | 15% | Équilibre |
| Middle (1900-2400m) | 48% | **22%** | 15% | Le jockey gère le timing |
| Staying (2400m+) | 42% | **28%** | 15% | Course stratégique = jockey crucial |

**Par type** :
| Type | Cheval | Jockey | Justification |
|------|--------|--------|---------------|
| Plat | 50% | 18% | Standard |
| Obstacle | 35% | **32%** | Gestion sauts + rythme + placement |
| PSF (tout-temps) | 45% | 20% | Surface spécifique, entraîneur 19% |

**Par taille de peloton** :
| Peloton | Cheval | Jockey | Justification |
|---------|--------|--------|---------------|
| Petit (<9) | **55%** | 15% | Qualité brute domine |
| Moyen (9-14) | 50% | 20% | Standard |
| Grand (14+) | 45% | **25%** | Navigation trafic = tactique |

**Fusion** : Distance 36% + Taille peloton 27% + Position journée 18% + Type 9% + Poids porté 10%

### Couche 11 — Poids porté (±10.8% en staying)

| Écart vs moyenne | Catégorie | Ajustement | × Multiplicateur distance |
|------------------|-----------|------------|---------------------------|
| -2.5kg+ | Léger (avantage) | +6% | Sprint ×0.5, Staying ×1.8 |
| -1 à -2.5kg | Légèrement léger | +3% | |
| ±1kg | Neutre | 0% | |
| +1 à +2.5kg | Légèrement lourd | -3% | |
| +2.5kg+ | Lourd (handicap) | -6% | |

```
Exemple staying : cheval 54kg, moyenne peloton 57.5kg → -3.5kg → heavy_minus
Ajustement : +6% × 1.8 (staying) = +10.8%
```

**Justification** : 1kg = ~1 longueur sur 2400m. La fatigue s'accumule sur la distance.

### Couche 12 — Corde par distance et hippodrome (±8 points sprint)

| Distance | Corde 1 | Corde 6 | Corde 14 | Justification |
|----------|---------|---------|----------|---------------|
| Sprint (<1400m) | **+8 pts** | neutre | **-7 pts** | Course courte, pas de rattrapage |
| Mile (1400-1900m) | +4.8 pts | neutre | -4.2 pts | Un virage pour se replacer |
| Middle (1900-2400m) | +2.4 pts | neutre | -2.1 pts | Modéré |
| Staying (2400m+) | +0.8 pts | neutre | -0.7 pts | Quasi négligeable |

**Configurations spécifiques** :
- **Longchamp** : ±10 pts (virage serré avant la ligne)
- **Chantilly** (ligne droite 1000m) : ±1 pt (pas de virage)
- **Deauville** (piste large) : ±5 pts

### Couche 13 — Claude Matcher (IA)

Utilise Claude (via proxy Cloudflare) pour résoudre les noms non matchés entre les données PMU et France Galop.

```
Entrée : "F.VALLE SKAR" (course PMU)
Claude : → "MME FRIDA VALLE SKAR" (classement France Galop)

Entrée : "WILLIAM BUICK"
Claude : → "ETRANGER" (jockey anglais, pas dans France Galop)
```

**78 étrangers identifiés** (court-circuit = pas de recherche inutile), **11 correspondances françaises** résolues.

---

## Score final

```
Score = Σ (poids_contextuel × score_ajusté) par acteur

Où score_ajusté par acteur =
  rang_percentile_2026
  + bonus_historique_2025
  + bonus_cravache_or (jockey)
  + bonus_combo_jockey_entraineur
  + bonus_forme_stable (entraîneur)
  + bonus_intervalle (cheval)
  + bonus_stats_individuelles (cheval)
  + bonus_specialisation_distance
  + bonus_forme_recente
  + ajustement_poids_porte
  + impact_corde
```

---

## Pipeline automatique

```
CSV France Galop → push GitHub
       ↓ (auto)
Conversion JSON
       ↓ (auto)
Rankings pondérés (4 critères × 12 catégories)
       ↓ (auto)
Stats par distance (8693 chevaux, 1663 jockeys)
       ↓ (auto)
Forme récente (decay 30 jours)
       ↓ (auto)
Combos jockey × entraîneur (1215 duos)
       ↓ (auto)
Forme stable + intervalle courses
       ↓ (auto)
Claude Matcher (résolution IA)
       ↓ (auto, 22h)
Backtest quotidien (prédictions vs résultats)
       ↓ (auto)
Optimisation poids par gradient descent
```

---

## Backtesting — Résultats

| Métrique | Score |
|----------|-------|
| **Notre #1 gagne** | **56.1%** |
| **Notre #1 dans le top 3** | 76.7% |
| **Un de nos top 3 dans le vrai top 3** | **90.0%** |
| Erreur moyenne de position | 0.68 |

**Par distance** :
| Distance | Courses | #1 gagne | Top 3 in Top 3 |
|----------|---------|----------|----------------|
| Staying (2400m+) | 173 | **87-90%** | 93-100% |
| Middle (1900-2400m) | 125 | 76-86% | 77-86% |
| Sprint (<1400m) | 109 | 50-93% | 100% |
| Mile (1400-1900m) | 122 | 43-63% | 75-86% |

---

## Points d'amélioration identifiés (non implémentés)

| Feature | Impact estimé | Données disponibles |
|---------|--------------|---------------------|
| Terrain/Sol (bon, souple, lourd) | +5-7% précision | Non disponible dans l'API PMU actuelle |
| Pedigree (père × distance) | +2-3% | Données `père_mère` disponibles mais complexité d'analyse élevée |
| Changement d'équipement (oeillères) | +1-2% | Données `equipement(s)` disponibles |
| Jockey × hippodrome | +2-3% | Calculable à partir des courses |
| Classe de course (Groupe/Listed/Handicap) | +3-4% | Non disponible explicitement |
| Cotes bookmakers (value bet) | +5-10% | Non intégré |

---

## Questions pour l'expert

1. **Calibrage des poids distance** : Le jockey pèse 28% en staying et 15% en sprint. Ces ratios vous semblent-ils cohérents avec votre expérience ?

2. **Intervalle optimal** : On fixe l'idéal à 15-25 jours. Est-ce valable pour toutes les catégories (2 ans, handicaps, Groupe) ?

3. **Impact de la corde** : ±8 pts en sprint, quasi nul en staying. Le calibrage est-il trop agressif ou pas assez ?

4. **Combo jockey × entraîneur** : On observe que certains duos ont 40%+ de victoires. Quel poids relatif donneriez-vous à cette synergie ?

5. **Poids porté** : On applique 1kg = ~6% d'impact × multiplicateur distance. En handicap, l'impact devrait-il être encore plus fort ?

6. **Données manquantes** : Quelles données accessibles (terrain, météo, tracé de piste) auraient le plus d'impact selon vous ?
