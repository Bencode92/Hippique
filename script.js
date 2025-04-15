// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', function() {
  // Initialiser le graphique de tendances
  initTrendsChart();
});

// Fonction pour initialiser le graphique de tendances
function initTrendsChart() {
  const ctx = document.getElementById('trendsChart').getContext('2d');
  
  // Données de simulation pour le graphique
  const data = {
    labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
    datasets: [{
      label: 'Performance',
      data: [65, 58, 76, 78, 56, 55, 72, 60, 65, 70, 85, 90],
      borderColor: '#7effce',
      backgroundColor: 'rgba(13, 40, 24, 0.5)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: '#7effce',
      pointBorderColor: '#0d2818',
      fill: false
    }]
  };
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleColor: '#e6d58f',
        bodyColor: '#fff',
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        padding: 12,
        displayColors: false
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(126, 255, 212, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(126, 255, 212, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      }
    }
  };
  
  // Créer le graphique
  const trendsChart = new Chart(ctx, {
    type: 'line',
    data: data,
    options: options
  });
  
  // Animer les éléments géométriques
  animateElements();
}

// Fonction pour animer les éléments géométriques
function animateElements() {
  // Animer les points de données
  document.querySelectorAll('.data-point').forEach((point, index) => {
    setInterval(() => {
      const opacity = window.getComputedStyle(point).opacity;
      point.style.opacity = opacity > 0.2 ? '0.1' : '0.3';
    }, 2000 + (index * 500));
  });
  
  // Animer les lignes géométriques
  document.querySelectorAll('.line').forEach((line, index) => {
    setInterval(() => {
      const opacity = window.getComputedStyle(line).opacity;
      line.style.opacity = opacity > 0.4 ? '0.3' : '0.5';
    }, 3000 + (index * 700));
  });
  
  // Animer les courbes
  document.querySelectorAll('.curved-path').forEach((curve, index) => {
    setInterval(() => {
      const opacity = window.getComputedStyle(curve).opacity;
      curve.style.opacity = opacity > 0.08 ? '0.06' : '0.1';
    }, 4000 + (index * 1000));
  });
}

// Fonction pour la recherche
function searchFilter() {
  const searchInput = document.getElementById('searchInput');
  const filter = searchInput.value.toUpperCase();
  const jockeyCards = document.querySelectorAll('.jockey-card');
  
  jockeyCards.forEach(card => {
    const name = card.querySelector('.jockey-name').textContent;
    if (name.toUpperCase().indexOf(filter) > -1) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}