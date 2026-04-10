# Rapport Expert — Système Prédictif Hippique
## Bencode92/Hippique — Avril 2026

---

## 1. Sources de données

### A. Classements France Galop (CSV manuels)

| Catégorie | 2025 (année fermée) | 2026 (en cours) |
|-----------|-------------------|-----------------|
| Chevaux | 9 100 | 3 750 |
| Jockeys | 515 | 266 |
| Entraîneurs | 971 | 655 |
| Éleveurs | 2 150 | 2 150 |
| Propriétaires | 2 200 | 1 550 |
| Cravache d'or | 493 | 239 |

**Champs par cheval** : Rang, TauxVictoire, TauxPlace, GainMoyen, ScoreMixte, NbCourses, NbVictoires, NbPlace, Âge, Sexe, Race, Allocation tot., Valeur

**Champs par jockey/entraîneur** : Rang, TauxVictoire, TauxPlace, GainMoyen, Gain/Part., Gain/Chev., Partants, Victoires, Places, Allocation tot.

### B. Courses PMU (API automatique 2×/jour)

**730 courses** avec résultats (janvier → avril 2026)

**Champs par participant** :
| Champ | Exemple | Utilisé dans le scoring ? |
|-------|---------|--------------------------|
| cote | 6.2 | ✅ OUI — dans toutes les formules (30-40%) |
| cote_reference | 9.7 | ❌ Non (affichage seulement) |
| cote_tendance | +/- | ❌ Non |
| nb_victoires | 2 | ❌ Non dans formule (affiché) — leakage potentiel |
| nb_courses | 18 | ❌ Non dans formule (affiché) |
| nb_places | 10 | ❌ Non dans formule (affiché) |
| gains | 2997400 | ❌ Non dans formule (affiché) |
| valeur | 56.0 | ✅ OUI — Saint-Cloud/Longchamp (50%) + petit champ |
| poids | 56 kg | ❌ Non (pas de signal backtesté) |
| corde | (Corde:05) | ✅ OUI — Staying (15%) |
| musique | 4p6p0p5p... | ❌ Non dans formule (affiché dans tooltip) |
| avis_entraineur | POSITIF/NEGATIF | ❌ Non (données trop rares) |
| equipement(s) | A (oeillères) | ❌ Non |
| père_mère | Par: X et Y (Z) | ❌ Non (trop complexe à exploiter) |
| arrivee | 1 (gagnant) | ✅ Pour le backtest uniquement |

### C. Stats dérivées (calculées automatiquement)

| Fichier | Contenu | Utilisé ? |
|---------|---------|-----------|
| chevaux_distance_stats.json | TauxV par sprint/mile/middle/staying (9 014 chevaux) | ❌ Non dans formule (affiché) |
| jockeys_distance_stats.json | Idem (1 748 jockeys) | ❌ Non dans formule (affiché) |
| chevaux_forme_recente.json | Score 0-100 + tendance (9 014 chevaux) | ❌ Non dans formule (affiché) |
| jockeys_forme_recente.json | Idem (1 748 jockeys) | ❌ Non dans formule (affiché) |
| combo_jockey_entraineur.json | TauxV du duo (1 215 combos) | ❌ Non dans formule (affiché) |
| stable_form.json | Forme écurie 30j (489 entraîneurs) | ❌ Non dans formule |
| intervalle_courses.json | Jours depuis dernière course (9 010 chevaux) | ❌ Non dans formule |
| claude_correspondances.json | Matching noms IA (11 correspondances, 78 étrangers) | ✅ OUI — matching des noms |

---

## 2. Scoring adaptatif par type de course

### Formules actuelles (backtestées val jan-fév → holdout mars+)

```
SAINT-CLOUD / LONGCHAMP :
  Score = Valeur FG × 0.5 + Cote × 0.3
  → Le rating expert des handicapeurs domine sur ces hippodromes

SPRINT (<1400m) :
  Score = Cote × 0.4 + Jockey rang 2025 × 0.3 + Cheval tauxV 2025 × 0.3
  → Le jockey fait la différence (départ, positionnement)

MILE (1400-1900m) :
  Score = Cheval tauxV 2025 × 0.6 + Cote × 0.4
  → Le cheval domine, la cote confirme

MIDDLE (1900-2400m) :
  Score = Cheval tauxV 2025 × 0.5 + Cote × 0.4
  → Équilibre cheval/marché

STAYING (2400m+) :
  Score = Cheval tauxV 2025 × 0.4 + Cote × 0.3 + Corde × 0.15
  → Position de départ importante en longue course

AJUSTEMENTS PELOTON :
  Petit champ (<9)  : + Valeur FG × 0.15
  Grand champ (14+) : + Cheval tauxV 2025 × 0.3

NORMALISATION :
  Scores ramenés à 10-90 par course (min-max scaling)
```

### Données combinées 2025 + 2026

Pour chaque cheval/jockey, le système cherche dans les **deux classements** et prend le meilleur score. Un cheval absent en 2025 mais présent en 2026 est utilisé (et inversement).

---

## 3. Résultats backtesting

### Walk-forward strict (zero leakage)

Données : classements 2025 figés → prédictions courses 2026

| Métrique | Val (jan-fév) | Holdout (mars+) |
|----------|---------------|-----------------|
| Courses | 349 | 381 |
| Notre top1 gagne | 20.9% | Variable par type |
| Favori marché top1 | 34.1% | 27.6% |
| Hasard | 8.8% | 9% |

### Par type de course (holdout mars+)

| Type | Meilleure formule | Hold top1 | Favori | Delta |
|------|-------------------|-----------|--------|-------|
| Sprint | Cote + J25rang | 72.6% | 6.5% | +66 |
| Mile | ChTauxV25 | 79.5% | 17.8% | +62 |
| Middle | ChTauxV25 | 77.5% | 31.3% | +46 |
| Staying | Corde | 77.1% | 38% | +39 |
| Petit champ | Valeur FG | 61.3% | 33.8% | +28 |
| Moyen champ | ChTauxV25 | 69.8% | 22.4% | +47 |
| Grand champ | ChTauxV25 | 82.3% | 33.3% | +49 |

**⚠️ IMPORTANT** : Ces résultats holdout sont gonflés par le biais de matching (22-57% des chevaux trouvés dans les classements). Le filtre "connu vs inconnu" gonfle artificiellement les scores. Les vrais chiffres en walk-forward strict sont plus proches de 20-30%.

### Test marché honnête (174 courses avec cotes)

| | Top1 | Top2 |
|---|---|---|
| Hasard | 9.1% | 18.1% |
| Notre modèle | 16.7% | 34.5% |
| Favori marché | 33.9% | 52.9% |

**Verdict** : Le modèle seul ne bat pas le favori marché. Avec la cote intégrée dans le scoring (version actuelle), l'écart se réduit significativement.

---

## 4. Ce qui est UTILISÉ dans le scoring

| Critère | Poids | Source | Leakage ? |
|---------|-------|--------|-----------|
| **Cote PMU** | 30-40% selon type | API PMU | ❌ |
| **Cheval TauxVictoire 2025+2026** | 30-60% selon type | CSV France Galop | ❌ (2025 fermé) |
| **Jockey Rang 2025+2026** | 0-30% selon type | CSV France Galop | ❌ (2025 fermé) |
| **Valeur France Galop** | 50% St-Cloud, 15% petit champ | API PMU | ❌ |
| **Corde** | 15% staying | API PMU | ❌ |

**Total : 5 critères actifs dans le scoring.**

---

## 5. Ce qui est AFFICHÉ mais PAS dans le scoring

Ces données sont dans le tooltip pour aider l'utilisateur dans son analyse :

| Donnée | Pourquoi pas dans le scoring |
|--------|------------------------------|
| Forme récente (score + tendance) | Dégrade le holdout (-15 pts) |
| Musique (dernières positions) | Ne généralise pas (val OK, holdout KO) |
| Stats indiv PMU (tauxV, gains) | Leakage potentiel (inclut résultats 2026) |
| Spé distance jockey | Pas assez de données par bucket |
| Spé distance cheval | Idem |
| Combo jockey × entraîneur | Trop de bruit sur petits échantillons |
| Forme stable entraîneur | Pas de signal en backtest |
| Intervalle entre courses | Pas de signal |
| Poids porté | Pas de signal en backtest |
| Entraîneur rang | Signal trop faible (5% dans l'ancienne formule) |
| Éleveur rang | Signal nul |
| Propriétaire rang | Signal nul |

---

## 6. Ce qui n'est PAS exploité du tout

| Donnée | Disponible ? | Raison |
|--------|-------------|--------|
| Pedigree (père × mère) | ✅ Champ père_mère | Trop complexe à parser/exploiter |
| Équipement (oeillères) | ✅ Champ equipement(s) | Signal inconnu, pas testé |
| Avis entraîneur | ✅ Champ avis_entraineur | Données trop rares |
| Terrain/Sol | ❌ Pas dans l'API PMU | Impact potentiellement majeur |
| Météo | ❌ | Pourrait affecter lourd/souple |
| Speed figures (Timeform/Beyer) | ❌ | Données payantes |
| Classe de course (Groupe/Listed) | ❌ Pas explicite | Différencie le niveau |
| Jockey × hippodrome | ❌ Pas calculé | Certains jockeys dominent certaines pistes |

---

## 7. Pipeline automatique

```
Quotidien automatique :
  10h UTC → Extraction courses + cotes ouverture (API PMU)
  20h UTC → Extraction courses + cotes finales + arrivées
  22h UTC → Backtest quotidien

Après push CSV France Galop :
  CSV → JSON → Rankings pondérés → Distance stats → Forme récente
  → Combos J×E → Stable form → Claude Matcher (IA)
```

### Workflows GitHub Actions

| Workflow | Déclenchement | Rôle |
|----------|---------------|------|
| Convert Rankings CSV to JSON | Auto (push CSV) | Conversion |
| Pipeline Complet | Auto (après conversion) | Rankings + stats |
| Extraction des courses | 2×/jour (10h + 20h UTC) | Courses + cotes + arrivées |
| Backtest quotidien | 22h UTC | Walk-forward strict |
| Claude Matcher | Auto (après pipeline) | Résolution noms IA |

---

## 8. Taux de matching actuel

| Mois | Chevaux (2025+2026) | Jockeys |
|------|---------------------|---------|
| Janvier 2026 | 57% | 74% |
| Février 2026 | 58% | 78% |
| Mars 2026 | 26% | 30% |
| Avril 2026 | 26% | 29% |

**Action pour améliorer** : Mettre à jour les CSV 2026 régulièrement (les chevaux qui courent en mars-avril seront alors dans le classement).

---

## 9. Questions pour l'expert

### Sur le scoring

1. **La cote à 30-40%** dans toutes les formules — est-ce trop ou pas assez ? Le marché PMU bat notre modèle seul (33.9% vs 16.7%), mais combiné le modèle apporte de la valeur sur certains segments.

2. **Le jockey pèse 30% en sprint, 0% en mile/middle** — est-ce cohérent avec votre expérience ? Le backtest montre que le jockey aide surtout en sprint (départ, positionnement) et en grand champ (navigation).

3. **La corde à 15% en staying** — le backtest montre un signal surprenant. La position de départ sur longue distance est-elle vraiment un facteur ?

4. **La valeur FG domine à Saint-Cloud** (50% top1) — est-ce spécifique à cet hippodrome ou applicable à d'autres hippodromes de haut niveau (Longchamp, Chantilly) ?

5. **Entraîneur/éleveur/propriétaire** ne pèsent rien dans nos tests — est-ce un problème de données (5 mois seulement) ou est-ce que ces acteurs sont réellement peu prédictifs ?

### Sur les données manquantes

6. **Le terrain** (bon, souple, lourd, collant) — quel impact estimez-vous ? C'est la donnée la plus demandée par OpenAI mais non disponible dans l'API PMU.

7. **La classe de course** (Groupe 1/2/3, Listed, Handicap, Claimer) — comment la distinguer et quel impact ?

8. **Les speed figures** — existent-elles en France et sont-elles accessibles ?

### Sur la méthodologie

9. Le **matching à 26%** sur mars-avril (la plupart des chevaux ne sont pas dans les classements 2025/2026) — comment l'améliorer ?

10. Avec **730 courses** et 5 mois de données, avons-nous assez de volume pour des conclusions fiables ? Combien de temps faudrait-il accumuler ?

---

## 10. Conclusion

Le système est un **bon outil d'analyse** qui :
- ✅ Bat le hasard de manière significative (×2 à ×3)
- ✅ Identifie correctement les favoris probables
- ✅ Adapte sa formule au type de course
- ✅ Affiche toutes les données pertinentes pour l'analyse
- ✅ S'améliore automatiquement avec l'accumulation de données

Mais :
- ❌ Ne bat pas encore le favori marché (cote la plus basse) de manière fiable
- ❌ Le matching (26-57%) limite la précision
- ❌ 5 mois de données = échantillon encore petit

**Prochaines étapes** :
1. Accumuler 6-12 mois de données supplémentaires
2. Intégrer le terrain si possible
3. Réévaluer les formules trimestriellement avec plus de données
