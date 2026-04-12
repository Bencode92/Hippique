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
```

---

## 1. CE QUE FAIT LE SYSTÈME

### Pipeline automatique
```
CSV France Galop (push manuel) → Conversion JSON → Rankings pondérés
→ Stats distance → Forme récente → Combos J×E → Claude Matcher (IA)

Courses PMU scrapées 2×/jour (10h + 20h UTC) avec :
  - Cotes (directe + référence)
  - Arrivées (classement final)
  - Terrain/pénétromètre (depuis le 11/04)
  - Avis entraîneur

Backtest quotidien à 22h UTC
```

### Scoring adaptatif par distance
Le score de chaque participant varie selon le type de course :

```
SPRINT (1000-1400m) :  Musique × 0.4 + Cote × 0.4 + Valeur FG × 0.2
MILE (1400-1700m) :    Valeur FG × 0.5 + Cote × 0.3 + Musique × 0.2
MIDDLE (1800-2100m) :  Cote × 0.5 + Valeur FG × 0.3 + IndivV × 0.2
STAYING (2200m+) :     Cote × 0.4 + Valeur FG × 0.3 + Musique × 0.3
```

Ajustements peloton : petit champ (+Valeur FG), grand champ (+ChTauxV)

Scores normalisés 10-90 par course (min-max scaling).

### Données disponibles (129 critères inventoriés)

**Dans le scoring (5 critères actifs) :**
- Cote PMU (proba marché)
- Valeur France Galop (rating handicapeur officiel)
- Musique (score pondéré des 5 dernières positions)
- IndivV (taux victoire individuel PMU — middle seulement)
- Corde (staying via ajustement peloton)

**Affichés dans le tooltip (pas dans le score) :**
- Rang cheval 2025+2026 + taux victoire
- Rang jockey 2025+2026
- Cravache d'or
- Forme récente (score + tendance)
- Spé distance (taux victoire par distance)
- Combo jockey × entraîneur
- Stable form (forme écurie 30j)
- Intervalle entre courses

**Scrapé mais pas encore exploité :**
- Terrain/pénétromètre (depuis 11/04, besoin 2-3 semaines de data)
- Cote ouverture vs cote finale (non distingué dans le scoring)
- Avis entraîneur (trop rare)

**Pas exploité du tout :**
- Pedigree (père × mère)
- Équipement (oeillères)
- Jockey × hippodrome
- Classe de course (Groupe/Listed/Handicap)
- Speed figures

---

## 2. RÉSULTATS BACKTESTING

### Walk-forward strict (zero leakage)
Classements 2025 figés → prédictions courses 2026

| Métrique | Notre modèle | Favori marché | Hasard |
|----------|-------------|---------------|--------|
| Top 1 gagne | 25.6% | 33.9% | 9.1% |
| Top 2 contient gagnant | 34.5% | 52.9% | 18.1% |

### Avec nouvelles formules (réunions 10-11 avril, 31 courses)

| | Notre modèle | Favori marché |
|---|---|---|
| **Top 1 gagne** | **35% (11/31)** | **32% (10/31)** |
| Top 2 | 48% | 55% |

**Premier résultat au-dessus du favori en Top 1** (+3 pts).

### Par hippodrome (nouvelles formules)
- **SAINT-CLOUD** : 38% vs 25% favori (**✅ +13 pts**)
- **BORELY** : 50% vs 50% (=)
- **LE BOUSCAT** : 22% vs 22% (=)

### Test résidus marché (verdict OpenAI)
- Corrélation modèle-résidus = -0.03 → le modèle n'ajoute pas d'info orthogonale au marché
- Alpha optimal stacking = 0% → le modèle seul ne bat pas le favori
- **Verdict : outil d'analyse, pas système de paris**
- MAIS : les formules par distance montrent des progrès (+3 pts en top1 récemment)

---

## 3. VOLUMES DE DONNÉES

| Catégorie | 2025 | 2026 |
|-----------|------|------|
| Chevaux | 9 100 | 3 750 |
| Jockeys | 515 | 266 |
| Entraîneurs | 971 | 655 |
| Éleveurs | 2 150 | 2 150 |
| Propriétaires | 2 200 | 1 550 |
| Cravache d'or | 493 | 239 |

- **730+ courses** avec arrivées + cotes (jan-avr 2026)
- **453 fichiers** de courses dans data/courses/
- Matching chevaux : 57% (jan-fév), 26% (mar-avr) — monte avec CSV à jour

---

## 4. ARCHITECTURE TECHNIQUE

### Fichiers clés
```
js/ranking-loader.js          — Scoring adaptatif (le cerveau)
index.html                    — Frontend avec tooltip + stats réunion
scraper_courses_pmu.py        — Scraper API PMU (courses + cotes + terrain + arrivées)
extract-pondered-rankings.js  — Rankings pondérés (4 critères)
build-distance-stats.js       — Stats par distance
build-recent-form.js          — Forme récente (decay 30j)
build-combo-stats.js           — Combos jockey × entraîneur
build-stable-form.js          — Forme stable écurie
claude-matcher.js             — Résolution noms via Claude API
backtesting.js                — Backtest ancien (leakage — ne plus utiliser)
mega-optimize-clean.js        — Walk-forward strict (zero leakage)
backtest-par-type.js          — Grid search par type de course
convert_csv_rankings.py       — CSV France Galop → JSON
```

### Workflows GitHub Actions
```
Convert Rankings CSV to JSON   — Auto sur push CSV
Pipeline Complet               — Auto après conversion
Extraction des courses         — 2×/jour (10h + 20h UTC)
Backtest quotidien             — 22h UTC
Claude Matcher                 — Auto après pipeline
```

### Frontend (index.html)
- Bandeau résumé réunion pré-calculé (Notre #1 vs Favori cote)
- Tableau par course : N° | Cheval | Jockey | Entraîneur | Poids | Cote | Score | Arrivée
- Tooltip détaillé : tous les critères + forme + distance + valeur + musique
- Indicateurs visuels : forme (▲▲/▼▼), score coloré, arrivée (or/argent/bronze)
- Formule adaptée affichée par course

---

## 5. CE QUI A ÉTÉ VALIDÉ PAR EXPERT (OpenAI)

### Ce qui marche
- Walk-forward strict = méthodologie solide
- Scoring adaptatif par distance = approche correcte
- Valeur FG comme critère #1 sur 1400-1700m = validé
- La cote comme base = indispensable
- Pipeline automatique = opérationnel

### Ce qui ne marche pas
- Battre le marché de manière fiable (le marché est trop efficient)
- Les features walk-forward (tauxV bayésien) → signal trop faible sur 5 mois
- Ajouter des features qui dégradent (forme, stable, intervalle dans le score)

### Recommandations expert
1. **P0** : Intégrer le terrain (scraping en cours, exploitable dans 2 semaines)
2. **P1** : Classe de course (via allocation)
3. **P1** : Jockey × hippodrome
4. **P2** : Accumuler 12+ mois de données
5. **P2** : Passer au value betting (proba modèle > proba marché)

---

## 6. PROCHAINES ÉTAPES CONCRÈTES

### Court terme (cette semaine)
- [ ] Vérifier que le scraping terrain fonctionne quotidiennement
- [ ] Mettre à jour les CSV 2026 régulièrement
- [ ] Accumuler les données avec terrain

### Moyen terme (2-4 semaines)
- [ ] Construire feature `cheval × terrain` quand 200+ courses avec terrain
- [ ] Backtester les formules par distance avec terrain
- [ ] Ajouter la classe de course (Groupe/Handicap via allocation)
- [ ] Tester jockey × hippodrome

### Long terme (3-6 mois)
- [ ] Accumuler 2000+ courses pour des conclusions robustes
- [ ] Re-backtester avec volume suffisant
- [ ] Évaluer si le modèle peut battre le marché avec terrain + classe
- [ ] Si oui → value betting ciblé sur niches
- [ ] Si non → confirmer outil d'analyse pure

---

## 7. FICHIERS IMPORTANTS À LIRE EN PRIORITÉ

1. `js/ranking-loader.js` lignes 2608-2700 — Les formules de scoring
2. `index.html` lignes 2060-2160 — Le tooltip et l'affichage
3. `scraper_courses_pmu.py` lignes 310-380 — Le scraping courses + terrain
4. `docs/RAPPORT_EXPERT_COMPLET.md` — Doc détaillée pour l'expert hippique
5. `data/backtest/` — Tous les résultats de backtest
