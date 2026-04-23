# Méthodologie Anti-Leakage — Système de Scoring Hippique

## Objectif

Garantir que l'évaluation des leviers prédictifs (backtesting) n'utilise **jamais** de données futures pour scorer des courses passées. Toute violation de cette règle = **leakage** = résultats artificiellement gonflés et inutilisables.

---

## 1. Sources de données

### Données par course (pas de risque de leakage)
Ces données sont figées au moment de la course et stockées dans `data/courses/YYYY-MM-DD_hippodrome.json` :
- **Cote finale** et **cote de référence** (ouverture)
- **Valeur France Galop** (poids handicapeur)
- **Musique** (historique de positions)
- **Gains carrière**, nb courses, nb victoires, nb places
- **Arrivée** (résultat réel, position d'arrivée)

### Classements annuels 2025 (pas de risque)
Fichiers `data/*_2025_ponderated_latest.json` :
- Chevaux, Jockeys, Entraîneurs, Éleveurs, Propriétaires, Cravache d'Or
- **Année complète figée** — ne change plus
- Contiennent : Rang, TauxVictoire, TauxPlace, GainMoyen, ScoreMixte

### Classements 2026 en cours (RISQUE DE LEAKAGE)
Fichiers `data/*_ponderated_latest.json` :
- Mis à jour régulièrement au fil de la saison
- **Problème** : le fichier du 23 avril contient les résultats des courses du 16-22 avril
- Utiliser le latest pour scorer une course du 17 avril = **leakage**

---

## 2. Solution : Snapshots horodatés

### Principe
À chaque mise à jour des CSV, un snapshot est sauvegardé :

```
data/rankings/
  2026-04-16_09h00/    ← CSV mis à jour le 16 avril à 9h
    chevaux.json
    jockeys.json
    cravache_or.json
    entraineurs.json
    eleveurs.json
    proprietaires.json
    chevaux_2025.json
    jockeys_2025.json
    ...
  2026-04-19_08h35/    ← CSV mis à jour le 19 avril à 8h35
    (mêmes fichiers)
```

### Automatisation
- **Pipeline GitHub Actions** (`pipeline-complete.yml`) : crée un snapshot à chaque run
- **Workflow manuel** (`snapshot-rankings.yml`) : permet de figer manuellement via GitHub Actions
- Format : `YYYY-MM-DD_HHhMM` (UTC)

---

## 3. Règle d'attribution des données par course

```
Pour une course à la date D :

SI D >= aujourd'hui :
  → 2025 + 2026 LATEST (course future, pas de leakage possible)

SI D < aujourd'hui :
  → Chercher le snapshot le plus récent dont la DATE <= D
  → SI trouvé : 2025 + ce snapshot
  → SI pas trouvé : 2025 UNIQUEMENT
```

### Exemple concret (snapshots dispo : 16 avril, 19 avril)

| Course | Données 2025 | Données 2026 | Justification |
|--------|-------------|-------------|---------------|
| 15 janvier | ✅ Figées | ❌ Aucune | Pas de snapshot avant cette date |
| 10 avril | ✅ Figées | ❌ Aucune | Pas de snapshot avant le 16 |
| **16 avril** | ✅ Figées | ✅ Snapshot 16 avril 09h | CSV mis à jour le matin, courses l'après-midi |
| **17 avril** | ✅ Figées | ✅ Snapshot 16 avril 09h | Dernier snapshot avant le 17 |
| **18 avril** | ✅ Figées | ✅ Snapshot 16 avril 09h | Idem |
| **19 avril** | ✅ Figées | ✅ Snapshot 19 avril 08h35 | Nouveau snapshot disponible |
| **20-22 avril** | ✅ Figées | ✅ Snapshot 19 avril 08h35 | Dernier snapshot avant ces dates |
| **23 avril (aujourd'hui)** | ✅ Figées | ✅ Latest | Course du jour = OK |

### Implémentation (code)

```javascript
// live-scoring.js et stats.html — même logique
function getSnapshotBefore(courseDate) {
    let best = null;
    for (const s of snapshots) {
        const snapDate = s.date.slice(0, 10); // "2026-04-16_09h00" → "2026-04-16"
        if (snapDate <= courseDate) best = s;  // même jour = OK (matin → après-midi)
        else break;
    }
    return best;
}
```

---

## 4. Leviers testés

### Sans risque de leakage (données de la course)
| Levier | Source | Risque |
|--------|--------|--------|
| Cote (1/cote) | PMU API au moment de la course | ✅ Aucun |
| Cote référence | PMU API | ✅ Aucun |
| Dérive cote | Calculé : (ref - finale) / ref | ✅ Aucun |
| Valeur FG | France Galop, fixée avant la course | ✅ Aucun |
| Musique | Historique du cheval, figé | ✅ Aucun |
| Gains carrière | PMU API | ✅ Aucun |

### Avec gestion anti-leakage (classements)
| Levier | Source | Gestion |
|--------|--------|---------|
| Ch TauxV | Classement chevaux | 2025 figé + snapshot 2026 |
| Ch TauxP | Classement chevaux | Idem |
| Ch Rang | Classement chevaux | Idem |
| Ch GainMoy | Classement chevaux | Idem |
| Ch ScoreMixte | Classement chevaux | Idem |
| Jk TauxV | Classement jockeys | Idem |
| Jk TauxP | Classement jockeys | Idem |
| Jk Rang | Classement jockeys | Idem |
| Jk ScoreMixte | Classement jockeys | Idem |
| Jk GainMoy | Classement jockeys | Idem |
| Cravache Rang | Cravache d'Or | Idem |

### Exclus du backtesting automatique
| Levier | Raison d'exclusion |
|--------|-------------------|
| NbVictoires (×5) | Leakage circulaire : corrèle avec les victoires dans les fichiers de courses |
| TauxV individuel | Idem — calculé depuis nb_victoires/nb_courses du fichier |
| TauxP individuel | Idem |

---

## 5. Modes d'analyse disponibles (page Stats)

| Mode | Description | Usage |
|------|------------|-------|
| **Auto** | 2025 + snapshot 2026 avant la course | Backtesting honnête (défaut) |
| **2025 uniquement** | Données 2025 figées, aucun 2026 | Test conservateur, zéro biais |
| **2026 (snapshot)** | Snapshot 2026 uniquement, pas de 2025 | Tester l'apport du 2026 seul |
| **2025 + 2026 (snapshot)** | Identique à Auto | Explicite |

**Note** : dans tous les modes, les données 2026 pour les courses passées passent TOUJOURS par les snapshots. Il n'y a pas de mode "latest pour tout" afin d'éviter toute erreur.

---

## 6. Résultats attendus

Avec la méthodologie anti-leakage, les résultats typiques sont :
- **Top1 modèle** : 25-35% (vs ~30% pour le favori cote)
- **Top3 modèle** : 55-65%

Des résultats supérieurs à 50% en Top1 sur un large échantillon doivent être considérés avec suspicion et vérifiés pour leakage résiduel.

---

## 7. Points de vigilance pour l'expert

1. **Les classements 2025 sont-ils vraiment figés ?** → Oui, année terminée, les fichiers ne changent pas
2. **Les snapshots 2026 peuvent-ils contenir des résultats futurs ?** → Non, ils sont pris au moment de la mise à jour du CSV (avant les courses du jour)
3. **La comparaison `snapDate <= courseDate` est-elle correcte ?** → Oui, le snapshot du matin (09h00) est utilisable pour les courses de l'après-midi
4. **Les données de course (cote, valeur, musique) sont-elles bien du jour J ?** → Oui, extraites par le scraper PMU API le jour de la course
5. **NbVictoires est exclu — est-ce suffisant ?** → C'est le principal vecteur de leakage circulaire. Les autres champs du participant (gains, musique) sont des données historiques figées
6. **Faut-il un walk-forward en plus ?** → Le système de snapshots est un walk-forward naturel : chaque course est scorée avec les données disponibles au moment de la course

---

*Document généré le 2026-04-23*
*Système : github.com/Bencode92/Hippique*
