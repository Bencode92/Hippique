/**
 * Simulateur de paris optimaux pour les courses hippiques
 * Implémente deux algorithmes : Dutch betting classique et optimisation EV
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
    
    // Éléments de résultat
    const minGainElement = document.getElementById('minGain');
    const avgGainElement = document.getElementById('avgGain');
    const selectedHorsesElement = document.getElementById('selectedHorses');
    const totalStakeElement = document.getElementById('totalStake');
    const betsTableBody = document.getElementById('betsTableBody');
    
    // État pour la stratégie
    let currentStrategy = 'dutch'; // 'dutch' ou 'ev'
    
    // Initialiser le toggle
    if (strategyToggle) {
        strategyToggle.addEventListener('change', function() {
            currentStrategy = this.checked ? 'ev' : 'dutch';
            
            // Recalculer si des résultats sont déjà affichés
            if (resultContainer.style.display === 'block') {
                calculateButton.click();
            }
        });
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
            
            // Validation de base
            if (isNaN(totalBet) || totalBet <= 0) {
                throw new Error('Le montant total doit être un nombre positif');
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
            
            // Calculer les stratégies pour 2, 3, 4 et 5 favoris (si possible)
            let allCombos;
            
            if (currentStrategy === 'dutch') {
                allCombos = findAllCombosForSizesDutch(horsesRaw, totalBet, [2, 3, 4, 5]);
            } else {
                allCombos = findAllCombosForSizesEV(horsesRaw, totalBet, [2, 3, 4, 5]);
            }
            
            if (allCombos.filter(combo => combo.available && combo.rentable).length === 0) {
                throw new Error('Aucune combinaison rentable trouvée. Essayez de modifier les cotes ou d\'augmenter le montant total.');
            }
            
            // Afficher les résultats
            displayResults(allCombos, totalBet, currentStrategy);
            
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
    function findAllCombosForSizesEV(horsesRaw, totalBet, sizes) {
        const sortedHorses = Object.entries(horsesRaw)
            .sort((a, b) => a[1] - b[1])
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});

        function computeComboEV(combo, totalBet) {
            const odds = combo.map(h => sortedHorses[h]);
            const probs = odds.map(o => 1 / o);
            const totalProb = probs.reduce((a, b) => a + b, 0);
            const normProbs = probs.map(p => p / totalProb); // pour lisser

            // On mise plus sur les chevaux avec la meilleure proba
            const mises = normProbs.map(p => p * totalBet);
            const gainsBruts = mises.map((m, i) => m * odds[i]);
            const gainsNet = gainsBruts.map(g => g - totalBet);

            // EV = somme(probabilité * gain)
            const gainMoyen = normProbs.reduce((sum, p, i) => sum + p * gainsNet[i], 0);
            const gainMax = Math.max(...gainsNet);
            const gainMin = Math.min(...gainsNet);
            const isRentable = gainMin > 0;

            return {
                chevaux: combo,
                mises: mises,
                cotes: odds,
                gains_bruts: gainsBruts,
                gains_net: gainsNet,
                gain_minimum: gainMin,
                gain_moyen: gainMoyen,
                gain_maximum: gainMax,
                rentable: isRentable,
                available: true,
                approche: "EV"
            };
        }

        const horseNames = Object.keys(sortedHorses);
        const allCombos = [];

        // Générer toutes les combinaisons demandées (2, 3, 4, 5)
        for (const size of sizes) {
            // Vérifier si nous avons assez de chevaux pour cette taille
            if (size <= horseNames.length) {
                const subset = horseNames.slice(0, size); // top "size" favoris
                const result = computeComboEV(subset, totalBet);
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
    
    // Fonction pour afficher les résultats
    function displayResults(comboList, totalBet, strategy) {
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
        } else {
            minGainElement.textContent = "N/A";
            avgGainElement.textContent = "N/A";
            selectedHorsesElement.textContent = "N/A";
        }
        totalStakeElement.textContent = `${totalBet.toFixed(2)} €`;

        // Afficher tous les combos rentables triés par gain net moyen
        sortedCombos.forEach((combo, index) => {
            // Ajouter une indication spéciale pour le meilleur combo
            const isBest = index === 0;
            const bestBadge = isBest ? "🔥 MEILLEUR COMBO - " : "";
            
            const headerClass = "section-header";
            const strategyBadge = strategy === 'dutch' ? "🎯 DUTCH : " : "💰 OPTIMISATION EV : ";
            const headerText = `${bestBadge}${strategyBadge}Combo avec ${combo.taille} favoris | Gain net moyen : +${combo.gain_moyen.toFixed(2)} € | Gain min/max : +${combo.gain_minimum.toFixed(2)} €/+${combo.gain_maximum.toFixed(2)} €`;
            
            const title = document.createElement('tr');
            title.innerHTML = `<td colspan="5" class="${headerClass}">${headerText}</td>`;
            betsTableBody.appendChild(title);

            combo.chevaux.forEach((cheval, i) => {
                const row = document.createElement('tr');
                const gainNet = combo.gains_net[i];
                const gainClass = gainNet > 0 ? 'positive' : 'negative';

                row.innerHTML = `
                    <td>${cheval}</td>
                    <td>${combo.cotes[i].toFixed(2)}</td>
                    <td>${combo.mises[i].toFixed(2)} €</td>
                    <td>${combo.gains_bruts[i].toFixed(2)} €</td>
                    <td class="${gainClass}">${gainNet > 0 ? '+' : ''}${gainNet.toFixed(2)} €</td>
                `;
                betsTableBody.appendChild(row);
            });
        });

        // Ajouter les combos non rentables ou non disponibles à la fin
        comboList
            .filter(combo => !combo.rentable || !combo.available)
            .forEach(combo => {
                const headerClass = combo.available
                    ? "section-header non-rentable-simple"
                    : "section-header non-available-simple";
                const headerIcon = combo.available ? "⚠️" : "ℹ️";
                const strategyBadge = strategy === 'dutch' ? "🎯 DUTCH : " : "💰 OPTIMISATION EV : ";
                const headerMessage = combo.available
                    ? `${headerIcon} ${strategyBadge}Combo avec ${combo.taille} favoris : Aucune solution rentable`
                    : `${headerIcon} ${strategyBadge}Combo avec ${combo.taille} favoris : Pas assez de chevaux`;
                
                const title = document.createElement('tr');
                title.innerHTML = `<td colspan="5" class="${headerClass}">${headerMessage}</td>`;
                betsTableBody.appendChild(title);
            });
    }
    
    // Générer les chevaux initiaux au chargement de la page
    generateHorseEntries(parseInt(horseCountInput.value) || 5);
});
