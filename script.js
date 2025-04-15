// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', function() {
  // Initialiser le graphique de tendances
  initTrendsChart();
  
  // Mettre à jour les compteurs avec animation
  animateCounters();
  
  // Ajouter des événements aux éléments interactifs
  setupEventListeners();
  
  // Animer les hologrammes
  animateHolograms();
});

// Fonction pour initialiser le graphique de tendances
function initTrendsChart() {
  const ctx = document.getElementById('trendsChart').getContext('2d');
  
  // Données de simulation pour le graphique
  const data = {
    labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
    datasets: [{
      label: 'Performance',
      data: [65, 59, 80, 81, 56, 55, 72, 60, 65, 70, 85, 90],
      borderColor: '#7effce',
      backgroundColor: 'rgba(126, 255, 206, 0.2)',
      tension: 0.4,
      pointBackgroundColor: '#e6d58f',
      pointBorderColor: '#0a2718',
      pointRadius: 5,
      pointHoverRadius: 7,
      fill: true
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
          color: 'rgba(126, 255, 206, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(126, 255, 206, 0.1)'
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
}

// Fonction pour animer les compteurs
function animateCounters() {
  const counters = document.querySelectorAll('.number');
  
  counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-target'));
    const duration = 2000; // durée de l'animation en ms
    const steps = 50; // nombre d'étapes
    const stepTime = duration / steps;
    const increment = target / steps;
    let current = 0;
    
    const updateCounter = () => {
      current += increment;
      if (current < target) {
        counter.textContent = Math.ceil(current);
        setTimeout(updateCounter, stepTime);
      } else {
        counter.textContent = target;
      }
    };
    
    updateCounter();
  });
}

// Fonction pour configurer les écouteurs d'événements
function setupEventListeners() {
  // Effet hover sur les cartes de statistiques
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
      this.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(126, 255, 212, 0.2)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    });
  });
  
  // Effet de chargement sur le bouton d'analyse
  document.querySelector('.btn-primary').addEventListener('click', function(e) {
    e.preventDefault();
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    
    // Créer un flash holographique
    createHolographicFlash();
    
    setTimeout(() => {
      this.innerHTML = '<i class="fas fa-chart-line"></i> Analyser la course';
      showHologramPulse();
    }, 1500);
  });
}

// Créer un flash holographique sur tout l'écran
function createHolographicFlash() {
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.top = '0';
  flash.style.left = '0';
  flash.style.width = '100%';
  flash.style.height = '100%';
  flash.style.backgroundColor = 'rgba(126, 255, 212, 0.15)';
  flash.style.zIndex = '9999';
  flash.style.pointerEvents = 'none';
  flash.style.transition = 'opacity 0.5s ease-out';
  
  document.body.appendChild(flash);
  
  // Disparition progressive
  setTimeout(() => {
    flash.style.opacity = '0';
  }, 100);
  
  // Supprimer l'élément après l'animation
  setTimeout(() => {
    document.body.removeChild(flash);
  }, 600);
}

// Fonction pour animer les hologrammes
function animateHolograms() {
  // Ajout d'éléments holographiques supplémentaires de façon dynamique
  createRandomHolographicElements();
  
  // Animation des données holographiques
  setInterval(() => {
    const dots = document.querySelectorAll('.holo-stats');
    dots.forEach(dot => {
      // Animation d'opacité pour simuler une transmission de données
      const currentOpacity = parseFloat(window.getComputedStyle(dot).opacity);
      dot.style.opacity = currentOpacity > 0.3 ? '0.3' : '0.5';
    });
  }, 2000);
}

// Fonction pour créer un effet de pulse holographique temporaire
function showHologramPulse() {
  // Créer un élément d'effet holographique pulse
  const pulse = document.createElement('div');
  pulse.style.position = 'fixed';
  pulse.style.top = '50%';
  pulse.style.left = '50%';
  pulse.style.width = '300px';
  pulse.style.height = '300px';
  pulse.style.backgroundColor = 'transparent';
  pulse.style.borderRadius = '50%';
  pulse.style.border = '4px solid #7effce';
  pulse.style.transform = 'translate(-50%, -50%) scale(0.1)';
  pulse.style.opacity = '0.8';
  pulse.style.zIndex = '10';
  pulse.style.transition = 'transform 1.5s ease-out, opacity 1.5s ease-out';
  pulse.style.boxShadow = '0 0 30px rgba(126, 255, 212, 0.5)';
  pulse.style.pointerEvents = 'none';
  
  // Ajouter l'élément à la page
  document.body.appendChild(pulse);
  
  // Démarrer l'animation
  setTimeout(() => {
    pulse.style.transform = 'translate(-50%, -50%) scale(3)';
    pulse.style.opacity = '0';
  }, 50);
  
  // Supprimer l'élément après l'animation
  setTimeout(() => {
    document.body.removeChild(pulse);
  }, 1600);
}

// Créer des éléments holographiques aléatoires
function createRandomHolographicElements() {
  // Créer des points de données holographiques supplémentaires
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const dataPoint = document.createElement('div');
      dataPoint.style.position = 'absolute';
      dataPoint.style.width = '8px';
      dataPoint.style.height = '8px';
      dataPoint.style.backgroundColor = '#7effce';
      dataPoint.style.borderRadius = '50%';
      dataPoint.style.boxShadow = '0 0 15px rgba(126, 255, 212, 0.8)';
      dataPoint.style.opacity = '0.6';
      dataPoint.style.zIndex = '0';
      dataPoint.style.pointerEvents = 'none';
      
      // Position aléatoire
      dataPoint.style.top = Math.random() * 100 + '%';
      dataPoint.style.left = Math.random() * 100 + '%';
      
      // Animation
      dataPoint.style.animation = 'pulse 3s infinite alternate';
      
      document.body.appendChild(dataPoint);
      
      // Simuler une transmission de données
      setInterval(() => {
        const currentOpacity = parseFloat(window.getComputedStyle(dataPoint).opacity);
        dataPoint.style.opacity = currentOpacity > 0.3 ? '0.3' : '0.6';
      }, Math.random() * 2000 + 1000);
    }, i * 1000);
  }
  
  // Créer des lignes de connexion holographiques
  setTimeout(() => {
    const connection = document.createElement('div');
    connection.style.position = 'fixed';
    connection.style.top = '30%';
    connection.style.left = '20%';
    connection.style.width = '60%';
    connection.style.height = '1px';
    connection.style.backgroundColor = '#7effce';
    connection.style.boxShadow = '0 0 10px rgba(126, 255, 212, 0.5)';
    connection.style.opacity = '0.3';
    connection.style.zIndex = '0';
    connection.style.transform = 'rotate(30deg)';
    connection.style.pointerEvents = 'none';
    
    document.body.appendChild(connection);
    
    // Faire clignoter la connexion
    setInterval(() => {
      const currentOpacity = parseFloat(window.getComputedStyle(connection).opacity);
      connection.style.opacity = currentOpacity > 0.2 ? '0.2' : '0.4';
    }, 3000);
  }, 3000);
}

// Fonction pour la recherche
function searchFilter() {
  const searchInput = document.getElementById('searchInput');
  const filter = searchInput.value.toUpperCase();
  const items = document.querySelectorAll('.searchable-item');
  
  items.forEach(item => {
    const text = item.textContent || item.innerText;
    if (text.toUpperCase().indexOf(filter) > -1) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}