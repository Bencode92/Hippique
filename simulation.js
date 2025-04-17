/**
 * Simulateur de paris optimaux pour les courses hippiques
 * Implémente trois algorithmes : Dutch betting classique, optimisation EV et Mid Range
 */

document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const horseEntriesContainer = document.getElementById('horseEntries');
    const horseCountInput = document.getElementById('horseCount');
    const clearFormButton = document.getElementById('clearForm');
    const loadExampleButton = document.getElementById('loadExample');
    const calculateButton = document.getElementById('calculateBets');
    const resultContainer = document.getElementById('resultContainer');
    const errorMessage = document.getElementById('errorMessage');
    const strategyToggle = document.getElementById('strategyToggle');
    
    // Nouveaux éléments pour Mid Range
    const strategyOptions = document.querySelectorAll('.strategy-option');
    const strategyTypeInput = document.getElementById('strategyType');
    const midrangeParams = document.getElementById('midrangeParams');
    const excludeLowInput = document.getElementById('excludeLow');
    const excludeHighInput = document.getElementById('excludeHigh');
    const comboSizesContainer = document.getElementById('comboSizes');
    
    // Éléments de résultat
    const minGainElement = document.getElementById('minGain');
    const avgGainElement = document.getElementById('avgGain');
    const selectedHorsesElement = document.getElementById('selectedHorses');
    const totalStakeElement = document.getElementById('totalStake');
    const betsTableBody = document.getElementById('betsTableBody');
    
    // État global pour la stratégie
    let currentStrategy = 'dutch'; // 'dutch', 'ev' ou 'midrange'
    
    // Paramètres Mid Range
    let excludeLow = 1;
    let excludeHigh = 1;
    let selectedComboSizes = [2, 3, 4, 5]; // Tailles de combinaison sélectionnées par défaut
    
    // Initialiser les contrôles Mid Range s'ils existent
    if (excludeLowInput && excludeHighInput) {
        excludeLowInput.addEventListener('change', function() {
            excludeLow = parseInt(this.value) || 0;
            
            // Recalculer si des résultats sont déjà affichés
            if (resultContainer.style.display === 'block' && currentStrategy === 'midrange') {
                calculateButton.click();
            }
        });
        
        excludeHighInput.addEventListener('change', function() {
            excludeHigh = parseInt(this.value) || 0;
            
            // Recalculer si des résultats sont déjà affichés
            if (resultContainer.style.display === 'block' && currentStrategy === 'midrange') {
                calculateButton.click();
            }
        });
    }
    
    // Initialiser le sélecteur de tailles de combinaison
    if (comboSizesContainer) {
        const comboSizeElements = comboSizesContainer.querySelectorAll('.combo-size');
        
        comboSizeElements.forEach(element => {
            element.addEventListener('click', function() {
                const size = parseInt(this.dataset.size);
                
                // Basculer l'état actif
                this.classList.toggle('active');
                
                // Mettre à jour la liste des tailles sélectionnées
                if (this.classList.contains('active')) {
                    if (!selectedComboSizes.includes(size)) {
                        selectedComboSizes.push(size);
                    }
                } else {
                    selectedComboSizes = selectedComboSizes.filter(s => s !== size);
                }
                
                // Trier les tailles dans l'ordre croissant
                selectedComboSizes.sort((a, b) => a - b);
                
                console.log("Tailles de combinaison sélectionnées:", selectedComboSizes);
                
                // Recalculer si des résultats sont déjà affichés
                if (resultContainer.style.display === 'block' && currentStrategy === 'midrange') {
                    calculateButton.click();
                }
            });
        });
    }
    
    // Gérer le changement de stratégie
    if (strategyOptions) {
        strategyOptions.forEach(option => {
            option.addEventListener('click', function() {
                const strategy = this.dataset.strategy;
                
                // Mettre à jour l'apparence
                strategyOptions.forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
                
                // Mettre à jour le type de stratégie
                if (strategyTypeInput) {
                    strategyTypeInput.value = strategy;
                }
                currentStrategy = strategy;
                
                // Mettre à jour le toggle pour la compatibilité
                if (strategyToggle) {
                    strategyToggle.checked = (strategy === 'ev' || strategy === 'midrange');
                }
                
                // Mettre à jour les classes du body
                document.body.classList.remove('ev-mode', 'midrange-mode');
                if (strategy === 'ev') {
                    document.body.classList.add('ev-mode');
                } else if (strategy === 'midrange') {
                    document.body.classList.add('midrange-mode');
                }
                
                // Mettre à jour les labels dans l'interface selon la stratégie
                updateStrategyLabels(strategy);
                
                // Recalculer si des résultats sont déjà affichés
                if (resultContainer.style.display === 'block') {
                    calculateButton.click();
                }
            });
        });
    }
    
    // Initialiser le toggle avec vérification de console pour débogage
    console.log("Toggle element:", strategyToggle);
    
    if (strategyToggle) {
        // Initialiser la stratégie en fonction de l'état actuel du toggle
        currentStrategy = strategyToggle.checked ? 'ev' : 'dutch';
        console.log("Stratégie initiale:", currentStrategy);
        
        // Ajouter un gestionnaire pour le changement du toggle
        strategyToggle.addEventListener('change', function() {
            console.log("Toggle changed, checked:", this.checked);
            currentStrategy = this.checked ? 'ev' : 'dutch';
            console.log("Nouvelle stratégie:", currentStrategy);
            
            // Mettre à jour les labels dans l'interface selon la stratégie
            updateStrategyLabels(currentStrategy);
            
            // Recalculer si des résultats sont déjà affichés
            if (resultContainer.style.display === 'block') {
                calculateButton.click();
            }
        });
        
        // Initialiser les labels au chargement
        updateStrategyLabels(currentStrategy);
    } else {
        console.error("Toggle element not found!");
    }
    
    // Fonction pour mettre à jour les labels dans l'interface selon la stratégie active
    function updateStrategyLabels(strategy) {
        const minGainLabel = document.querySelector('.result-item:nth-child(1) .label');
        const avgGainLabel = document.querySelector('.result-item:nth-child(2) .label');
        
        if (minGainLabel && avgGainLabel) {
            if (strategy === 'ev' || strategy === 'midrange') {
                minGainLabel.textContent = "Gain net minimum garanti";
                avgGainLabel.innerHTML = `Gain net moyen attendu ${strategy === 'midrange' ? '(Mid Range)' : '(EV)'} 🔥`;
                avgGainLabel.style.fontWeight = "bold";
                avgGainLabel.style.color = strategy === 'midrange' ? "var(--midrange-highlight)" : "var(--gold)";
            } else {
                minGainLabel.textContent = "Gain net minimum garanti";
                minGainLabel.style.fontWeight = "bold";
                minGainLabel.style.color = "var(--gold)";
                avgGainLabel.textContent = "Gain net moyen attendu";
                avgGainLabel.style.fontWeight = "normal";
                avgGainLabel.style.color = "var(--light-gold)";
            }
        }
    }
    
    // Exemple de données
    const exampleData = {
        "SUENA EL DEMBOW": 3,
        "JOUMA": 7.8,
        "ALCAZAR DE SEGOVIA": 4.5,
        "GANO Y VUELVO": 6.1,
        "WHITE SPIRIT": 3
    };
    
    // Fonction pour générer les entrées de chevaux basées sur le nombre spécifié
    function generateHorseEntries(count) {
        // Vider le conteneur d'abord
        horseEntriesContainer.innerHTML = '';
        
        // Générer les entrées
        for (let i = 1; i <= count; i++) {
            addHorseEntry(i);
        }
    }
    
    // Fonction pour ajouter une ligne de cheval
    function addHorseEntry(number, odds = '') {
        const entry = document.createElement('div');
        entry.className = 'horse-entry';
        
        entry.innerHTML = `
            <div class="horse-number">${number}</div>
            <input type="number" placeholder="Cote du cheval ${number}" class="horse-odds" min="1.01" step="0.01" value="${odds}">
        `;
        
        horseEntriesContainer.appendChild(entry);
        return entry;
    }
    
    // Événement pour détecter le changement du nombre de chevaux
    horseCountInput.addEventListener('change', function() {
        const count = parseInt(this.value);
        if (!isNaN(count) && count >= 2 && count <= 20) {
            generateHorseEntries(count);
        }
    });
    
    // Ajouter les événements aux boutons
    clearFormButton.addEventListener('click', function() {
        // Réinitialiser les valeurs par défaut
        document.getElementById('totalBet').value = 50;
        document.getElementById('maxPerHorse').value = 30;
        horseCountInput.value = 5;
        
        // Régénérer les entrées
        generateHorseEntries(5);
        
        // Cacher les résultats et l'erreur
        resultContainer.style.display = 'none';
        errorMessage.style.display = 'none';
    });
    
    loadExampleButton.addEventListener('click', function() {
        // Mettre à jour le nombre de chevaux
        const exampleCount = Object.keys(exampleData).length;
        horseCountInput.value = exampleCount;
        
        // Vider et régénérer le formulaire
        generateHorseEntries(exampleCount);
        
        // Charger l'exemple
        let i = 1;
        for (const odds of Object.values(exampleData)) {
            const entry = horseEntriesContainer.children[i - 1];
            if (entry) {
                entry.querySelector('.horse-odds').value = odds;
            }
            i++;
        }
        
        // Cacher les résultats et l'erreur
        resultContainer.style.display = 'none';
        errorMessage.style.display = 'none';
    });
    
    calculateButton.addEventListener('click', function() {
        try {
            // Récupérer les valeurs du formulaire
            const totalBet = parseFloat(document.getElementById('totalBet').value);
            const maxPerHorse = parseFloat(document.getElementById('maxPerHorse').value) || 999;
            
            // Validation de base
            if (isNaN(totalBet) || totalBet <= 0) {
                throw new Error('Le montant total doit être un nombre positif');
            }
            
            // Validation pour maxPerHorse
            if (isNaN(maxPerHorse) || maxPerHorse <= 0) {
                throw new Error('La mise maximale par cheval doit être un nombre positif');
            }
            
            // Validation des tailles de combinaison pour Mid Range
            if (currentStrategy === 'midrange' && selectedComboSizes.length === 0) {
                throw new Error('Vous devez sélectionner au moins une taille de combinaison à tester.');
            }
            
            // Récupérer les chevaux et leurs cotes
            const horsesRaw = {};
            const horseEntries = horseEntriesContainer.children;
            
            if (horseEntries.length < 2) {
                throw new Error('Vous devez avoir au moins 2 chevaux');
            }
            
            for (let i = 0; i < horseEntries.length; i++) {
                const entry = horseEntries[i];
                const number = i + 1;
                const odds = parseFloat(entry.querySelector('.horse-odds').value);
                
                if (isNaN(odds) || odds < 1.01) {
                    throw new Error(`La cote pour le cheval ${number} doit être un nombre supérieur à 1.01`);
                }
                
                horsesRaw[`Cheval ${number}`] = odds;
            }
            
            // Vérification pour Mid Range
            if (currentStrategy === 'midrange') {
                const totalHorses = Object.keys(horsesRaw).length;
                if (excludeLow + excludeHigh >= totalHorses) {
                    throw new Error(`Vous excluez ${excludeLow + excludeHigh} chevaux sur ${totalHorses}. Il doit rester au moins 2 chevaux pour les combinaisons.`);
                }
                
                // Vérifier que la plus grande taille de combinaison ne dépasse pas le nombre de chevaux restants
                const remainingHorses = totalHorses - excludeLow - excludeHigh;
                const maxSize = Math.max(...selectedComboSizes);
                if (maxSize > remainingHorses) {
                    throw new Error(`La taille de combinaison ${maxSize} est trop grande pour le nombre de chevaux restants (${remainingHorses}).`);
                }
            }
            
            // Ajouter un message de calcul en cours pour les grandes optimisations
            errorMessage.textContent = "Calcul en cours, veuillez patienter...";
            errorMessage.style.display = 'block';
            resultContainer.style.display = 'none';
            
            // Différer le calcul pour que le message s'affiche
            setTimeout(() => {
                try {
                    // Détecter la stratégie active
                    const activeStrategy = strategyTypeInput ? strategyTypeInput.value : currentStrategy;
                    let allCombos;
                    
                    console.log("Calcul avec stratégie:", activeStrategy);
                    
                    if (activeStrategy === 'dutch') {
                        allCombos = findAllCombosForSizesDutch(horsesRaw, totalBet, [2, 3, 4, 5]);
                    } else if (activeStrategy === 'ev') {
                        allCombos = findAllCombosForSizesEV(horsesRaw, totalBet, [2, 3, 4, 5], maxPerHorse);
                    } else if (activeStrategy === 'midrange') {
                        allCombos = findMidRangeOptimalBets(
                            horsesRaw, 
                            totalBet, 
                            selectedComboSizes, 
                            maxPerHorse,
                            excludeLow,
                            excludeHigh
                        );
                    }
                    
                    if (allCombos.filter(combo => combo.available && combo.rentable).length === 0) {
                        throw new Error('Aucune combinaison rentable trouvée. Essayez de modifier les cotes ou d\'augmenter le montant total.');
                    }
                    
                    // Afficher les résultats
                    displayResults(allCombos, totalBet, activeStrategy, maxPerHorse);
                    
                    // Cacher le message d'erreur et afficher les résultats
                    errorMessage.style.display = 'none';
                    resultContainer.style.display = 'block';
                    
                    // Scroll jusqu'aux résultats
                    resultContainer.scrollIntoView({ behavior: 'smooth' });
                } catch (error) {
                    // Afficher l'erreur
                    errorMessage.textContent = error.message;
                    errorMessage.style.display = 'block';
                    resultContainer.style.display = 'none';
                }
            }, 50); // Délai court pour que l'UI se mette à jour
            
        } catch (error) {
            // Afficher l'erreur
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
            resultContainer.style.display = 'none';
        }
    });
    
    // Fonction pour le Dutch betting classique
    function findAllCombosForSizesDutch(horsesRaw, totalBet, sizes) {
        const sortedHorses = Object.entries(horsesRaw)
            .sort((a, b) => a[1] - b[1])
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});

        function computeComboDutch(combo, totalBet) {
            const odds = combo.map(h => sortedHorses[h]);
            const invOdds = odds.map(o => 1/o);
            const totalInv = invOdds.reduce((a, b) => a + b, 0);
            const stakes = invOdds.map(inv => (inv / totalInv) * totalBet);
            const gainsNet = stakes.map((stake, i) => (stake * odds[i]) - totalBet);
            const gainMax = Math.max(...gainsNet);
            const gainMin = Math.min(...gainsNet);
            const gainAvg = gainsNet.reduce((a, b) => a + b, 0) / gainsNet.length;
            const isRentable = gainsNet.every(g => g > 0);

            return {
                chevaux: combo,
                mises: stakes,
                cotes: odds,
                gains_bruts: stakes.map((stake, i) => stake * odds[i]),
                gains_net: gainsNet,
                gain_minimum: gainMin,
                gain_moyen: gainAvg,
                gain_maximum: gainMax,
                rentable: isRentable,
                available: true,
                approche: "Dutch"
            };
        }

        const horseNames = Object.keys(sortedHorses);
        const allCombos = [];

        // Générer toutes les combinaisons demandées (2, 3, 4, 5)
        for (const size of sizes) {
            // Vérifier si nous avons assez de chevaux pour cette taille
            if (size <= horseNames.length) {
                const subset = horseNames.slice(0, size); // top "size" favoris
                const result = computeComboDutch(subset, totalBet);
                result.taille = size;
                allCombos.push(result);
            } else {
                // Pas assez de chevaux, ajouter un combo "non disponible"
                allCombos.push({
                    taille: size,
                    available: false,
                    rentable: false,
                    gain_moyen: 0,
                    gain_maximum: 0,
                    approche: "Dutch"
                });
            }
        }

        return allCombos;
    }
    
    // Fonction pour la stratégie d'optimisation EV
    function findAllCombosForSizesEV(horsesRaw, totalBet, sizes, maxStakePerHorse = 999) {
        const sortedHorses = Object.entries(horsesRaw)
            .sort((a, b) => a[1] - b[1])
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});

        // Nouvelle fonction d'optimisation par force brute pour EV
        function computeComboEV_BruteForce(combo, totalBet, maxStakePerHorse) {
            const odds = combo.map(h => sortedHorses[h]);
            const horseCount = combo.length;
            
            // Paramètres pour l'optimisation
            const STEP_SIZE = horseCount <= 2 ? 0.5 : (horseCount <= 3 ? 1 : 2); // Pas en € (plus petit = plus précis mais plus lent)
            const MIN_STAKE = 1; // Mise minimale par cheval en €
            
            // Stocker le meilleur résultat
            let bestGainMoyen = -Infinity;
            let bestStakes = [];
            let bestGainsBruts = [];
            let bestGainsNets = [];
            let iterations = 0;
            const MAX_ITERATIONS = 1000000; // Limite le nombre d'itérations pour éviter les boucles infinies
            
            // Fonction récursive pour tester toutes les combinaisons de mises
            function findBestStakes(currentHorse, remainingStake, currentStakes) {
                iterations++;
                if (iterations > MAX_ITERATIONS) return;
                
                // Si on a atteint le dernier cheval, lui affecter le reste
                if (currentHorse === horseCount - 1) {
                    // Vérifier si la mise du dernier cheval respecte la limite max
                    if (remainingStake > maxStakePerHorse) return;
                    
                    // La mise du dernier cheval est le reste du budget
                    const finalStakes = [...currentStakes, remainingStake];
                    
                    // Calculer les gains pour cette distribution de mises
                    const gainsBruts = finalStakes.map((stake, i) => stake * odds[i]);
                    const gainsNets = gainsBruts.map(g => g - totalBet);
                    
                    // Vérifier que tous les gains nets sont positifs
                    if (!gainsNets.every(g => g > 0)) {
                        return; // Sauter cette combinaison si un gain net est négatif
                    }
                    
                    // Calculer le gain moyen (moyenne simple)
                    const gainMoyen = gainsNets.reduce((sum, g) => sum + g, 0) / horseCount;
                    
                    // Si c'est le meilleur gain moyen jusqu'à présent, le sauvegarder
                    if (gainMoyen > bestGainMoyen) {
                        bestGainMoyen = gainMoyen;
                        bestStakes = finalStakes;
                        bestGainsBruts = gainsBruts;
                        bestGainsNets = gainsNets;
                    }
                    return;
                }
                
                // Pour les autres chevaux, tester différentes mises possibles
                // Avec un pas fixe, et une mise minimale
                let maxStake = remainingStake - MIN_STAKE * (horseCount - currentHorse - 1);
                // NOUVEAU: Limiter la mise maximale par cheval
                maxStake = Math.min(maxStake, maxStakePerHorse);
                
                for (let stake = MIN_STAKE; stake <= maxStake; stake += STEP_SIZE) {
                    findBestStakes(currentHorse + 1, remainingStake - stake, [...currentStakes, stake]);
                }
            }
            
            // Lancer la recherche
            console.time('OptimizationTime');
            findBestStakes(0, totalBet, []);
            console.timeEnd('OptimizationTime');
            console.log(`Iterations: ${iterations}`);
            
            // Vérifier si une solution a été trouvée
            const isRentable = bestGainMoyen > 0 && bestStakes.length > 0;
            
            if (!isRentable) {
                return {
                    chevaux: combo,
                    mises: [],
                    cotes: odds,
                    gains_bruts: [],
                    gains_net: [],
                    gain_minimum: 0,
                    gain_moyen: 0,
                    gain_maximum: 0,
                    rentable: false,
                    available: true,
                    approche: "EV (Optimisé)"
                };
            }
            
            // Calculer les autres métriques basées sur le meilleur résultat
            const gainMax = Math.max(...bestGainsNets);
            const gainMin = Math.min(...bestGainsNets);
            
            // Vérifier si des mises atteignent la limite max
            const limitesAtteintes = bestStakes.some(stake => Math.abs(stake - maxStakePerHorse) < 0.01);
            
            return {
                chevaux: combo,
                mises: bestStakes,
                cotes: odds,
                gains_bruts: bestGainsBruts,
                gains_net: bestGainsNets,
                gain_minimum: gainMin,
                gain_moyen: bestGainMoyen,
                gain_maximum: gainMax,
                rentable: isRentable,
                available: true,
                approche: "EV (Optimisé)",
                limitesAtteintes: limitesAtteintes
            };
        }

        const horseNames = Object.keys(sortedHorses);
        const allCombos = [];

        // Générer toutes les combinaisons demandées (2, 3, 4, 5)
        for (const size of sizes) {
            // Vérifier si nous avons assez de chevaux pour cette taille
            if (size <= horseNames.length) {
                const subset = horseNames.slice(0, size); // top "size" favoris
                
                // Utiliser l'optimisation par force brute pour l'EV avec limite max par cheval
                const result = computeComboEV_BruteForce(subset, totalBet, maxStakePerHorse);
                result.taille = size;
                allCombos.push(result);
            } else {
                // Pas assez de chevaux, ajouter un combo "non disponible"
                allCombos.push({
                    taille: size,
                    available: false,
                    rentable: false,
                    gain_moyen: 0,
                    gain_maximum: 0,
                    approche: "EV"
                });
            }
        }

        return allCombos;
    }
    
    /**
     * Stratégie Mid Range améliorée - Filtre les cotes extrêmes et teste toutes les combinaisons possibles
     */
    function findMidRangeOptimalBets(horsesRaw, totalBet, sizes, maxStakePerHorse = 999, excludeLow = 1, excludeHigh = 1) {
        // Trier les chevaux par cote croissante
        const sortedEntries = Object.entries(horsesRaw).sort((a, b) => a[1] - b[1]);
        const total = sortedEntries.length;
        
        // Exclure les N favoris (les N plus petites cotes) et N outsiders (les N plus hautes cotes)
        const filteredEntries = sortedEntries.slice(excludeLow, total - excludeHigh);
        
        // Limitation du nombre maximum de chevaux pour les performances
        const MAX_HORSES_TO_CONSIDER = 8; // Limiter à 8 chevaux maximum
        let midRangeEntries = filteredEntries;
        
        // Si on a beaucoup de chevaux et aucune exclusion, on limite aux favoris
        if (filteredEntries.length > MAX_HORSES_TO_CONSIDER && excludeLow === 0 && excludeHigh === 0) {
            midRangeEntries = filteredEntries.slice(0, MAX_HORSES_TO_CONSIDER);
            console.log(`Trop de chevaux (${filteredEntries.length}), limitation aux ${MAX_HORSES_TO_CONSIDER} favoris`);
        }
        
        // Convertir en objet
        const midRangeHorses = Object.fromEntries(midRangeEntries);
        
        console.log(`Mid Range: Gardé ${midRangeEntries.length}/${total} chevaux après exclusion de ${excludeLow} favoris et ${excludeHigh} outsiders`);
        console.log("Chevaux médians:", Object.entries(midRangeHorses).map(([name, odds]) => `${name}: ${odds}`));
        
        if (midRangeEntries.length < 2) {
            return sizes.map(size => ({
                taille: size,
                available: false,
                rentable: false,
                gain_moyen: 0,
                gain_maximum: 0,
                approche: "Mid Range",
                filtrage: `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`
            }));
        }
        
        // Fonction pour générer toutes les combinaisons possibles de taille donnée
        function getAllCombos(array, size) {
            if (size === 1) return array.map(e => [e]);
            const combos = [];
            array.forEach((current, index) => {
                const rest = array.slice(index + 1);
                const smallerCombos = getAllCombos(rest, size - 1);
                smallerCombos.forEach(combo => combos.push([current, ...combo]));
            });
            return combos;
        }
        
        // Fonction d'optimisation pour une combinaison donnée
        function optimizeMidRange(combo, totalBet, maxStakePerHorse) {
            const odds = combo.map(h => midRangeHorses[h]);
            const horseCount = combo.length;
            
            // Paramètres d'optimisation
            const STEP_SIZE = horseCount <= 2 ? 0.5 : (horseCount <= 3 ? 1 : 2);
            const MIN_STAKE = 1;
            
            // Variables pour stocker le meilleur résultat
            let bestGainMoyen = -Infinity;
            let bestStakes = [];
            let bestGainsBruts = [];
            let bestGainsNets = [];
            let iterations = 0;
            const MAX_ITERATIONS = 1000000;
            
            // Fonction récursive de recherche
            function findBestStakes(currentHorse, remainingStake, currentStakes) {
                iterations++;
                if (iterations > MAX_ITERATIONS) return;
                
                if (currentHorse === horseCount - 1) {
                    if (remainingStake > maxStakePerHorse) return;
                    
                    const finalStakes = [...currentStakes, remainingStake];
                    const gainsBruts = finalStakes.map((stake, i) => stake * odds[i]);
                    const gainsNets = gainsBruts.map(g => g - totalBet);
                    
                    if (!gainsNets.every(g => g > 0)) return;
                    
                    const gainMoyen = gainsNets.reduce((sum, g) => sum + g, 0) / horseCount;
                    
                    if (gainMoyen > bestGainMoyen) {
                        bestGainMoyen = gainMoyen;
                        bestStakes = finalStakes;
                        bestGainsBruts = gainsBruts;
                        bestGainsNets = gainsNets;
                    }
                    return;
                }
                
                let maxStake = remainingStake - MIN_STAKE * (horseCount - currentHorse - 1);
                maxStake = Math.min(maxStake, maxStakePerHorse);
                
                for (let stake = MIN_STAKE; stake <= maxStake; stake += STEP_SIZE) {
                    findBestStakes(currentHorse + 1, remainingStake - stake, [...currentStakes, stake]);
                }
            }
            
            // Lancer l'optimisation
            console.time('MidRangeOptimizationTime');
            findBestStakes(0, totalBet, []);
            console.timeEnd('MidRangeOptimizationTime');
            console.log(`Mid Range Iterations: ${iterations}`);
            
            // Vérifier si une solution a été trouvée
            const isRentable = bestGainMoyen > 0 && bestStakes.length > 0;
            
            if (!isRentable) {
                return {
                    chevaux: combo,
                    mises: [],
                    cotes: odds,
                    gains_bruts: [],
                    gains_net: [],
                    gain_minimum: 0,
                    gain_moyen: 0,
                    gain_maximum: 0,
                    rentable: false,
                    available: true,
                    approche: "Mid Range",
                    filtrage: `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`
                };
            }
            
            // Calculer les autres métriques
            const gainMax = Math.max(...bestGainsNets);
            const gainMin = Math.min(...bestGainsNets);
            const limitesAtteintes = bestStakes.some(stake => Math.abs(stake - maxStakePerHorse) < 0.01);
            
            return {
                chevaux: combo,
                mises: bestStakes,
                cotes: odds,
                gains_bruts: bestGainsBruts,
                gains_net: bestGainsNets,
                gain_minimum: gainMin,
                gain_moyen: bestGainMoyen,
                gain_maximum: gainMax,
                rentable: isRentable,
                available: true,
                approche: "Mid Range",
                filtrage: `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`,
                limitesAtteintes: limitesAtteintes
            };
        }
        
        // Générer les combos pour chaque taille demandée
        const horseNames = Object.keys(midRangeHorses);
        const allCombos = [];
        
        for (const size of sizes) {
            if (size <= horseNames.length) {
                // AMÉLIORATION : Générer toutes les combinaisons possibles de taille 'size'
                const allPossibleCombos = getAllCombos(horseNames, size);
                
                // Trier les combinaisons par la somme des cotes (préférer les plus petites sommes)
                allPossibleCombos.sort((a, b) => {
                    const sumA = a.reduce((sum, horseName) => sum + midRangeHorses[horseName], 0);
                    const sumB = b.reduce((sum, horseName) => sum + midRangeHorses[horseName], 0);
                    return sumA - sumB; // Trier par ordre croissant de cotes
                });
                
                // Limiter le nombre de combinaisons à tester pour des performances raisonnables
                const MAX_COMBOS_TO_TEST = 100;
                const combosToTest = allPossibleCombos.length > MAX_COMBOS_TO_TEST 
                    ? allPossibleCombos.slice(0, MAX_COMBOS_TO_TEST) 
                    : allPossibleCombos;
                
                console.log(`Testant ${combosToTest.length}/${allPossibleCombos.length} combinaisons possibles de taille ${size}`);
                
                // Tester toutes les combinaisons et trouver la meilleure
                let bestCombo = null;
                let bestGainMoyen = -Infinity;
                
                for (const combo of combosToTest) {
                    const result = optimizeMidRange(combo, totalBet, maxStakePerHorse);
                    
                    if (result.rentable && result.gain_moyen > bestGainMoyen) {
                        bestGainMoyen = result.gain_moyen;
                        bestCombo = result;
                    }
                }
                
                if (bestCombo) {
                    bestCombo.taille = size;
                    allCombos.push(bestCombo);
                } else {
                    // Aucune combinaison rentable trouvée pour cette taille
                    allCombos.push({
                        taille: size,
                        available: true,
                        rentable: false,
                        gain_moyen: 0,
                        gain_maximum: 0,
                        approche: "Mid Range",
                        filtrage: `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`
                    });
                }
            } else {
                // Pas assez de chevaux après filtrage
                allCombos.push({
                    taille: size,
                    available: false,
                    rentable: false,
                    gain_moyen: 0,
                    gain_maximum: 0,
                    approche: "Mid Range",
                    filtrage: `Exclu: ${excludeLow} favoris + ${excludeHigh} outsiders`
                });
            }
        }
        
        return allCombos;
    }
    
    // Fonction pour afficher les résultats
    function displayResults(comboList, totalBet, strategy, maxStakePerHorse) {
        resultContainer.style.display = 'block';
        betsTableBody.innerHTML = ''; // Réinitialiser

        // TRIER les combos disponibles et rentables par gain moyen DÉCROISSANT
        const sortedCombos = comboList
            .filter(combo => combo.available && combo.rentable)
            .sort((a, b) => b.gain_moyen - a.gain_moyen);

        const bestCombo = sortedCombos.length > 0
            ? sortedCombos[0]
            : comboList.find(combo => combo.available) || comboList[0];

        // Mettre à jour l'en-tête avec les meilleurs chiffres (top combo rentable)
        if (bestCombo && bestCombo.available) {
            minGainElement.textContent = bestCombo.rentable
                ? `+${bestCombo.gain_minimum.toFixed(2)} €`
                : `${bestCombo.gain_minimum.toFixed(2)} €`;
            avgGainElement.textContent = bestCombo.rentable
                ? `+${bestCombo.gain_moyen.toFixed(2)} €`
                : `${bestCombo.gain_moyen.toFixed(2)} €`;
            selectedHorsesElement.textContent = bestCombo.chevaux.length;
            
            // Ajouter une classe spéciale pour différencier les stratégies
            if (strategy === 'ev' || strategy === 'midrange') {
                avgGainElement.className = 'value positive highlight';
                minGainElement.className = 'value positive';
            } else {
                avgGainElement.className = 'value positive';
                minGainElement.className = 'value positive highlight';
            }
        } else {
            minGainElement.textContent = "N/A";
            avgGainElement.textContent = "N/A";
            selectedHorsesElement.textContent = "N/A";
        }
        totalStakeElement.textContent = `${totalBet.toFixed(2)} €`;

        // Ajouter un en-tête explicatif pour la méthode
        const methodExplanation = document.createElement('tr');
        let explanationText = "";
        
        if (strategy === 'dutch') {
            explanationText = `<td colspan="5" class="method-explanation">🎯 <strong>Mode DUTCH BETTING</strong> : Cette stratégie garantit un gain identique quel que soit le cheval gagnant parmi votre sélection.</td>`;
        } else if (strategy === 'ev') {
            explanationText = `<td colspan="5" class="method-explanation">💰 <strong>Mode OPTIMISATION EV</strong> : Cette stratégie trouve la répartition des mises qui maximise votre gain moyen, avec un gain net positif garanti pour chaque cheval.</td>`;
        } else if (strategy === 'midrange') {
            explanationText = `<td colspan="5" class="method-explanation">⚖️ <strong>Mode MID RANGE</strong> : Cette stratégie trouve les meilleures combinaisons parmi les cotes médianes en excluant ${excludeLow} favoris et ${excludeHigh} outsiders, puis optimise les mises.</td>`;
        }
        
        methodExplanation.innerHTML = explanationText;
        betsTableBody.appendChild(methodExplanation);

        // Afficher tous les combos rentables triés par gain net moyen
        sortedCombos.forEach((combo, index) => {
            // Ajouter une indication spéciale pour le meilleur combo
            const isBest = index === 0;
            
            // Badge différent selon la stratégie
            let bestBadge = "";
            if (isBest) {
                if (strategy === 'dutch') {
                    bestBadge = "🔥 MEILLEUR COMBO DUTCH - ";
                } else if (strategy === 'ev') {
                    bestBadge = "🔥 MEILLEUR COMBO EV - ";
                } else if (strategy === 'midrange') {
                    bestBadge = "🔥 MEILLEUR COMBO MID RANGE - ";
                }
            }
            
            const headerClass = "section-header";
            let strategyBadge = "";
            
            if (strategy === 'dutch') {
                strategyBadge = "🎯 DUTCH : ";
            } else if (strategy === 'ev') {
                strategyBadge = "💰 OPTIMISATION EV : ";
            } else if (strategy === 'midrange') {
                strategyBadge = "⚖️ MID RANGE : ";
            }
            
            let headerText = "";
            if (strategy === 'dutch') {
                headerText = `${bestBadge}${strategyBadge}Combo avec ${combo.taille} favoris | Gain garanti : +${combo.gain_minimum.toFixed(2)} € | Gain net moyen : +${combo.gain_moyen.toFixed(2)} €`;
            } else if (strategy === 'ev') {
                headerText = `${bestBadge}${strategyBadge}Combo avec ${combo.taille} favoris | Gain net moyen (EV) : +${combo.gain_moyen.toFixed(2)} € | Gain min/max : +${combo.gain_minimum.toFixed(2)} €/+${combo.gain_maximum.toFixed(2)} €`;
            } else if (strategy === 'midrange') {
                headerText = `${bestBadge}${strategyBadge}Combo avec ${combo.taille} chevaux | Gain net moyen : +${combo.gain_moyen.toFixed(2)} € | ${combo.filtrage}`;
            }
            
            const title = document.createElement('tr');
            title.innerHTML = `<td colspan="5" class="${headerClass}${isBest ? ' best-combo' : ''}">${headerText}</td>`;
            betsTableBody.appendChild(title);

            // Ajouter des en-têtes de colonne spécifiques selon la stratégie
            const columnHeaders = document.createElement('tr');
            let headersHTML = `
                <th>Cheval</th>
                <th>Cote</th>
                <th>Mise (€)</th>
                <th>Gain brut (€)</th>
                <th>Gain net (€)</th>
            `;
            columnHeaders.innerHTML = headersHTML;
            betsTableBody.appendChild(columnHeaders);

            // Afficher les chevaux et leurs détails
            combo.chevaux.forEach((cheval, i) => {
                const row = document.createElement('tr');
                const gainNet = combo.gains_net[i];
                const gainClass = gainNet > 0 ? 'positive' : 'negative';
                
                // Vérifier si cette mise est à la limite
                const isAtLimit = (strategy === 'ev' || strategy === 'midrange') && 
                                 Math.abs(combo.mises[i] - maxStakePerHorse) < 0.01;
                const miseClass = isAtLimit ? 'at-limit' : '';
                const limitWarning = isAtLimit ? ' ⚠️' : '';

                row.innerHTML = `
                    <td>${cheval}</td>
                    <td>${combo.cotes[i].toFixed(2)}</td>
                    <td class="${miseClass}">${combo.mises[i].toFixed(2)} €${limitWarning}</td>
                    <td>${combo.gains_bruts[i].toFixed(2)} €</td>
                    <td class="${gainClass}">${gainNet > 0 ? '+' : ''}${gainNet.toFixed(2)} €</td>
                `;
                betsTableBody.appendChild(row);
            });

            // Ajouter un avertissement si des limites sont atteintes
            if (combo.limitesAtteintes && (strategy === 'ev' || strategy === 'midrange')) {
                const warningRow = document.createElement('tr');
                warningRow.innerHTML = `
                    <td colspan="5" class="limit-warning">
                        ⚠️ Au moins une mise a atteint la limite maximale par cheval (${maxStakePerHorse} €). 
                        Sans cette contrainte, le gain moyen pourrait être plus élevé.
                    </td>
                `;
                betsTableBody.appendChild(warningRow);
            }

            // Ajouter une explication de calcul pour EV si c'est le meilleur combo
            if (isBest && (strategy === 'ev' || strategy === 'midrange')) {
                const formulaRow = document.createElement('tr');
                
                // Créer une explication détaillée de la formule EV
                let formulaHTML = `
                    <td colspan="5" class="formula-explanation">
                        <p><strong>Formule du gain moyen optimisé</strong> = Moyenne des gains nets avec la meilleure répartition de mises</p>
                        <p>EV = (${combo.gains_net.map(g => g > 0 ? '+' : '' + g.toFixed(2) + ' €').join(' + ')}) / ${combo.chevaux.length} = <strong>+${combo.gain_moyen.toFixed(2)} €</strong></p>
                        <p><em>Note: Cette répartition a été trouvée par optimisation complète en garantissant que chaque gain net est positif.</em></p>
                    </td>
                `;
                
                formulaRow.innerHTML = formulaHTML;
                betsTableBody.appendChild(formulaRow);
            }
        });

        // Ajouter les combos non rentables ou non disponibles à la fin
        comboList
            .filter(combo => !combo.rentable || !combo.available)
            .forEach(combo => {
                const headerClass = combo.available
                    ? "section-header non-rentable-simple"
                    : "section-header non-available-simple";
                const headerIcon = combo.available ? "⚠️" : "ℹ️";
                
                let strategyBadge = "";
                if (strategy === 'dutch') {
                    strategyBadge = "🎯 DUTCH : ";
                } else if (strategy === 'ev') {
                    strategyBadge = "💰 OPTIMISATION EV : ";
                } else if (strategy === 'midrange') {
                    strategyBadge = "⚖️ MID RANGE : ";
                }
                
                const headerMessage = combo.available
                    ? `${headerIcon} ${strategyBadge}Combo avec ${combo.taille} chevaux : Aucune solution rentable`
                    : `${headerIcon} ${strategyBadge}Combo avec ${combo.taille} chevaux : Pas assez de chevaux`;
                
                const title = document.createElement('tr');
                title.innerHTML = `<td colspan="5" class="${headerClass}">${headerMessage}</td>`;
                betsTableBody.appendChild(title);
            });
            
        // Ajouter du CSS dynamique pour les nouveaux éléments
        const style = document.createElement('style');
        style.textContent = `
            .highlight {
                color: ${strategy === 'midrange' ? 'var(--midrange-highlight)' : (strategy === 'ev' ? 'var(--ev-highlight)' : 'var(--gold)')} !important;
                font-weight: bold;
                font-size: 2.7rem !important;
            }
            .best-combo {
                background-color: ${strategy === 'midrange' ? 'rgba(214, 120, 211, 0.15)' : (strategy === 'ev' ? 'rgba(34, 199, 184, 0.15)' : 'rgba(233, 209, 140, 0.15)')} !important;
                font-weight: bold;
            }
            .method-explanation {
                background-color: ${strategy === 'midrange' ? 'rgba(214, 120, 211, 0.15)' : (strategy === 'ev' ? 'rgba(34, 199, 184, 0.15)' : 'rgba(233, 209, 140, 0.15)')};
                padding: 10px;
                border-left: 3px solid ${strategy === 'midrange' ? 'var(--midrange-highlight)' : (strategy === 'ev' ? 'var(--ev-accent)' : 'var(--gold)')};
                margin-bottom: 15px;
                font-size: 0.95rem;
            }
            .formula-explanation {
                background-color: rgba(34, 199, 184, 0.05);
                padding: 8px;
                font-size: 0.85rem;
                color: rgba(245, 233, 201, 0.9);
                border-top: 1px dashed rgba(34, 199, 184, 0.3);
                margin-bottom: 20px;
            }
            .at-limit {
                color: #ff8c8c;
                font-weight: bold;
            }
            .limit-warning {
                background-color: rgba(255, 140, 140, 0.1);
                padding: 8px;
                font-size: 0.85rem;
                color: #ff8c8c;
                border-left: 3px solid #ff8c8c;
                margin-top: 5px;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Générer les chevaux initiaux au chargement de la page
    generateHorseEntries(parseInt(horseCountInput.value) || 5);
});