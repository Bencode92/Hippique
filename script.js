document.addEventListener('DOMContentLoaded', function() {
  // Initialiser le graphique
  initPerformanceChart();
});

function initPerformanceChart() {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(34, 199, 184, 0.4)');
  gradient.addColorStop(1, 'rgba(34, 199, 184, 0)');
  
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
      datasets: [{
        label: 'Performance',
        data: [40, 35, 60, 55, 45, 60, 50, 60, 70, 80, 85, 90],
        borderColor: '#22c7b8',
        backgroundColor: gradient,
        tension: 0.4,
        borderWidth: 3,
        pointBackgroundColor: '#22c7b8',
        pointBorderColor: '#163e3c',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(233, 209, 140, 0.1)',
          },
          ticks: {
            color: 'rgba(245, 233, 201, 0.7)',
          }
        },
        x: {
          grid: {
            color: 'rgba(233, 209, 140, 0.1)',
          },
          ticks: {
            color: 'rgba(245, 233, 201, 0.7)',
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(22, 62, 60, 0.8)',
          titleColor: '#e9d18c',
          bodyColor: '#f5e9c9',
          borderColor: 'rgba(233, 209, 140, 0.3)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            label: function(context) {
              return 'Performance: ' + context.parsed.y + '%';
            }
          }
        }
      }
    }
  });
}

// Animation subtile pour les cartes statistiques
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
document.querySelector('.analyze-btn').addEventListener('click', function() {
  // Animation simple pour le bouton
  this.classList.add('clicked');
  setTimeout(() => {
    this.classList.remove('clicked');
  }, 200);
  
  // Ici vous pourriez ajouter la logique pour charger les données d'analyse
  console.log('Analyse en cours...');
});

// Fonction de recherche
document.querySelector('.search input').addEventListener('input', function() {
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