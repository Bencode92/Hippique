// Script pour extraire et télécharger les classements pondérés en ZIP
function extractAndCreateZip() {
    // Vérifier si les données sont disponibles
    if (!window.allData || Object.keys(window.allData).length === 0) {
        alert("Les données ne sont pas encore chargées. Veuillez attendre le chargement complet de la page et cliquer sur tous les onglets.");
        return;
    }
    
    // Afficher indicateur de progression
    const progressIndicator = document.createElement('div');
    progressIndicator.style.position = 'fixed';
    progressIndicator.style.top = '50%';
    progressIndicator.style.left = '50%';
    progressIndicator.style.transform = 'translate(-50%, -50%)';
    progressIndicator.style.padding = '20px';
    progressIndicator.style.backgroundColor = 'rgba(10, 46, 42, 0.95)';
    progressIndicator.style.color = '#F1E6C8';
    progressIndicator.style.borderRadius = '10px';
    progressIndicator.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
    progressIndicator.style.zIndex = '9999';
    progressIndicator.innerHTML = '<div style="text-align:center"><i class="fas fa-spinner fa-spin" style="font-size:2em; margin-bottom:10px; color:#D4AF37"></i><p>Traitement des classements pondérés...</p><div id="progress-status">Préparation des données...</div></div>';
    
    document.body.appendChild(progressIndicator);
    
    const updateStatus = (message) => {
        document.getElementById('progress-status').textContent = message;
    };
    
    const categories = ['jockeys', 'chevaux', 'entraineurs', 'eleveurs', 'proprietaires'];
    const date = new Date().toLocaleDateString('fr-FR');
    const files = [];
    
    // Préparer les données pour toutes les catégories
    for (const category of categories) {
        updateStatus(`Traitement de la catégorie: ${category}...`);
        
        if (!window.allData[category] || !Array.isArray(window.allData[category])) {
            continue;
        }
        
        // Extraire les données de classement
        const rankings = window.allData[category].map(item => {
            const nameField = category === 'chevaux' ? 'Nom' : 'NomPostal';
            return {
                nom: item[nameField] || 'Inconnu',
                rang: parseInt(item.Rang) // Le rang pondéré déjà calculé
            };
        });
        
        // Créer l'objet JSON
        const output = {
            metadata: {
                category: category,
                date_extraction: date,
                description: `Classement pondéré ${category} pour score prédictif`,
                nombre_items: rankings.length
            },
            rangs: rankings
        };
        
        // Ajouter à la liste des fichiers
        files.push({
            name: `ranking-${category}.json`,
            content: JSON.stringify(output, null, 2)
        });
    }
    
    updateStatus("Préparation de l'archive ZIP...");
    
    // Fonction pour créer une archive ZIP contenant tous les fichiers
    const createZipArchive = async () => {
        // Charger les bibliothèques nécessaires
        const loadScript = (url) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };
        
        try {
            // Charger JSZip si nécessaire
            if (typeof JSZip === 'undefined') {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
            }
            
            const zip = new JSZip();
            
            // Ajouter chaque fichier à l'archive
            files.forEach(file => {
                zip.file(file.name, file.content);
            });
            
            // Générer l'archive ZIP
            const blob = await zip.generateAsync({type: 'blob'});
            
            // Télécharger l'archive
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `rankings-${date.replace(/\//g, '-')}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
            
            // Afficher confirmation
            updateStatus("Téléchargement de l'archive ZIP...");
            
            // Fermer l'indicateur après un délai
            setTimeout(() => {
                if (progressIndicator.parentNode) {
                    document.body.removeChild(progressIndicator);
                }
                alert("Extraction terminée! L'archive ZIP contenant tous les fichiers a été téléchargée. Vous pouvez maintenant extraire ces fichiers et les téléverser dans votre dépôt GitHub.");
            }, 2000);
            
        } catch (error) {
            console.error("Erreur lors de la création de l'archive:", error);
            updateStatus("Erreur lors de la création de l'archive. Téléchargement des fichiers individuels...");
            
            // En cas d'erreur, télécharger les fichiers individuellement
            files.forEach(file => {
                const blob = new Blob([file.content], {type: 'application/json'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(a.href);
            });
            
            // Fermer l'indicateur après un délai
            setTimeout(() => {
                if (progressIndicator.parentNode) {
                    document.body.removeChild(progressIndicator);
                }
                alert("Extraction terminée! Les fichiers JSON ont été téléchargés individuellement.");
            }, 2000);
        }
    };
    
    // Démarrer la création de l'archive ZIP
    createZipArchive();
}

// Ajouter un bouton avec le style et la position souhaités
function addExtractionButtonZip() {
    // S'assurer que le bouton n'existe pas déjà
    if (document.getElementById('extraction-button-zip')) return;
    
    const button = document.createElement('button');
    button.id = 'extraction-button-zip';
    button.innerHTML = '<i class="fas fa-file-archive"></i> Exporter ZIP des classements';
    button.style.position = "fixed";
    button.style.bottom = "70px"; // Au-dessus du bouton existant
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
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.gap = "8px";
    
    button.addEventListener('click', extractAndCreateZip);
    document.body.appendChild(button);
}

// Exécuter après le chargement complet de la page
window.addEventListener('load', function() {
    // Attendre que les données soient chargées
    setTimeout(addExtractionButtonZip, 3000);
});
