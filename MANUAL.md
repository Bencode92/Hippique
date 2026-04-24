# Manuel Hippique — guide terminal

Ce manuel te guide pas-à-pas pour utiliser le projet en ligne de commande. Tout se passe depuis le dossier `~/Hippique/`.

---

## 1. Prérequis (une seule fois)

Vérifie que tu as Node.js installé :

```bash
node --version   # doit afficher v18+ ou v20+
python3 --version   # doit afficher 3.10+
```

Si `node` n'est pas installé :
```bash
brew install node
```

---

## 2. Mettre à jour le repo (à faire chaque matin)

```bash
cd ~/Hippique
git pull
```

C'est **important** parce que GitHub Actions pousse automatiquement :
- Les nouveaux snapshots de rankings (`data/rankings/YYYY-MM-DD_HHhMM/`)
- Les résultats de courses de la veille (`data/courses/YYYY-MM-DD_*.json`)
- Parfois les `best_formulas.json` recalculés

Si tu ne pulles pas, tu scoores avec des données vieilles d'hier.

---

## 3. Scorer les courses du jour — usage standard

### 3.1 Toutes les réunions du jour

```bash
node live-scoring.js
```

Ça scrape le programme PMU d'aujourd'hui et affiche pour chaque course :
- Le classement modèle (ancien scoring)
- Le classement leviers (formule champion)
- Le favori cote
- Une simulation Dutch betting 5 €

Attention : ça peut faire une vingtaine de réunions, donc des centaines de courses. Utile pour un dump complet.

### 3.2 Un hippo spécifique (**le plus courant**)

```bash
node live-scoring.js longchamp
node live-scoring.js saint-cloud
node live-scoring.js chantilly
node live-scoring.js vincennes
```

Le filtre est sur **le nom** (match partiel, insensible à la casse). `longchamp` matche aussi `PARISLONGCHAMP`.

### 3.3 Une réunion précise

```bash
node live-scoring.js R1    # toutes les courses de la réunion 1 (toutes cibles)
node live-scoring.js R4    # réunion 4
```

### 3.4 Une course précise

```bash
node live-scoring.js longchamp C3      # Longchamp, course 3 seulement
node live-scoring.js saint-cloud C5    # Saint-Cloud, course 5
```

### 3.5 Filtrer les formules « trop belles pour être vraies »

```bash
node live-scoring.js --seuil 80 longchamp
```

Si la formule champion du bucket affiche > 80 % Top1, elle est probablement surapprise → le script bascule sur la formule conservatrice. Utile pour ne pas suivre une formule trouvée sur 15 courses.

Seuils recommandés :
- `--seuil 80` : prudent (rejette les overfit probables)
- `--seuil 100` : par défaut (prend tout)

---

## 4. Lire la sortie du terminal

Pour chaque course, tu vois 3 blocs :

### Bloc 1 : `📊 CLASSEMENT MODÈLE`
L'ancien scoring du projet (fiche `ranking-loader.js`). Bon repère, mais c'est le levier du site, pas la formule optimisée.

### Bloc 2 : `🔬 CLASSEMENT LEVIERS`
Le classement via la **formule champion** trouvée dans `best_formulas.json`. Header :
```
🔬 CLASSEMENT LEVIERS (Cote×50% + TauxV×50%) — 224 courses
```
- Le libellé de la formule
- Le nombre de courses sur lequel elle est basée (plus c'est grand, plus c'est fiable)
- Préfixe `[PREMIUM]` si tu es sur Longchamp / Saint-Cloud / Chantilly / Fontainebleau / Deauville → formule spécifique à ce pool d'hippos

Si tu vois `⚠️ PEU FIABLE` → la formule a été trouvée sur moins de 30 courses, c'est du bruit. Préfère le bloc 1 dans ce cas.

### Bloc 3 : comparaison + Dutch
- `Notre #1` (classement leviers) vs `Favori cote`
- Simulation de mise : si tu dutch (répartis 5 €) sur les 2-4 premiers, quel coût / quel retour si un gagne.

---

## 5. Quand recalculer les formules

Normalement jamais à la main — `live-scoring.js` détecte via `_version: 2` si le fichier est à jour et relance un calcul automatique sinon. Mais si tu veux forcer :

```bash
rm data/best_formulas.json
node live-scoring.js longchamp
```

La première exécution prendra **2-3 minutes** (exploration de 22 leviers × 1→6 combinaisons × 5 buckets). Ensuite c'est instantané.

À refaire si :
- Tu modifies le code de scoring (`live-scoring.js`)
- Tu accumules beaucoup de nouvelles courses (mois suivant)
- Tu veux voir l'effet d'un nouveau snapshot sur les formules

---

## 6. Backtest historique (hors live)

Pour mesurer la perf d'une période passée :

```bash
node backtest-fr-1604.js                          # 16/04 → aujourd'hui
node backtest-fr-1604.js 2026-04-01 2026-04-24    # dates custom
```

Sort :
- Classement de tous les leviers (solo) par bucket de distance
- Détail course par course
- Taux de couverture des jockeys / chevaux

Utile pour **valider** qu'une formule tient sur une autre période que celle où elle a été trouvée.

---

## 7. Ce qui tourne tout seul sur GitHub

Tu n'as pas à t'en occuper, mais pour info :

| Workflow | Quand | Quoi |
|---|---|---|
| `snapshot-rankings.yml` | Plusieurs fois / jour | Snapshot daté des classements dans `data/rankings/` |
| `extract_courses.yml` | Soir | Scrape les résultats des courses terminées |
| `scrape-pre-course.yml` | Toutes les 15 min (journée) | Cotes 10 min avant le départ |
| `backtest-daily.yml` | Nuit | Recompute les stats |
| `pipeline-complete.yml` | Variable | Orchestration des précédents |

D'où l'importance du `git pull` du matin.

---

## 8. Cas de panne / debug

**« 0 jockey matché »** → `claude_correspondances.json` absent ou périmé. Refaire un pull.

**« Formules à 94 % »** → tu tournes encore en v1. Supprime `best_formulas.json` et relance.

**« Le tag `[PREMIUM]` ne s'affiche pas sur Longchamp »** → vérifier que le nom d'hippo renvoyé par l'API PMU (`reunion.hippodrome.libelleCourt`) commence bien par `PARISLONGCHAMP`. Si ce n'est pas le cas, mets à jour le Set `PREMIUM_HIPPOS` en haut de `live-scoring.js`.

**Le script plante sur un parsing** → relance avec un hippo filtré pour isoler : `node live-scoring.js saint-cloud`.

**Tu veux voir la liste des hippos du jour** sans lancer le scoring :
```bash
node -e "fetch('https://online.turfinfo.api.pmu.fr/rest/client/61/programme/' + new Date().toLocaleDateString('fr-FR').split('/').join('') + '?specialisation=INTERNET').then(r=>r.json()).then(d=>d.programme.reunions.forEach(r=>console.log('R'+r.numOfficiel, r.hippodrome.libelleCourt)))"
```

---

## 9. Workflow-type d'un matin de jeu

```bash
cd ~/Hippique
git pull                                     # 1. pull snapshots / résultats
node live-scoring.js saint-cloud             # 2. scoring de ton meeting
                                             # → lis le classement leviers
                                             # → note les Dutch 5€ intéressants
# (optionnel) vérifier sur stats.html en navigateur
# → bouton "⭐ Premium FR" + Analyse Leviers pour confirmer la formule
```

Si tu joues plusieurs hippos dans la journée, refais juste `node live-scoring.js <hippo>` autant de fois que nécessaire. C'est non-destructif.

---

## 10. Raccourcis pratiques

Mets ces alias dans ton `~/.zshrc` :

```bash
alias hippup="cd ~/Hippique && git pull"
alias hipplc="cd ~/Hippique && node live-scoring.js longchamp"
alias hippsc="cd ~/Hippique && node live-scoring.js saint-cloud"
alias hippbt="cd ~/Hippique && node backtest-fr-1604.js"
```

Puis :
```bash
source ~/.zshrc
hippup       # git pull
hipplc       # scoring longchamp
hippsc       # scoring saint-cloud
hippbt       # backtest 16/04 → aujourd'hui
```
