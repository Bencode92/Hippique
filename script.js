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
      backgroundColor: 'rgba(126, 255, 206, 0.1)',
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
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
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
      this.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(126, 255, 212, 0.1)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    });
  });
  
  // Effet de chargement sur le bouton d'analyse
  document.querySelector('.btn-primary').addEventListener('click', function(e) {
    e.preventDefault();
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    
    setTimeout(() => {
      this.innerHTML = '<i class="fas fa-chart-line"></i> Analyser la course';
      showHologramPulse();
    }, 1500);
  });
}

// Fonction pour animer les hologrammes de façon dynamique
function animateHolograms() {
  const holograms = document.querySelectorAll('.hologram');
  
  // Ajout d'animation dynamique pour chaque hologramme
  holograms.forEach(hologram => {
    // Ajout d'une animation de pulse
    hologram.style.animation = `${hologram.style.animation || ''}, pulse 4s infinite ease-in-out`;
    
    // Animation aléatoire pour les positions
    setInterval(() => {
      const randomX = Math.random() * 10 - 5; // valeur entre -5 et 5
      const randomY = Math.random() * 10 - 5; // valeur entre -5 et 5
      hologram.style.transform = `translate(${randomX}px, ${randomY}px)`;
    }, 5000);
  });
}

// Fonction pour créer un effet de pulse holographique temporaire
function showHologramPulse() {
  // Créer un élément d'effet holographique pulse
  const pulse = document.createElement('div');
  pulse.classList.add('hologram', 'track');
  pulse.style.position = 'fixed';
  pulse.style.top = '50%';
  pulse.style.left = '50%';
  pulse.style.transform = 'translate(-50%, -50%) scale(0.1)';
  pulse.style.opacity = '0.2';
  pulse.style.zIndex = '10';
  pulse.style.transition = 'transform 2s ease-out, opacity 2s ease-out';
  
  // Ajouter l'élément à la page
  document.querySelector('.hologram-container').appendChild(pulse);
  
  // Démarrer l'animation
  setTimeout(() => {
    pulse.style.transform = 'translate(-50%, -50%) scale(2)';
    pulse.style.opacity = '0';
  }, 100);
  
  // Supprimer l'élément après l'animation
  setTimeout(() => {
    pulse.remove();
  }, 2000);
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