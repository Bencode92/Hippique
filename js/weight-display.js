/**
 * Module d'affichage pour les indicateurs de poids
 * Ce module complète le système de pondération en ajoutant 
 * des éléments visuels pour représenter l'impact du poids
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log("Module d'affichage du poids chargé");
    
    // Fonction pour générer un indicateur de poids
    function createWeightIndicator(weight, averageWeight) {
        if (!weight || !averageWeight) return '';
        
        // Extraire la valeur numérique du poids
        const extractWeight = (weightStr) => {
            if (!weightStr) return null;
            const str = String(weightStr);
            const weightMatch = str.match(/(\d+)/);
            return weightMatch ? parseInt(weightMatch[1]) : null;
        };
        
        const weightValue = extractWeight(weight);
        if (!weightValue) return '';
        
        // Calculer l'écart avec la moyenne
        const diff = weightValue - averageWeight;
        
        // Déterminer la classe CSS en fonction de l'écart
        let weightClass = 'weight-neutral';
        let weightLabel = `${weightValue}kg (±0)`;
        
        if (diff <= -2) {
            weightClass = 'weight-heavy-minus';
            weightLabel = `${weightValue}kg (-${Math.abs(diff)})`;
        } else if (diff <= -1) {
            weightClass = 'weight-light-minus';
            weightLabel = `${weightValue}kg (-${Math.abs(diff)})`;
        } else if (diff >= 2) {
            weightClass = 'weight-heavy-plus';
            weightLabel = `${weightValue}kg (+${diff})`;
        } else if (diff >= 1) {
            weightClass = 'weight-light-plus';
            weightLabel = `${weightValue}kg (+${diff})`;
        } else {
            weightLabel = `${weightValue}kg (±0)`;
        }
        
        // Créer l'élément HTML
        return `<span class="weight-indicator ${weightClass}">${weightLabel}</span>`;
    }
    
    // Observer les changements dans les tableaux participants pour y ajouter les indicateurs
    const observeParticipantsTables = () => {
        // Fonction qui traite un tableau participants lorsqu'il apparaît
        const processParticipantsTable = (tbody) => {
            if (!tbody || !tbody.rows || tbody.rows.length === 0) return;
            
            // D'abord, calculer le poids moyen
            let totalWeight = 0;
            let weightCount = 0;
            
            // Première passe : collecter les poids
            for (let i = 0; i < tbody.rows.length; i++) {
                const row = tbody.rows[i];
                const poidsCell = row.cells[row.cells.length - 2]; // Avant-dernière colonne (Poids)
                
                if (poidsCell) {
                    const poidsText = poidsCell.textContent.trim();
                    const poidsMatch = poidsText.match(/(\d+)\s*kg/i);
                    
                    if (poidsMatch) {
                        const poids = parseInt(poidsMatch[1]);
                        if (!isNaN(poids)) {
                            totalWeight += poids;
                            weightCount++;
                        }
                    }
                }
            }
            
            // Calculer la moyenne si des poids ont été trouvés
            if (weightCount === 0) return;
            
            const averageWeight = Math.round(totalWeight / weightCount);
            
            // Deuxième passe : ajouter les indicateurs
            for (let i = 0; i < tbody.rows.length; i++) {
                const row = tbody.rows[i];
                const poidsCell = row.cells[row.cells.length - 2]; // Avant-dernière colonne (Poids)
                
                if (poidsCell) {
                    const poidsText = poidsCell.textContent.trim();
                    // Ne pas ajouter si un indicateur est déjà présent
                    if (poidsCell.querySelector('.weight-indicator')) continue;
                    
                    // Créer et ajouter l'indicateur
                    const indicator = createWeightIndicator(poidsText, averageWeight);
                    if (indicator) {
                        poidsCell.innerHTML = `${poidsText} ${indicator}`;
                    }
                }
            }
            
            // Ajouter une ligne d'information sur le poids moyen
            const infoRow = document.createElement('tr');
            infoRow.classList.add('weight-info-row');
            
            // Compter le nombre de cellules dans le tableau
            const cellCount = tbody.rows[0] ? tbody.rows[0].cells.length : 8;
            
            infoRow.innerHTML = `
                <td colspan="${cellCount}" style="text-align: right; padding-right: 20px; font-style: italic; color: var(--accent);">
                    <i class="fas fa-weight"></i> Poids moyen du peloton: <strong>${averageWeight}kg</strong>
                    <span style="margin-left: 15px; font-size: 0.9em; color: var(--light-gold);">
                        (La pondération du poids représente 10% du score prédictif)
                    </span>
                </td>
            `;
            
            // Vérifier si l'info-row existe déjà
            const existingInfoRow = tbody.querySelector('.weight-info-row');
            if (!existingInfoRow) {
                tbody.appendChild(infoRow);
            }
        };
        
        // Observer les changements dans le DOM pour attraper de nouveaux tableaux
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // Pour chaque nœud ajouté
                if (mutation.addedNodes) {
                    mutation.addedNodes.forEach(function(node) {
                        // Si c'est un élément HTML
                        if (node.nodeType === 1) {
                            // Chercher les tableaux de participants à l'intérieur
                            const tables = node.querySelectorAll('table.participants-table tbody');
                            tables.forEach(processParticipantsTable);
                            
                            // Si le nœud lui-même est un tbody
                            if (node.tagName === 'TBODY' && node.parentNode.classList.contains('participants-table')) {
                                processParticipantsTable(node);
                            }
                        }
                    });
                }
            });
        });
        
        // Observer le document entier
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Traiter les tableaux existants
        document.querySelectorAll('table.participants-table tbody').forEach(processParticipantsTable);
    };
    
    // Améliorer les tooltips pour montrer des informations sur le poids
    const enhanceScoreTooltips = () => {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) {
                            // Chercher les score-details dans le nouveau nœud
                            const scoreDetails = node.querySelectorAll ? 
                                node.querySelectorAll('.score-details') : [];
                            
                            scoreDetails.forEach(detail => {
                                // Éviter de modifier les tooltips déjà traités
                                if (detail.dataset.weightEnhanced) return;
                                
                                const tooltip = detail.querySelector('.tooltip-content');
                                if (tooltip) {
                                    // Ajouter les informations sur le poids porté
                                    const weightInfo = document.createElement('p');
                                    weightInfo.innerHTML = `<strong>Poids porté:</strong> Facteur contextuel (10% du score total)`;
                                    tooltip.appendChild(weightInfo);
                                    
                                    // Marquer comme traité
                                    detail.dataset.weightEnhanced = 'true';
                                }
                            });
                        }
                    });
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    };
    
    // Démarrer les observateurs
    observeParticipantsTables();
    enhanceScoreTooltips();
});
