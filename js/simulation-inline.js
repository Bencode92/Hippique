/**
 * Module de simulation intégrée pour les paris hippiques
 * Permet de simuler des paris directement sur la page d'index
 * sans redirection vers la page de simulation.html
 */

document.addEventListener('DOMContentLoaded', function() {
    // Ajouter le HTML de la popup de simulation au document
    const simulationPopupHTML = `
        <div id="simulationPopup" class="simulation-popup">
            <div class="simulation-content">
                <div class="simulation-header">
                    <h3><i class="fas fa-calculator"></i> Simulation de paris</h3>
                    <button class="close-simulation">&times;</button>
                </div>
                
                <div class="strategy-toggle-container">
                    <div class="strategy-option active" data-strategy="dutch">
                        <div class="strategy-icon">🎯</div>
                        <div class="strategy-name">Dutch</div>
                        <div class="strategy-desc">Gain identique</div>
                    </div>

                    <div class="strategy-option" data-strategy="ev">
                        <div class="strategy-icon">💰</div>
                        <div class="strategy-name">EV</div>
                        <div class="strategy-desc">Gain maximisé</div>
                    </div>

                    <div class="strategy-option" data-strategy="midrange">
                        <div class="strategy-icon">⚖️</div>
                        <div class="strategy-name">Mid Range</div>
                        <div class="strategy-desc">Cotes médianes</div>
                    </div>

                    <div class="strategy-option" data-strategy="couple">
                        <div class="strategy-icon">2️⃣</div>
                        <div class="strategy-name">Couplé</div>
                        <div class="strategy-desc">Top 2 ordre/désordre</div>
                    </div>

                    <div class="strategy-option" data-strategy="tierce">
                        <div class="strategy-icon">3️⃣</div>
                        <div class="strategy-name">Tiercé</div>
                        <div class="strategy-desc">Top 3 ordre/désordre</div>
                    </div>

                    <div class="strategy-option" data-strategy="quinte">
                        <div class="strategy-icon">5️⃣</div>
                        <div class="strategy-name">Quinté+</div>
                        <div class="strategy-desc">Top 5</div>
                    </div>
                </div>
                
                <div class="midrange-params" id="midrangeParams" style="display: none;">
                    <div class="filter-controls">
                        <div class="filter-group">
                            <label>Nombre de favoris à exclure</label>
                            <input type="number" id="inlineExcludeLow" min="0" max="5" value="1">
                        </div>
                        <div class="filter-group">
                            <label>Nombre d'outsiders à exclure</label>
                            <input type="number" id="inlineExcludeHigh" min="0" max="5" value="1">
                        </div>
                    </div>
                </div>
                
                <div class="sim-form">
                    <div class="input-group">
                        <label for="inlineTotalBet">Montant total à miser (€)</label>
                        <input type="number" id="inlineTotalBet" value="50" min="1" step="1">
                    </div>
                    
                    <div class="input-group">
                        <label for="inlineMaxPerHorse">Mise maximale par cheval (€)</label>
                        <input type="number" id="inlineMaxPerHorse" value="30" min="1" step="1">
                    </div>
                    
                    <div class="input-group">
                        <label>Participants (classés par score prédictif)</label>
                        <div class="simulation-info">
                            <i class="fas fa-info-circle"></i> Les participants sont triés par leur score prédictif. Vous pouvez ajuster manuellement les cotes pour chaque cheval.
                        </div>
                    </div>
                    
                    <div class="horse-selection" id="horseSelection"></div>
                    
                    <div class="form-actions">
                        <button class="btn-action btn-calculate" id="inlineCalculateBets">
                            <i class="fas fa-calculator"></i> Calculer les stratégies optimales
                        </button>
                    </div>
                    
                    <div class="error-message" id="inlineErrorMessage" style="display: none;"></div>
                </div>
                
                <div class="result-container" id="inlineResultContainer" style="display: none;">
                    <div class="result-header">
                        <h4><i class="fas fa-check-circle"></i> Meilleures stratégies de paris</h4>
                    </div>
                    
                    <div class="result-summary">
                        <div class="result-item">
                            <div class="label">Gain net minimum garanti</div>
                            <div class="value positive" id="inlineMinGain">-</div>
                        </div>
                        <div class="result-item">
                            <div class="label">Gain net moyen attendu</div>
                            <div class="value positive" id="inlineAvgGain">-</div>
                        </div>
                        <div class="result-item">
                            <div class="label">Chevaux sélectionnés</div>
                            <div class="value" id="inlineSelectedHorses">-</div>
                        </div>
                        <div class="result-item">
                            <div class="label">Montant total misé</div>
                            <div class="value" id="inlineTotalStake">-</div>
                        </div>
                    </div>
                    
                    <div class="table-container">
                        <table class="bets-table">
                            <thead>
                                <tr>
                                    <th>Cheval</th>
                                    <th>Score</th>
                                    <th>Cote</th>
                                    <th>Mise (€)</th>
                                    <th>Gain brut (€)</th>
                                    <th>Gain net (€)</th>
                                </tr>
                            </thead>
                            <tbody id="inlineBetsTableBody">
                                <!-- Les lignes seront ajoutées dynamiquement -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Ajouter la popup au body s'elle n'existe pas déjà
    if (!document.getElementById('simulationPopup')) {
        document.body.insertAdjacentHTML('beforeend', simulationPopupHTML);
    }
    
    // Définir les variables root pour les couleurs des différentes stratégies
    const rootStyles = document.documentElement.style;
    if (!rootStyles.getPropertyValue('--ev-accent')) {
        rootStyles.setProperty('--ev-accent', '#3498db');
        rootStyles.setProperty('--ev-highlight', '#5dade2');
        rootStyles.setProperty('--midrange-accent', '#9b59b6');
        rootStyles.setProperty('--midrange-highlight', '#d678d3');
    }
    
    // Variables globales pour la simulation
    window.currentSimulationData = {
        participants: [],
        courseName: '',
        hippodrome: ''
    };
    
    // Algorithme Dutch Betting
    function calculateDutchBetting(horsesInput, totalBet, selectedHorses) {
        console.log("Exécution de l'algorithme Dutch Betting (pondéré par score)");
        const odds = selectedHorses.map(horseName => horsesInput[horseName]);

        // Récupérer les scores du modèle pour pondérer
        const scores = selectedHorses.map(name => {
            const p = window.currentSimulationData?.participants?.find(p => p.cheval === name);
            return p?.score || 50;
        });

        // Dutch pondéré : combine 1/cote (classique) + score modèle
        // Score élevé = on mise plus que ce que la cote seule suggère
        const maxScore = Math.max(...scores, 1);
        const invOdds = odds.map((o, i) => {
            const coteWeight = 1 / o;
            const scoreWeight = (scores[i] / maxScore); // 0-1
            return coteWeight * (0.6 + scoreWeight * 0.4); // 60% cote + 40% score
        });

        const totalInv = invOdds.reduce((a, b) => a + b, 0);
        const stakes = invOdds.map(inv => (inv / totalInv) * totalBet);
        const gainsBruts = stakes.map((stake, i) => stake * odds[i]);
        const gainsNets = gainsBruts.map(gain => gain - totalBet);

        const isRentable = gainsNets.every(g => g > 0);

        return {
            chevaux: selectedHorses,
            mises: stakes,
            cotes: odds,
            scores: scores,
            gains_bruts: gainsBruts,
            gains_net: gainsNets,
            gain_minimum: Math.min(...gainsNets),
            gain_moyen: gainsNets.reduce((a, b) => a + b, 0) / gainsNets.length,
            gain_maximum: Math.max(...gainsNets),
            rentable: isRentable,
            approche: "Dutch (score-pondéré)"
        };
    }
    
    // Algorithme d'optimisation EV
    function calculateEVOptimization(horsesInput, totalBet, maxPerHorse, selectedHorses) {
        console.log("Exécution de l'algorithme EV Optimization");
        const odds = selectedHorses.map(horseName => horsesInput[horseName]);
        const numHorses = selectedHorses.length;
        
        // Paramètres pour l'optimisation
        const STEP_SIZE = numHorses <= 2 ? 0.5 : (numHorses <= 3 ? 1 : 2);
        const MIN_STAKE = 1;
        
        // Variables pour stocker le meilleur résultat
        let bestGainMoyen = -Infinity;
        let bestStakes = [];
        let bestGainsBruts = [];
        let bestGainsNets = [];
        let iterations = 0;
        const MAX_ITERATIONS = 100000;
        
        // Fonction récursive pour trouver les meilleures mises
        function findBestStakes(currentHorse, remainingStake, currentStakes) {
            iterations++;
            if (iterations > MAX_ITERATIONS) return;
            
            if (currentHorse === numHorses - 1) {
                if (remainingStake > maxPerHorse) return;
                
                const finalStakes = [...currentStakes, remainingStake];
                const gainsBruts = finalStakes.map((stake, i) => stake * odds[i]);
                const gainsNets = gainsBruts.map(g => g - totalBet);
                
                if (!gainsNets.every(g => g > 0)) return;
                
                const gainMoyen = gainsNets.reduce((sum, g) => sum + g, 0) / numHorses;
                
                if (gainMoyen > bestGainMoyen) {
                    bestGainMoyen = gainMoyen;
                    bestStakes = finalStakes;
                    bestGainsBruts = gainsBruts;
                    bestGainsNets = gainsNets;
                }
                return;
            }
            
            let maxStake = remainingStake - MIN_STAKE * (numHorses - currentHorse - 1);
            maxStake = Math.min(maxStake, maxPerHorse);
            
            for (let stake = MIN_STAKE; stake <= maxStake; stake += STEP_SIZE) {
                findBestStakes(currentHorse + 1, remainingStake - stake, [...currentStakes, stake]);
            }
        }
        
        // Lancer l'optimisation
        findBestStakes(0, totalBet, []);
        
        // Vérifier si une solution a été trouvée
        const isRentable = bestGainMoyen > 0 && bestStakes.length > 0;
        
        if (!isRentable) {
            console.log("Aucune solution rentable trouvée avec EV Optimization");
            return {
                chevaux: selectedHorses,
                mises: [],
                cotes: odds,
                gains_bruts: [],
                gains_net: [],
                gain_minimum: 0,
                gain_moyen: 0,
                gain_maximum: 0,
                rentable: false,
                approche: "EV (Optimisé)"
            };
        }
        
        // Calculer les métriques
        const gainMin = Math.min(...bestGainsNets);
        const gainMax = Math.max(...bestGainsNets);
        console.log("Solution EV trouvée, gain moyen:", bestGainMoyen);
        
        return {
            chevaux: selectedHorses,
            mises: bestStakes,
            cotes: odds,
            gains_bruts: bestGainsBruts,
            gains_net: bestGainsNets,
            gain_minimum: gainMin,
            gain_moyen: bestGainMoyen,
            gain_maximum: gainMax,
            rentable: isRentable,
            approche: "EV (Optimisé)"
        };
    }
    
    // Algorithme Mid Range
    function calculateMidRange(horsesInput, totalBet, maxPerHorse, selectedHorses, excludeLow, excludeHigh) {
        console.log("Exécution de l'algorithme Mid Range avec", excludeLow, "favoris et", excludeHigh, "outsiders exclus");
        // Trier les chevaux par cote
        const sortedHorses = Object.entries(horsesInput)
            .sort(([, coteA], [, coteB]) => coteA - coteB)
            .map(([name]) => name);
        
        console.log("Chevaux triés par cote:", sortedHorses);
        
        // Exclure les favoris et outsiders
        const filteredHorses = sortedHorses.slice(excludeLow, sortedHorses.length - excludeHigh);
        console.log("Chevaux retenus après filtrage:", filteredHorses);
        
        // Si pas assez de chevaux après filtrage
        if (filteredHorses.length < 2) {
            console.log("Pas assez de chevaux après filtrage Mid Range");
            return {
                chevaux: [],
                mises: [],
                cotes: [],
                gains_bruts: [],
                gains_net: [],
                gain_minimum: 0,
                gain_moyen: 0,
                gain_maximum: 0,
                rentable: false,
                approche: "Mid Range",
                filtrage: `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`
            };
        }
        
        // Utiliser les chevaux filtrés pour l'optimisation EV
        const midRangeHorsesInput = {};
        filteredHorses.forEach(name => {
            midRangeHorsesInput[name] = horsesInput[name];
        });
        
        // Utiliser l'algo EV sur les chevaux médians
        const result = calculateEVOptimization(midRangeHorsesInput, totalBet, maxPerHorse, filteredHorses);
        
        // Ajouter l'info de filtrage
        result.approche = "Mid Range";
        result.filtrage = `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`;
        
        return result;
    }
    
    // Fonction pour ouvrir la popup de simulation
    function openSimulationPopup(hippodrome, courseName, participantsContainer, detailId) {
        const popup = document.getElementById('simulationPopup');
        if (!popup) {
            console.error("Popup de simulation non trouvée");
            return;
        }
        
        // Récupérer les données des participants et leurs scores prédictifs
        const rows = participantsContainer.querySelectorAll('tr');
        const participants = [];
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 8) return;
            
            const numero = cells[0].querySelector('.horse-number') ? 
                cells[0].querySelector('.horse-number').textContent.trim() : '';
            const cheval = cells[1].textContent.trim();
            
            // Extraire le score prédictif (colonne 6)
            let score = 0;
            const scoreCell = cells[6];
            if (scoreCell) {
                // Chercher le score dans le span bold ou directement dans le texte
                const scoreSpan = scoreCell.querySelector('span[style*="font-weight"]');
                if (scoreSpan) {
                    score = parseFloat(scoreSpan.textContent.trim());
                } else {
                    score = parseFloat(row.dataset.score || 0);
                }
            }
            
            // Récupérer la cote depuis le data-attribute du tr ou la cellule cote
            let cote = 0;

            // 1. Depuis data-cote du <tr>
            if (row.dataset.cote) {
                cote = parseFloat(row.dataset.cote);
            }

            // 2. Depuis la cellule cote (colonne 5)
            if (!cote || isNaN(cote) || cote <= 1) {
                const coteCellText = cells[5]?.textContent?.trim() || '';
                const coteMatch = coteCellText.match(/^([\d.]+)/);
                if (coteMatch) cote = parseFloat(coteMatch[1]);
            }

            // 3. Fallback : estimer depuis le score
            if (!cote || isNaN(cote) || cote <= 1) {
                const normalizedScore = Math.max(0, Math.min(100, score)) / 100;
                cote = Math.round((1.5 + (1 - normalizedScore) * 18.5) * 10) / 10;
            }
            
            participants.push({
                numero: numero,
                cheval: cheval,
                score: score,
                cote: cote
            });
        });
        
        // Trier les participants par score prédictif décroissant
        participants.sort((a, b) => b.score - a.score);
        
        // Stocker les données pour la simulation
        window.currentSimulationData = {
            participants: participants,
            courseName: courseName,
            hippodrome: hippodrome,
            detailId: detailId
        };
        
        console.log("Données de simulation préparées:", window.currentSimulationData);
        
        // Générer la liste des participants sélectionnables
        generateHorseSelection(participants);
        
        // Réinitialiser la stratégie à Dutch (par défaut)
        document.querySelectorAll('.strategy-option').forEach(opt => {
            opt.classList.remove('active');
        });
        document.querySelector('.strategy-option[data-strategy="dutch"]').classList.add('active');
        
        // Réinitialiser les styles de la popup
        popup.className = 'simulation-popup';
        
        // Masquer les paramètres Mid Range par défaut
        const midrangeParams = document.getElementById('midrangeParams');
        if (midrangeParams) {
            midrangeParams.style.display = 'none';
        }
        
        // Réinitialiser l'affichage des résultats
        const resultContainer = document.getElementById('inlineResultContainer');
        const errorMessage = document.getElementById('inlineErrorMessage');
        if (resultContainer) resultContainer.style.display = 'none';
        if (errorMessage) errorMessage.style.display = 'none';
        
        // Afficher la popup
        popup.style.display = 'block';
        
        // Mettre à jour le titre
        const popupTitle = popup.querySelector('.simulation-header h3');
        if (popupTitle) {
            popupTitle.innerHTML = `<i class="fas fa-calculator"></i> Simulation de paris - ${courseName}`;
        }
    }
    
    // Fonction pour générer la liste des participants sélectionnables
    function generateHorseSelection(participants) {
        const selectionContainer = document.getElementById('horseSelection');
        if (!selectionContainer) {
            console.error("Conteneur de sélection des chevaux non trouvé");
            return;
        }
        
        let html = '';
        
        participants.forEach((participant, index) => {
            const isChecked = index < 5; // Sélectionner les 5 premiers par défaut
            html += `
                <div class="horse-checkbox-item">
                    <input type="checkbox" id="horse-${index}" class="horse-select-checkbox" value="${index}" ${isChecked ? 'checked' : ''}>
                    <label for="horse-${index}" class="horse-select-label">
                        <strong>${participant.cheval}</strong> (${participant.numero})
                        <div class="horse-select-meta">
                            <span class="score-badge">Score: ${participant.score.toFixed(1)}</span>
                            <div class="cote-input-container">
                                <span>Cote:</span>
                                <input type="number" class="manual-odds-input" 
                                      data-index="${index}" 
                                      value="${participant.cote.toFixed(2)}" 
                                      min="1.01" step="0.01">
                            </div>
                        </div>
                    </label>
                </div>
            `;
        });
        
        selectionContainer.innerHTML = html;
        
        // Ajouter les écouteurs d'événements pour les inputs de cotes
        document.querySelectorAll('.manual-odds-input').forEach(input => {
            input.addEventListener('change', function() {
                const index = parseInt(this.dataset.index);
                const newOdds = parseFloat(this.value);
                
                // Valider la cote (minimum 1.01)
                if (isNaN(newOdds) || newOdds < 1.01) {
                    this.value = "1.01";
                    window.currentSimulationData.participants[index].cote = 1.01;
                } else {
                    window.currentSimulationData.participants[index].cote = newOdds;
                }
            });
        });
    }
    
    // Fonction pour fermer la popup
    function closeSimulationPopup() {
        const popup = document.getElementById('simulationPopup');
        if (popup) {
            popup.style.display = 'none';
        }
    }
    
    // Fonction pour calculer les paris
    // Paris français : Couplé (2), Tiercé (3), Quinté+ (5)
    function calculateParisFrancais(type, participants, totalBet) {
        const nbPicks = type === 'couple' ? 2 : type === 'tierce' ? 3 : 5;
        const typeName = type === 'couple' ? 'Couplé' : type === 'tierce' ? 'Tiercé' : 'Quinté+';

        if (participants.length < nbPicks) {
            return { rentable: false };
        }

        // Trier par score (nos meilleurs picks)
        const sorted = [...participants].sort((a, b) => b.score - a.score);
        const picks = sorted.slice(0, nbPicks);

        // Calculer les probas approximatives (basées sur 1/cote normalisé)
        const totalProba = participants.reduce((s, p) => s + (p.cote > 1 ? 1/p.cote : 0), 0);
        picks.forEach(p => {
            p.probaWin = p.cote > 1 ? (1/p.cote) / totalProba : 0.05;
        });

        // Estimation gains pour chaque type
        let gainEstime, miseParCombi;
        const nbCombisOrdre = factorial(nbPicks);
        const nbCombisDesordre = 1;

        if (type === 'couple') {
            // Couplé ordre : mise de base × (cote1 × cote2)
            // Couplé désordre : mise de base × (cote1 × cote2 / 2)
            const rapportOrdre = picks[0].cote * picks[1].cote * 0.7; // PMU prélève ~30%
            const rapportDesordre = rapportOrdre / 2;
            miseParCombi = Math.round(totalBet / 3 * 100) / 100; // 1/3 ordre, 2/3 désordre
            gainEstime = {
                ordre: miseParCombi * rapportOrdre,
                desordre: miseParCombi * 2 * rapportDesordre,
            };
        } else if (type === 'tierce') {
            const rapportOrdre = picks[0].cote * picks[1].cote * picks[2].cote * 0.6;
            const rapportDesordre = rapportOrdre / 6;
            miseParCombi = Math.round(totalBet / 4 * 100) / 100;
            gainEstime = {
                ordre: miseParCombi * rapportOrdre,
                desordre: miseParCombi * 3 * rapportDesordre,
            };
        } else {
            // Quinté+
            const rapportOrdre = picks.reduce((p, h) => p * h.cote, 1) * 0.5;
            const rapportDesordre = rapportOrdre / 120;
            miseParCombi = Math.round(totalBet / 2 * 100) / 100;
            gainEstime = {
                ordre: miseParCombi * rapportOrdre,
                desordre: miseParCombi * rapportDesordre,
            };
        }

        // Proba de réussite approximative
        const probaOrdre = picks.reduce((p, h) => p * h.probaWin, 1);
        const probaDesordre = probaOrdre * factorial(nbPicks);

        return {
            rentable: true,
            strategy: typeName,
            picks: picks,
            nbPicks: nbPicks,
            totalStake: totalBet,
            gainEstime: gainEstime,
            probaOrdre: (probaOrdre * 100).toFixed(2),
            probaDesordre: (probaDesordre * 100).toFixed(1),
            bestStakes: picks.map(p => ({
                horse: p.cheval,
                odds: p.cote,
                score: p.score,
                stake: Math.round(totalBet / nbPicks * 100) / 100,
                gain_net: 0
            })),
            gain_minimum: 0,
            gain_moyen: (gainEstime.desordre * probaDesordre - totalBet).toFixed(0),
        };
    }

    function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }

    function calculateBets() {
        console.log("Lancement du calcul des paris");
        const errorMessage = document.getElementById('inlineErrorMessage');
        const resultContainer = document.getElementById('inlineResultContainer');
        
        if (!errorMessage || !resultContainer) {
            console.error("Éléments d'UI manquants pour afficher les résultats");
            return;
        }
        
        try {
            // Récupérer les paramètres
            const totalBet = parseFloat(document.getElementById('inlineTotalBet').value);
            const maxPerHorse = parseFloat(document.getElementById('inlineMaxPerHorse').value);
            
            // Validation
            if (isNaN(totalBet) || totalBet <= 0) {
                throw new Error('Le montant total doit être un nombre positif');
            }
            if (isNaN(maxPerHorse) || maxPerHorse <= 0) {
                throw new Error('La mise maximale par cheval doit être un nombre positif');
            }
            
            // Récupérer les cotes mises à jour manuellement
            const manualOddsInputs = document.querySelectorAll('.manual-odds-input');
            manualOddsInputs.forEach(input => {
                const index = parseInt(input.dataset.index);
                const newOdds = parseFloat(input.value);
                if (!isNaN(newOdds) && newOdds >= 1.01) {
                    window.currentSimulationData.participants[index].cote = newOdds;
                }
            });
            
            // Obtenir la stratégie sélectionnée EN PREMIER
            const strategyOption = document.querySelector('.strategy-option.active');
            if (!strategyOption) {
                throw new Error('Aucune stratégie sélectionnée');
            }
            const strategy = strategyOption.dataset.strategy;
            console.log(`Stratégie sélectionnée: ${strategy}`);

            // Récupérer les chevaux sélectionnés
            const checkboxes = document.querySelectorAll('.horse-select-checkbox:checked');
            const minChevaux = (strategy === 'couple') ? 2 : (strategy === 'tierce') ? 3 : (strategy === 'quinte') ? 5 : 2;
            if (checkboxes.length < minChevaux) {
                throw new Error(`Vous devez sélectionner au moins ${minChevaux} chevaux pour ${strategy}`);
            }

            // Récupérer les indices des chevaux sélectionnés
            const selectedIndices = Array.from(checkboxes).map(checkbox =>
                parseInt(checkbox.value)
            );

            // Obtenir les participants correspondants
            const selectedParticipants = selectedIndices.map(index =>
                window.currentSimulationData.participants[index]
            );

            // Préparer les entrées pour la simulation
            const horsesInput = {};
            selectedParticipants.forEach(p => {
                horsesInput[p.cheval] = p.cote;
            });

            const selectedHorses = selectedParticipants.map(p => p.cheval);
            
            // Variables pour Mid Range
            let excludeLow = 0;
            let excludeHigh = 0;
            
            if (strategy === 'midrange') {
                const excludeLowInput = document.getElementById('inlineExcludeLow');
                const excludeHighInput = document.getElementById('inlineExcludeHigh');
                
                if (!excludeLowInput || !excludeHighInput) {
                    console.error("Champs de filtrage Mid Range non trouvés");
                    throw new Error("Configuration Mid Range incomplète");
                }
                
                excludeLow = parseInt(excludeLowInput.value) || 0;
                excludeHigh = parseInt(excludeHighInput.value) || 0;
                
                // Vérifier que les exclusions sont valides
                if (excludeLow + excludeHigh >= selectedHorses.length) {
                    throw new Error(`Vous excluez ${excludeLow + excludeHigh} chevaux sur ${selectedHorses.length}. Il doit rester au moins 2 chevaux.`);
                }
            }
            
            // Effectuer le calcul selon la stratégie
            let result;
            
            if (strategy === 'dutch') {
                result = calculateDutchBetting(horsesInput, totalBet, selectedHorses);
            } else if (strategy === 'ev') {
                result = calculateEVOptimization(horsesInput, totalBet, maxPerHorse, selectedHorses);
            } else if (strategy === 'midrange') {
                result = calculateMidRange(horsesInput, totalBet, maxPerHorse, selectedHorses, excludeLow, excludeHigh);
            } else if (strategy === 'couple' || strategy === 'tierce' || strategy === 'quinte') {
                result = calculateParisFrancais(strategy, selectedParticipants, totalBet);
            } else {
                throw new Error(`Stratégie non reconnue: ${strategy}`);
            }
            
            // Vérifier si une solution rentable a été trouvée
            if (!result.rentable) {
                throw new Error(`Aucune combinaison rentable trouvée avec la stratégie ${strategy}. Essayez d'augmenter le montant total ou de changer de stratégie.`);
            }

            // Afficher les résultats
            if (strategy === 'couple' || strategy === 'tierce' || strategy === 'quinte') {
                displayResultsParisFrancais(result, totalBet);
            } else {
                displayResults(result, totalBet, selectedParticipants);
            }
            
            // Cacher le message d'erreur et afficher les résultats
            errorMessage.style.display = 'none';
            resultContainer.style.display = 'block';
            
            // Scroller jusqu'aux résultats
            resultContainer.scrollIntoView({ behavior: 'smooth' });
            
        } catch (error) {
            // Afficher l'erreur
            console.error("Erreur lors du calcul:", error);
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
            resultContainer.style.display = 'none';
        }
    }
    
    // Fonction pour afficher les résultats
    function displayResultsParisFrancais(result, totalBet) {
        const resultContainer = document.getElementById('inlineResultContainer');
        if (!resultContainer) return;

        const picks = result.picks;
        const picksHTML = picks.map((p, i) => `
            <tr>
                <td style="font-weight:600">${i + 1}</td>
                <td>${p.cheval}</td>
                <td style="color:#40E0D0;font-weight:600">${p.cote}</td>
                <td>${p.score?.toFixed(1) || '-'}</td>
            </tr>
        `).join('');

        resultContainer.innerHTML = `
            <div style="background:rgba(0,0,0,0.2);border-radius:10px;padding:16px;margin-top:12px">
                <h4 style="color:var(--gold);margin-bottom:12px">
                    ${result.strategy} — Nos ${result.nbPicks} meilleurs
                </h4>

                <table style="width:100%;border-collapse:collapse;font-size:0.9em">
                    <thead>
                        <tr style="opacity:0.7">
                            <th style="text-align:left;padding:4px">#</th>
                            <th style="text-align:left;padding:4px">Cheval</th>
                            <th style="text-align:left;padding:4px">Cote</th>
                            <th style="text-align:left;padding:4px">Score</th>
                        </tr>
                    </thead>
                    <tbody>${picksHTML}</tbody>
                </table>

                <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85em">
                        <div>
                            <span style="opacity:0.7">Mise totale</span><br>
                            <strong>${totalBet.toFixed(2)} €</strong>
                        </div>
                        <div>
                            <span style="opacity:0.7">Proba dans l'ordre</span><br>
                            <strong style="color:#e05a40">${result.probaOrdre}%</strong>
                        </div>
                        <div>
                            <span style="opacity:0.7">Gain estimé (ordre)</span><br>
                            <strong style="color:#40e05a">${result.gainEstime.ordre.toFixed(0)} €</strong>
                        </div>
                        <div>
                            <span style="opacity:0.7">Gain estimé (désordre)</span><br>
                            <strong style="color:#D4AF37">${result.gainEstime.desordre.toFixed(0)} €</strong>
                        </div>
                        <div>
                            <span style="opacity:0.7">Proba désordre</span><br>
                            <strong style="color:#40E0D0">${result.probaDesordre}%</strong>
                        </div>
                    </div>
                </div>

                <div style="margin-top:12px;font-size:0.8em;opacity:0.6">
                    Estimation basée sur les cotes actuelles. Prélèvement PMU inclus (~30%).
                    Les gains réels dépendent des rapports définitifs au départ.
                </div>
            </div>
        `;

        resultContainer.style.display = 'block';
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function displayResults(result, totalBet, selectedParticipants) {
        // Mettre à jour les valeurs de résumé (avec checks null)
        const elMinGain = document.getElementById('inlineMinGain');
        const elAvgGain = document.getElementById('inlineAvgGain');
        const elSelected = document.getElementById('inlineSelectedHorses');
        const elStake = document.getElementById('inlineTotalStake');
        if (elMinGain) elMinGain.textContent = `+${(result.gain_minimum || 0).toFixed(2)} €`;
        if (elAvgGain) elAvgGain.textContent = `+${(result.gain_moyen || 0).toFixed(2)} €`;
        if (elSelected) elSelected.textContent = result.chevaux?.length || 0;
        if (elStake) elStake.textContent = `${totalBet.toFixed(2)} €`;
        
        // Créer une map des participants par nom de cheval pour un accès facile
        const participantsMap = {};
        selectedParticipants.forEach(p => {
            participantsMap[p.cheval] = p;
        });
        
        // Remplir le tableau des paris
        const betsTableBody = document.getElementById('inlineBetsTableBody');
        if (!betsTableBody) {
            console.error("Conteneur de tableau des paris non trouvé");
            return;
        }
        
        betsTableBody.innerHTML = '';
        
        result.chevaux.forEach((cheval, i) => {
            const participant = participantsMap[cheval];
            const row = document.createElement('tr');
            const gainNet = result.gains_net[i];
            const gainClass = gainNet > 0 ? 'positive' : 'negative';
            
            row.innerHTML = `
                <td>${cheval} (#${participant.numero || '-'})</td>
                <td>${participant.score.toFixed(1)}</td>
                <td>${result.cotes[i].toFixed(2)}</td>
                <td>${result.mises[i].toFixed(2)} €</td>
                <td>${result.gains_bruts[i].toFixed(2)} €</td>
                <td class="${gainClass}">${gainNet > 0 ? '+' : ''}${gainNet.toFixed(2)} €</td>
            `;
            betsTableBody.appendChild(row);
        });
        
        // Ajouter le nom de l'approche au titre
        const resultHeader = document.querySelector('.result-header h4');
        if (resultHeader) {
            let titre = `<i class="fas fa-check-circle"></i> Meilleure stratégie de paris - ${result.approche}`;
            if (result.filtrage) {
                titre += ` (${result.filtrage})`;
            }
            resultHeader.innerHTML = titre;
        }
    }
    
    // Fonction pour intercepter les boutons "Simuler des paris"
    function setupSimulationButtonInterceptors() {
        // Observer les modifications du DOM pour attraper les nouveaux boutons
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { // Element node
                            // Rechercher les boutons dans les nouveaux nœuds
                            const simulateButtons = node.querySelectorAll ? 
                                node.querySelectorAll('.action-btn.secondary') : [];
                            
                            simulateButtons.forEach(button => {
                                if (button.textContent.includes('Simuler des paris')) {
                                    // Remplacer l'événement par défaut
                                    button.addEventListener('click', function(e) {
                                        e.preventDefault();
                                        
                                        // Trouver la section de détails parente
                                        const detailsSection = button.closest('.course-details');
                                        if (!detailsSection) return;
                                        
                                        // Récupérer l'ID de détail
                                        const detailId = detailsSection.id;
                                        
                                        // Récupérer le conteneur des participants
                                        const participantsContainer = detailsSection.querySelector('tbody');
                                        if (!participantsContainer) return;
                                        
                                        // Récupérer les infos de la course
                                        const courseName = detailsSection.querySelector('.course-details-title').textContent.trim();
                                        const hippodrome = detailsSection.querySelector('.info-value').textContent.trim();
                                        
                                        // Ouvrir la popup de simulation
                                        openSimulationPopup(hippodrome, courseName, participantsContainer, detailId);
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
        
        // Observer le conteneur des résultats
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) {
            observer.observe(resultsContainer, { childList: true, subtree: true });
        }
        
        // Écouter les clics sur les boutons existants
        document.addEventListener('click', function(e) {
            if (e.target && (
                e.target.matches('.action-btn.secondary') || 
                e.target.closest('.action-btn.secondary')
            )) {
                const button = e.target.matches('.action-btn.secondary') ? 
                    e.target : e.target.closest('.action-btn.secondary');
                
                if (button.textContent.includes('Simuler des paris')) {
                    e.preventDefault();
                    
                    // Trouver la section de détails parente
                    const detailsSection = button.closest('.course-details');
                    if (!detailsSection) return;
                    
                    // Récupérer l'ID de détail
                    const detailId = detailsSection.id;
                    
                    // Récupérer le conteneur des participants
                    const participantsContainer = detailsSection.querySelector('tbody');
                    if (!participantsContainer) return;
                    
                    // Récupérer les infos de la course
                    const courseName = detailsSection.querySelector('.course-details-title').textContent.trim();
                    const hippodrome = detailsSection.querySelector('.info-value').textContent.trim();
                    
                    // Ouvrir la popup de simulation
                    openSimulationPopup(hippodrome, courseName, participantsContainer, detailId);
                }
            }
        });
    }
    
    // Initialiser les gestionnaires d'événements
    function initEventHandlers() {
        // Fermeture de la popup
        const closeBtn = document.querySelector('.close-simulation');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeSimulationPopup);
        }
        
        // Clic en dehors de la popup pour fermer
        const popup = document.getElementById('simulationPopup');
        if (popup) {
            popup.addEventListener('click', function(e) {
                if (e.target === popup) {
                    closeSimulationPopup();
                }
            });
        }
        
        // Bouton de calcul
        const calculateBtn = document.getElementById('inlineCalculateBets');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', calculateBets);
        }
        
        // Options de stratégie
        const strategyOptions = document.querySelectorAll('.strategy-option');
        strategyOptions.forEach(option => {
            option.addEventListener('click', function() {
                console.log(`Changement de stratégie pour: ${this.dataset.strategy}`);
                
                // Mettre à jour l'apparence
                strategyOptions.forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
                
                // Mettre à jour le style de la popup
                const popup = document.getElementById('simulationPopup');
                if (!popup) return;
                
                popup.className = 'simulation-popup';
                
                // Vérifier quelle stratégie est active
                const strategy = this.dataset.strategy;
                const midrangeParams = document.getElementById('midrangeParams');
                
                if (strategy === 'ev') {
                    popup.classList.add('ev-mode');
                    if (midrangeParams) midrangeParams.style.display = 'none';
                } else if (strategy === 'midrange') {
                    popup.classList.add('midrange-mode');
                    if (midrangeParams) midrangeParams.style.display = 'block';
                } else {
                    if (midrangeParams) midrangeParams.style.display = 'none';
                }
            });
        });
    }
    
    // Initialiser l'intercepteur de boutons de simulation
    setupSimulationButtonInterceptors();
    
    // Initialiser les gestionnaires d'événements
    initEventHandlers();
    
    // Ajouter un indicateur que le module est bien chargé
    console.log("Module de simulation inline chargé avec succès");
});