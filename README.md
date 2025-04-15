# Projet d'extraction de données hippiques

Ce projet extrait automatiquement les données des chevaux, jockeys, entraîneurs, propriétaires et éleveurs depuis le site France Galop. Les données sont téléchargées au format CSV puis converties et stockées en JSON.

## Fonctionnalités

- Extraction automatique quotidienne via GitHub Actions
- Téléchargement direct des fichiers CSV de France Galop
- Conversion et stockage en JSON dans le dossier `data/`
- Conservation des fichiers CSV bruts pour référence
- Extraction de 5 catégories : chevaux, jockeys, entraîneurs, propriétaires et éleveurs
- Détection automatique des URL de téléchargement
- Support de différents encodages (UTF-8, Latin-1)
- Gestion robuste des erreurs

## Structure des données

Chaque fichier JSON contient :

```json
{
  "metadata": {
    "source": "URL source",
    "download_url": "URL de téléchargement du CSV",
    "date_extraction": "Date et heure",
    "category": "Catégorie",
    "nombre_resultats": "Nombre d'entrées"
  },
  "resultats": [
    // Données extraites du CSV
  ]
}
```

## Utilisation

### Extraction manuelle

Pour lancer l'extraction manuellement :

1. Cloner le dépôt
2. Installer les dépendances : `pip install -r requirements.txt`
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

## Comment ça fonctionne

Le script utilise une approche en plusieurs étapes :

1. Visite la page de la catégorie sur France Galop
2. Détecte le lien de téléchargement CSV (bouton "Télécharger")
3. Télécharge le fichier CSV directement
4. Parse le CSV et le convertit en structure JSON
5. Sauvegarde à la fois le CSV brut et le fichier JSON traité

Cette méthode est plus fiable que le scraping HTML car elle utilise le format d'export officiel du site.

## Dépannage

Si l'extraction échoue, le script tente plusieurs méthodes alternatives pour trouver le lien de téléchargement :
- Recherche de boutons ou liens contenant "télécharger" ou "CSV"
- Test de plusieurs URL potentielles
- Sauvegarde des erreurs dans un dossier de debug pour analyse

## Licence

Ce projet est destiné à un usage personnel et éducatif uniquement. Veuillez respecter les conditions d'utilisation du site France Galop.