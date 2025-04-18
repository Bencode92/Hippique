# Guide d'intégration des classements pondérés

Ce guide explique comment intégrer les fichiers de classement pondéré générés automatiquement dans votre site web.

## Fichiers générés

Le script `extract-pondered-rankings.js` génère deux types de fichiers pour chaque catégorie :

1. **Fichiers datés** : `xxx_ponderated_2025-04-18T12-29-50.json` 
   - Archives historiques pour suivre l'évolution des classements

2. **Fichiers "latest"** : `xxx_ponderated_latest.json`
   - Toujours mis à jour avec la dernière version
   - À utiliser dans votre site pour avoir les données les plus récentes

## Comment intégrer dans index.html

Pour intégrer ces fichiers dans votre page d'accueil, voici les étapes à suivre :

### 1. Ajouter le script ranking-loader.js

J'ai créé un module optimisé `ranking-loader.js` qui remplace le module `scorePredictor` actuel. Pour l'intégrer :

```html
<!-- Ajoutez cette ligne avant la fermeture de </body> -->
<script src="js/ranking-loader.js"></script>
```

### 2. Modifier vos fonctions existantes

Dans votre fichier `index.html`, remplacez les références à `scorePredictor` par `rankingLoader`.

Par exemple, remplacez :
```javascript
await scorePredictor.loadAllData();
```

Par :
```javascript
await rankingLoader.loadAllData();
```

### 3. Mise à jour des fonctions qui affichent les top performers

La fonction `loadTopPerformers` devrait être modifiée pour utiliser `rankingLoader` :

```javascript
// Fonction pour charger et afficher les top performers pour chaque catégorie
async function loadTopPerformers() {
    // Précharger toutes les données de classement
    await rankingLoader.loadAllData();
    
    // Liste des catégories à afficher
    const categories = [
        {id: 'jockeys', icon: 'fa-user', container: 'top-jockeys'},
        {id: 'chevaux', icon: 'fa-horse', container: 'top-chevaux'},
        {id: 'entraineurs', icon: 'fa-users', container: 'top-entraineurs'},
        {id: 'eleveurs', icon: 'fa-seedling', container: 'top-eleveurs'},
        {id: 'proprietaires', icon: 'fa-user-tie', container: 'top-proprietaires'}
    ];
    
    // Traiter chaque catégorie
    categories.forEach(category => {
        // Vérifier si le container existe
        const container = document.getElementById(category.container);
        if (!container) return;
        
        // Récupérer les données de cette catégorie
        const data = rankingLoader.data[category.id] || [];
        
        // Si aucune donnée, afficher un message
        if (!data.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 1rem;">
                    <p>Aucune donnée disponible pour cette catégorie</p>
                </div>
            `;
            return;
        }
        
        // Prendre les 4 premiers éléments (déjà dans le bon ordre)
        const topItems = data.slice(0, 4);
        
        // Générer le HTML
        let html = '';
        topItems.forEach(item => {
            // [le reste de votre code...]
        });
        
        container.innerHTML = html;
    });
}
```

### 4. Mise à jour des fonctions de calcul de score prédictif

Pour les prédictions de courses, utilisez la fonction `calculerScoresCourse` de `rankingLoader` :

```javascript
const scoresPredictifs = await rankingLoader.calculerScoresCourse(course);
```

## Avantages de cette approche

1. **Performance** : Évite de recalculer les classements à chaque chargement de page
2. **Cohérence** : Garantit des classements identiques entre toutes les pages
3. **Simplicité** : Les données sont déjà formatées correctement
4. **Fiabilité** : Mécanisme de fallback - si les fichiers pondérés ne sont pas disponibles, recalcule automatiquement

## Optimisations futures

- Ajouter un système de mise en cache côté client
- Créer une API dédiée pour récupérer uniquement les données nécessaires
- Compresser les fichiers JSON pour des transferts plus rapides
