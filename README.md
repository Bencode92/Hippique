# Projet d'extraction de données hippiques

Ce projet extrait automatiquement les données des chevaux, jockeys, entraîneurs, propriétaires et éleveurs depuis le site France Galop. Les données sont stockées dans des fichiers JSON structurés.

## Fonctionnalités

- Extraction automatique quotidienne via GitHub Actions
- Données stockées au format JSON dans le dossier `data/`
- Extraction de 5 catégories : chevaux, jockeys, entraîneurs, propriétaires et éleveurs
- Détection des filtres appliqués (année, spécialité, etc.)
- Sauvegarde des métadonnées (date d'extraction, source, etc.)

## Structure des données

Chaque fichier JSON contient :

```json
{
  "metadata": {
    "source": "URL source",
    "date_extraction": "Date et heure",
    "category": "Catégorie",
    "nombre_resultats": "Nombre d'entrées"
  },
  "filters": {
    "année": "2025",
    "spécialité": "Tout"
  },
  "resultats": [
    // Données extraites
  ]
}
```

## Utilisation

### Extraction manuelle

Pour lancer l'extraction manuellement :

1. Cloner le dépôt
2. Installer les dépendances : `pip install requests beautifulsoup4`
3. Exécuter le script : `python scraper.py`

Pour extraire seulement certaines catégories :

```bash
python scraper.py jockeys,chevaux
```

### Extraction automatique

L'extraction se fait automatiquement tous les jours à 2h du matin grâce à GitHub Actions.

Vous pouvez également lancer l'extraction manuellement depuis l'interface GitHub :
1. Aller dans l'onglet "Actions"
2. Sélectionner le workflow "France Galop Data Extraction"
3. Cliquer sur "Run workflow"
4. Optionnellement spécifier les catégories à extraire

## Licence

Ce projet est destiné à un usage personnel et éducatif uniquement. Veuillez respecter les conditions d'utilisation du site France Galop.