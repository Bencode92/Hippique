/**
 * Module de navigation entre les dates pour les courses hippiques
 * Permet de naviguer facilement entre les différentes journées de courses
 */

document.addEventListener('DOMContentLoaded', function() {
    // Référence au bouton de date existant et l'input date
    const dateButton = document.getElementById('date-button');
    const dateInput = document.getElementById('date-input');
    const currentDateSpan = document.getElementById('current-date');
    
    if (!dateButton || !dateInput || !currentDateSpan) return;
    
    // Ajouter les boutons de navigation supplémentaires
    const navigationHTML = `
        <div class="date-navigation">
            <button id="prevDay" class="date-nav-button">
                <i class="fas fa-chevron-left"></i> Jour précédent
            </button>
            <button id="todayButton" class="date-nav-button today">
                <i class="fas fa-calendar-day"></i> Aujourd'hui
            </button>
            <button id="nextDay" class="date-nav-button">
                Jour suivant <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
    
    // Insérer les boutons de navigation juste après le bouton de date existant
    dateButton.insertAdjacentHTML('afterend', navigationHTML);
    
    // Fonction pour charger une date spécifique
    function loadSpecificDate(date) {
        // Mettre à jour la variable currentDate utilisée dans coursesLoader
        window.currentDate = date;
        
        // Mettre à jour l'affichage de la date
        currentDateSpan.textContent = coursesLoader.getReadableDate(date);
        
        // Mettre à jour la valeur de l'input date
        dateInput.value = coursesLoader.formatDateYMD(date);
        
        // Recharger les données des courses
        loadCoursesForCurrentDate();
    }
    
    // Événements pour les boutons de navigation
    document.getElementById('prevDay').addEventListener('click', function() {
        const prevDay = new Date(window.currentDate);
        prevDay.setDate(prevDay.getDate() - 1);
        loadSpecificDate(prevDay);
    });
    
    document.getElementById('nextDay').addEventListener('click', function() {
        const nextDay = new Date(window.currentDate);
        nextDay.setDate(nextDay.getDate() + 1);
        loadSpecificDate(nextDay);
    });
    
    document.getElementById('todayButton').addEventListener('click', function() {
        loadSpecificDate(new Date());
    });
    
    // Fonction globale que nous exposerons pour être utilisée par d'autres scripts
    window.dateNavigator = {
        loadSpecificDate: loadSpecificDate,
        goToPreviousDay: function() {
            const prevDay = new Date(window.currentDate);
            prevDay.setDate(prevDay.getDate() - 1);
            loadSpecificDate(prevDay);
        },
        goToNextDay: function() {
            const nextDay = new Date(window.currentDate);
            nextDay.setDate(nextDay.getDate() + 1);
            loadSpecificDate(nextDay);
        },
        goToToday: function() {
            loadSpecificDate(new Date());
        }
    };
});