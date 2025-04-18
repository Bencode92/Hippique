// extract-pondered-rankings.js
// Script pour extraire uniquement les classements pondérés par catégorie

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

/**
 * Extrait le classement pondéré pour chaque catégorie et crée des fichiers séparés
 */
async function extractPonderedRankings() {
    // Liste des catégories à traiter
    const categories = ['jockeys', 'chevaux', 'entraineurs', 'eleveurs', 'proprietaires'];
    const date = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    
    console.log(`Extraction des classements pondérés pour le ${date}`);
    
    // Créer le répertoire data s'il n'existe pas
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`Répertoire créé: ${dataDir}`);
    }
    
    // Traiter chaque catégorie séparément
    for (const category of categories) {
        try {
            console.log(`Traitement de la catégorie: ${category}`);
            
            // Chemin du fichier source
            const sourceFilePath = path.join(dataDir, `${category}.json`);
            
            // Vérifier si le fichier source existe
            if (!fs.existsSync(sourceFilePath)) {
                console.warn(`Fichier source non trouvé: ${sourceFilePath}`);
                continue;
            }
            
            // Charger les données depuis le fichier JSON original
            const rawData = fs.readFileSync(sourceFilePath, 'utf8');
            const data = JSON.parse(rawData);
            
            if (!data.resultats || !Array.isArray(data.resultats)) {
                console.warn(`Données invalides pour ${category}, fichier ignoré`);
                continue;
            }
            
            // IMPORTANT: Nous utilisons directement les rangs pondérés déjà calculés
            // dans vos données, sans recalculer
            const rankings = data.resultats
                .filter(item => item.Rang !== undefined)
                .map(item => {
                    const nameField = category === 'chevaux' ? 'Nom' : 'NomPostal';
                    return {
                        nom: item[nameField] || 'Inconnu',
                        rang: parseInt(item.Rang)
                    };
                });
                
            console.log(`${rankings.length} rangs extraits pour ${category}`);
            
            // Créer un objet avec métadonnées pour chaque fichier JSON
            const output = {
                metadata: {
                    category: category,
                    date_extraction: date,
                    description: `Classement pondéré ${category} pour score prédictif`,
                    nombre_items: rankings.length
                },
                rangs: rankings
            };
            
            // Générer le fichier JSON
            const jsonOutput = JSON.stringify(output, null, 2);
            
            // Écrire le fichier de sortie
            const outputFilePath = path.join(dataDir, `ranking-${category}.json`);
            fs.writeFileSync(outputFilePath, jsonOutput, 'utf8');
            
            console.log(`Fichier créé: ${outputFilePath}`);
            
        } catch (error) {
            console.error(`Erreur lors de l'extraction pour ${category}:`, error);
        }
    }
    
    console.log("Extraction terminée avec succès!");
}

// Lancer l'extraction
extractPonderedRankings().catch(console.error);
