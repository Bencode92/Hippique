document.addEventListener('DOMContentLoaded', function() {
  // Animation pour les cartes statistiques
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-5px)';
      this.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.2)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = 'none';
    });
  });

  // Gérer le clic sur le bouton d'analyse
  const analyzeBtn = document.querySelector('.analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', function() {
      // Animation simple pour le bouton
      this.classList.add('clicked');
      setTimeout(() => {
        this.classList.remove('clicked');
      }, 200);
      
      // Ici vous pourriez ajouter la logique pour charger les données d'analyse
      console.log('Analyse en cours...');
    });
  }

  // Fonction de recherche
  const searchInput = document.querySelector('.search input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      
      // Filtrer les jockeys en fonction du terme de recherche
      document.querySelectorAll('.jockey-item').forEach(item => {
        const jockeyName = item.querySelector('h3').textContent.toLowerCase();
        
        if (jockeyName.includes(searchTerm)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });
  }
});