// Script d'extraction des classements pondérés pour classement.html

function extractPonderedRankings() {
    // Vérifie si les données sont disponibles
    if (!window.allData || Object.keys(window.allData).length === 0) {
        alert("Les données ne sont pas encore chargées. Veuillez attendre le chargement complet de la page et cliquer sur tous les onglets.");
        return;
    }
    
    const categories = ['jockeys', 'chevaux', 'entraineurs', 'eleveurs', 'proprietaires'];
    const date = new Date().toLocaleDateString('fr-FR'); // Format DD/MM/YYYY
    
    console.log(`Extraction des classements pondérés pour le ${date}`);
    
    // Extraire le classement pour chaque catégorie
    for (const category of categories) {
        try {
            console.log(`Traitement de la catégorie: ${category}`);
            
            // Vérifier si les données de cette catégorie sont disponibles
            if (!window.allData[category] || !Array.isArray(window.allData[category])) {
                console.warn(`Données non disponibles pour ${category}, veuillez d'abord cliquer sur cet onglet`);
                continue;
            }
            
            // Utiliser directement le classement pondéré calculé par classement.html
            // qui est stocké dans window.allData
            const rankings = window.allData[category]
                .map(item => {
                    const nameField = category === 'chevaux' ? 'Nom' : 'NomPostal';
                    return {
                        nom: item[nameField] || 'Inconnu',
                        rang: parseInt(item.Rang) // Le rang pondéré déjà calculé
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
            
            // Générer le fichier JSON et le télécharger
            const jsonOutput = JSON.stringify(output, null, 2);
            downloadJson(jsonOutput, `ranking-${category}.json`);
            
        } catch (error) {
            console.error(`Erreur lors de l'extraction pour ${category}:`, error);
        }
    }
    
    console.log("Extraction terminée avec succès!");
    alert("Extraction terminée! Les fichiers JSON ont été téléchargés.");
}

function downloadJson(content, filename) {
    const blob = new Blob([content], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Ajouter un bouton d'extraction au DOM
function addExtractionButton() {
    // Vérifier si le bouton existe déjà
    if (document.getElementById('extraction-button')) return;
    
    const button = document.createElement('button');
    button.id = 'extraction-button';
    button.textContent = "Extraire classements pondérés";
    button.style.position = "fixed";
    button.style.bottom = "20px";
    button.style.right = "20px";
    button.style.zIndex = "9999";
    button.style.padding = "10px 15px";
    button.style.background = "#D4AF37";
    button.style.color = "#0A2E2A";
    button.style.border = "none";
    button.style.borderRadius = "5px";
    button.style.fontWeight = "bold";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
    
    button.addEventListener('click', extractPonderedRankings);
    document.body.appendChild(button);
    
    console.log("Bouton d'extraction ajouté à la page");
}

// Exécuter après le chargement complet de la page
window.addEventListener('load', function() {
    // Attendre que les données soient chargées (généralement après quelques secondes)
    setTimeout(addExtractionButton, 3000);
    console.log("Script d'extraction chargé");
});