/**
 * Script de correction pour le toggle Dutch/EV
 * À inclure dans simulation.html juste avant la fermeture de body
 */

document.addEventListener('DOMContentLoaded', function() {
    // Sélection du toggle
    const toggle = document.getElementById('strategyToggle');
    
    if (toggle) {
        console.log("Toggle trouvé, initialisation...");
        
        // Fonction pour définir la stratégie
        function setStrategy(isEV) {
            window.currentStrategy = isEV ? 'ev' : 'dutch';
            console.log("Stratégie définie à:", window.currentStrategy);
            
            // Recalculer si nécessaire
            const resultContainer = document.getElementById('resultContainer');
            if (resultContainer && resultContainer.style.display === 'block') {
                console.log("Recalcul des résultats...");
                const calculateButton = document.getElementById('calculateBets');
                if (calculateButton) calculateButton.click();
            }
        }
        
        // Initialisation de la stratégie
        window.currentStrategy = toggle.checked ? 'ev' : 'dutch';
        console.log("Stratégie initiale:", window.currentStrategy);
        
        // Écouteur d'événement direct
        toggle.addEventListener('change', function() {
            console.log("Toggle changé, checked:", this.checked);
            setStrategy(this.checked);
        });
        
        // Écouteur pour les clics sur les labels
        const leftLabel = document.querySelector('.strategy-toggle-container label:first-child');
        const rightLabel = document.querySelector('.strategy-toggle-container label:last-child');
        
        if (leftLabel) {
            leftLabel.addEventListener('click', function() {
                console.log("Clic sur label Dutch");
                toggle.checked = false;
                setStrategy(false);
            });
        }
        
        if (rightLabel) {
            rightLabel.addEventListener('click', function() {
                console.log("Clic sur label EV");
                toggle.checked = true;
                setStrategy(true);
            });
        }
        
        // Forcer la visibilité du toggle
        toggle.style.opacity = "1";
        toggle.style.visibility = "visible";
        
        console.log("Initialisation du toggle terminée");
    } else {
        console.error("Toggle non trouvé!");
    }
});
