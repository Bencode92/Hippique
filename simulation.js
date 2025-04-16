/**
 * Simulateur de paris optimaux pour les courses hippiques
 * Implémente l'algorithme de "dutch betting" pour trouver la stratégie optimale
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
    
    // Éléments de résultat
    const minGainElement = document.getElementById('minGain');
    const avgGainElement = document.getElementById('avgGain');
    const selectedHorsesElement = document.getElementById('selectedHorses');
    const totalStakeElement = document.getElementById('totalStake');
    const betsTableBody = document.getElementById('betsTableBody');
    
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
            
            // Calculer les stratégies optimales
            const allCombos = findOptimalBets(horsesRaw, totalBet, horseEntries.length);
            
            if (allCombos.length === 0) {
                throw new Error('Aucune combinaison rentable trouvée. Essayez de modifier les cotes ou d\'augmenter le montant total.');
            }
            
            // Afficher les résultats
            displayResults(allCombos, totalBet);
            
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
    
    // Fonction pour calculer les paris optimaux
    function findOptimalBets(horsesRaw, totalBet, maxN) {
        const sortedHorses = Object.entries(horsesRaw)
            .sort((a, b) => a[1] - b[1])
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});

        function computeCombo(combo, totalBet) {
            const odds = combo.map(h => sortedHorses[h]);
            const invOdds = odds.map(o => 1 / o);
            const totalInv = invOdds.reduce((a, b) => a + b, 0);
            const stakes = invOdds.map(inv => (inv / totalInv) * totalBet);
            const gainsNet = stakes.map((stake, i) => (stake * odds[i]) - totalBet);
            const gainMax = Math.max(...gainsNet);
            const gainMin = Math.min(...gainsNet);
            const gainAvg = gainsNet.reduce((a, b) => a + b, 0) / gainsNet.length;

            if (gainsNet.every(g => g > 0)) {
                return {
                    chevaux: combo,
                    mises: stakes,
                    cotes: odds,
                    gains_bruts: stakes.map((stake, i) => stake * odds[i]),
                    gains_net: gainsNet,
                    gain_minimum: gainMin,
                    gain_moyen: gainAvg,
                    gain_maximum: gainMax
                };
            }
            return null;
        }

        const horseNames = Object.keys(sortedHorses);
        const allCombos = [];

        for (let r = 2; r <= Math.min(maxN, horseNames.length); r++) {
            const subset = horseNames.slice(0, r); // top r favoris
            const result = computeCombo(subset, totalBet);
            if (result) {
                result.taille = r;
                allCombos.push(result);
            }
        }

        return allCombos;
    }
    
    // Fonction pour afficher les résultats
    function displayResults(comboList, totalBet) {
        resultContainer.style.display = 'block';
        betsTableBody.innerHTML = ''; // Réinitialiser

        comboList.sort((a, b) => b.gain_moyen - a.gain_moyen); // Tri par gain moyen décroissant

        comboList.forEach((combo, index) => {
            const title = document.createElement('tr');
            title.innerHTML = `<td colspan="5" class="section-header">💡 Combo avec ${combo.chevaux.length} favoris | Gain net moyen : +${combo.gain_moyen.toFixed(2)} € | Gain max : +${combo.gain_maximum.toFixed(2)} €</td>`;
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

        // Mettre à jour l'en-tête avec les meilleurs chiffres (top combo)
        const topCombo = comboList[0];
        minGainElement.textContent = `+${topCombo.gain_minimum.toFixed(2)} €`;
        avgGainElement.textContent = `+${topCombo.gain_moyen.toFixed(2)} €`;
        selectedHorsesElement.textContent = topCombo.chevaux.length;
        totalStakeElement.textContent = `${totalBet.toFixed(2)} €`;
    }
    
    // Générer les chevaux initiaux au chargement de la page
    generateHorseEntries(parseInt(horseCountInput.value) || 5);
});
