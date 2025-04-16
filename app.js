// Application React principale pour l'analyse hippique
// Utilise le gestionnaire de données pour afficher les informations

const { useState, useEffect } = React;
const { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } = Recharts;

// Composant principal
const App = () => {
  // États
  const [activeMenu, setActiveMenu] = useState('accueil');
  const [courses, setCourses] = useState([]);
  const [selectedHippodrome, setSelectedHippodrome] = useState('');
  const [selectedHippodromeData, setSelectedHippodromeData] = useState(null);
  const [jockeys, setJockeys] = useState([]);
  const [chevaux, setChevaux] = useState([]);
  const [entraineurs, setEntraineurs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState('16/04/2025');
  const [formattedDate, setFormattedDate] = useState('2025-04-16');
  const [statsData, setStatsData] = useState({
    coursesAnalysees: 0,
    coursesAnalyseesEvolution: '+12%',
    chevaux: 0,
    jockeys: 0,
    gainsMoyens: '0 €',
    gainsMoyensEvolution: '+82%'
  });
  
  // Couleurs du thème
  const COLORS = ['#e9d18c', '#1a514e', '#22c7b8', '#163e3c', '#0f2a28', '#f5e9c9'];
  
  // Au chargement du composant
  useEffect(() => {
    loadData();
  }, []);
  
  // Au changement d'hippodrome
  useEffect(() => {
    if (selectedHippodrome) {
      loadHippodromeData();
    }
  }, [selectedHippodrome, formattedDate]);
  
  // Fonction principale de chargement des données
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Attendre que le gestionnaire de données soit prêt
      window.dataManager.onReady(async () => {
        // Récupérer les top jockeys
        const topJockeys = window.dataManager.getTopJockeys(10);
        setJockeys(topJockeys.map(jockey => ({
          nom: jockey.NomPostal,
          victoires: jockey.Victoires,
          place: jockey.Place,
          gainPart: jockey.GainPart,
          score: Math.round(jockey.Victoires * 100 + jockey.Place * 20)
        })));
        
        // Récupérer les top chevaux
        const topChevaux = window.dataManager.getTopChevaux(10);
        setChevaux(topChevaux.map(cheval => ({
          nom: cheval.Nom || cheval.cheval || "Inconnu",
          victoires: parseInt(cheval.Victoires || 0),
          place: parseInt(cheval.Place || 0),
          gain: parseFloat(cheval.AllocTot?.toString().replace(/\s+/g, '').replace(',', '.') || 0)
        })));
        
        // Pour les entraineurs, nous utilisons des données simulées pour le moment
        setEntraineurs([
          { nom: "Y. BARBEROT", victoires: 32, gainTotal: 432000 },
          { nom: "P. GROUALLE", victoires: 27, gainTotal: 387500 },
          { nom: "M. RULEC", victoires: 24, gainTotal: 356200 },
          { nom: "G. MOSSE", victoires: 21, gainTotal: 312450 },
          { nom: "S. JESUS", victoires: 19, gainTotal: 298700 }
        ]);
        
        // Récupérer les hippodromes disponibles pour la date
        const hippodromes = await window.dataManager.getHippodromesForDate(formattedDate);
        setCourses(hippodromes.map(hippodrome => ({
          hippodrome: hippodrome,
          date: selectedDate,
          courses: Math.floor(Math.random() * 10) + 3, // Simulé
          participants: Math.floor(Math.random() * 100) + 50 // Simulé
        })));
        
        // Récupérer les statistiques globales
        const stats = window.dataManager.getGlobalStats();
        if (stats) {
          setStatsData({
            coursesAnalysees: stats.coursesCount || 73,
            coursesAnalyseesEvolution: '+12%',
            chevaux: stats.chevauxCount || 150,
            jockeys: stats.jockeysCount || 150,
            gainsMoyens: `${Math.round(stats.gainsMoyens || 33143).toLocaleString()} €`,
            gainsMoyensEvolution: '+82%'
          });
        }
        
        setLoading(false);
      });
      
    } catch (err) {
      console.error("Erreur lors du chargement des données:", err);
      setError("Erreur lors du chargement des données. Veuillez rafraîchir la page.");
      setLoading(false);
    }
  };
  
  // Charger les données d'un hippodrome spécifique
  const loadHippodromeData = async () => {
    if (!selectedHippodrome || !formattedDate) return;
    
    try {
      setLoading(true);
      
      // Récupérer les données des courses pour l'hippodrome et la date
      const coursesData = await window.dataManager.getCoursesData(
        formattedDate, 
        selectedHippodrome
      );
      
      setSelectedHippodromeData(coursesData);
      setLoading(false);
    } catch (err) {
      console.error(`Erreur lors du chargement des données pour ${selectedHippodrome}:`, err);
      setError(`Impossible de charger les données pour ${selectedHippodrome}`);
      setLoading(false);
    }
  };
  
  // Filtrer les jockeys selon la recherche
  const filteredJockeys = searchQuery 
    ? jockeys.filter(jockey => jockey.nom.toLowerCase().includes(searchQuery.toLowerCase()))
    : jockeys;
  
  // Données pour les graphiques
  const performanceData = [
    { name: 'Janvier', victoires: 42, places: 112 },
    { name: 'Février', victoires: 48, places: 127 },
    { name: 'Mars', victoires: 56, places: 139 },
    { name: 'Avril', victoires: 73, places: 184 }
  ];
  
  const gainData = [
    { name: 'Janvier', gain: 22500 },
    { name: 'Février', gain: 24800 },
    { name: 'Mars', gain: 27600 },
    { name: 'Avril', gain: 33143 }
  ];
  
  const coursesParHippodrome = [
    { name: 'ParisLongchamp', value: 73 },
    { name: 'Chantilly', value: 58 },
    { name: 'Deauville', value: 62 },
    { name: 'Saint-Cloud', value: 49 },
    { name: 'Auteuil', value: 41 },
    { name: 'Maisons-Laffitte', value: 38 }
  ];
  
  // Gestionnaires d'événements
  const handleHippodromeChange = (event) => {
    setSelectedHippodrome(event.target.value);
  };
  
  const handleDateChange = (date) => {
    setSelectedDate(date);
    // Convertir au format YYYY-MM-DD pour l'API
    const [day, month, year] = date.split('/');
    setFormattedDate(`${year}-${month}-${day}`);
  };
  
  const handleSearch = (event) => {
    setSearchQuery(event.target.value);
  };
  
  // Composant de graphique en camembert
  const renderPieChart = () => {
    return (
      <div className="stats-chart">
        <h3>Répartition des courses par hippodrome</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={coursesParHippodrome}
              cx="50%"
              cy="50%"
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
              label={(entry) => entry.name}
            >
              {coursesParHippodrome.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value} courses`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };
  
  // Composant de graphique en ligne
  const renderLineChart = () => {
    return (
      <div className="stats-chart">
        <h3>Évolution des gains moyens</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={gainData}
            margin={{
              top: 5, right: 30, left: 20, bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `${value.toLocaleString()} €`} />
            <Legend />
            <Line type="monotone" dataKey="gain" stroke="#e9d18c" activeDot={{ r: 8 }} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };
  
  // Composant de graphique en barres
  const renderBarChart = () => {
    return (
      <div className="stats-chart">
        <h3>Performances mensuelles</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={performanceData}
            margin={{
              top: 5, right: 30, left: 20, bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="victoires" fill="#22c7b8" name="Victoires" />
            <Bar dataKey="places" fill="#e9d18c" name="Places" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Composant des courses du jour
  const renderCoursesDuJour = () => {
    return (
      <div className="courses-du-jour">
        <h2>Courses du {selectedDate}</h2>
        
        <div className="hippodrome-selector">
          <div className="select-wrapper">
            <select value={selectedHippodrome} onChange={handleHippodromeChange}>
              <option value="">Choisir l'hippodrome</option>
              {courses.map((course, index) => (
                <option key={index} value={course.hippodrome}>{course.hippodrome}</option>
              ))}
            </select>
          </div>
        </div>
        
        {loading && selectedHippodrome && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>Chargement des données...</p>
          </div>
        )}
        
        {selectedHippodrome && !selectedHippodromeData && !loading && (
          <div className="no-data">
            <p>Aucune donnée disponible pour {selectedHippodrome} le {selectedDate}.</p>
            <p>Voici des données simulées pour démonstration:</p>
            
            <div className="course-cards">
              {[1, 2, 3, 4, 5].map((i) => (
                <div className="course-card" key={i}>
                  <div className="course-header">
                    <span className="course-time">{`${13 + i}:${i % 2 === 0 ? '50' : '25'}`}</span>
                    <span className="course-number">Course {i}</span>
                  </div>
                  <h4>{i === 1 ? "PRIX DE LA FONTAINE CARPEAUX" : 
                       i === 2 ? "PRIX DU LOUVRE" :
                       i === 3 ? "PRIX DE LA PROMENADE DES PLANCHES" :
                       i === 4 ? "PRIX DU TOTALISATEUR AUTOMATIQUE" : "PRIX DE LA BOETIE"}</h4>
                  <div className="course-info">
                    <div>{(1400 + i * 200)}m | Plat</div>
                    <div>{10 + i * 2} partants</div>
                    <div>Prix: {(48000 + i * 2000).toLocaleString()}€</div>
                  </div>
                  <button className="view-btn" onClick={() => alert(`Détails des partants: Course ${i}`)}>
                    Voir les partants
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {selectedHippodrome && selectedHippodromeData && !loading && (
          <div className="course-details">
            <h3>Programme des courses à {selectedHippodrome}</h3>
            
            <div className="course-cards">
              {selectedHippodromeData.courses.map((course, index) => (
                <div className="course-card" key={index}>
                  <div className="course-header">
                    <span className="course-time">{`${13 + index}:${index % 2 === 0 ? '50' : '25'}`}</span>
                    <span className="course-number">Course {index + 1}</span>
                  </div>
                  <h4>{course.nom}</h4>
                  <div className="course-info">
                    <div>{course.participants.length > 0 ? `${(1400 + index * 200).toLocaleString()}m | Plat` : 'Informations non disponibles'}</div>
                    <div>{course.participants.length} partants</div>
                    <div>Prix: {(48000 + index * 2000).toLocaleString()}€</div>
                  </div>
                  <button className="view-btn" onClick={() => alert(`Détails des partants pour: ${course.nom}`)}>
                    Voir les partants
                  </button>
                </div>
              ))}
              
              {selectedHippodromeData.courses.length === 0 && (
                <p className="no-data">Aucune course disponible pour cet hippodrome à cette date.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Composant de la page d'accueil
  const renderAccueil = () => {
    return (
      <div className="accueil-container">
        <div className="stats-grid">
          <div className="stat-card">
            <h3><i className="fas fa-flag-checkered"></i> Courses Analysées</h3>
            <div className="value">{statsData.coursesAnalysees}</div>
            <div className="trend positive">{statsData.coursesAnalyseesEvolution}</div>
          </div>
          <div className="stat-card">
            <h3><i className="fas fa-horse"></i> Chevaux</h3>
            <div className="value">{statsData.chevaux}</div>
            <div className="metric">Performance moyenne</div>
          </div>
          <div className="stat-card">
            <h3><i className="fas fa-user"></i> Jockeys</h3>
            <div className="value">{statsData.jockeys}</div>
            <div className="metric">Performance moyenne</div>
          </div>
          <div className="stat-card">
            <h3><i className="fas fa-euro-sign"></i> Gains Moyens</h3>
            <div className="value">{statsData.gainsMoyens}</div>
            <div className="trend positive">{statsData.gainsMoyensEvolution}</div>
          </div>
        </div>

        <div className="charts-container">
          <div className="charts-row">
            {renderBarChart()}
            {renderLineChart()}
          </div>
          <div className="charts-row">
            {renderPieChart()}
          </div>
        </div>

        <div className="analyze-section">
          <h2>Sélectionner une course à analyser</h2>
          <div className="analyze-controls">
            <div className="select-wrapper">
              <select value={selectedHippodrome} onChange={handleHippodromeChange}>
                <option value="">Choisir l'hippodrome</option>
                {courses.map((course, index) => (
                  <option key={index} value={course.hippodrome}>{course.hippodrome}</option>
                ))}
              </select>
            </div>
            <div className="date-picker" onClick={() => alert('Sélecteur de date à implémenter')}>{selectedDate}</div>
          </div>
          <button className="analyze-btn" onClick={() => setActiveMenu('courses')}>
            <i className="fas fa-chart-line"></i> Analyser la course
          </button>
        </div>

        <div className="jockeys-section">
          <h2>Top Jockeys</h2>
          <div className="jockey-list">
            {filteredJockeys.slice(0, 6).map((jockey, index) => (
              <div className="jockey-item" key={index}>
                <div className="jockey-img">
                  <img src={`/api/placeholder/50/50`} alt={jockey.nom} />
                </div>
                <div className="jockey-info">
                  <h3>{jockey.nom}</h3>
                  <div className="progress-bar">
                    <div className="progress" style={{ width: `${(jockey.score / 10000) * 100}%` }}></div>
                  </div>
                  <span className="score">{jockey.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  
  // Composant de la page des jockeys
  const renderJockeys = () => {
    return (
      <div className="section-container">
        <h2>Classement des Jockeys</h2>
        <p>Statistiques des meilleurs jockeys sur l'année 2025</p>
        
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Rechercher un jockey..." 
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
        
        <div className="data-grid">
          <div className="data-header">
            <div className="data-cell">Rang</div>
            <div className="data-cell">Nom</div>
            <div className="data-cell">Victoires</div>
            <div className="data-cell">Places</div>
            <div className="data-cell">Gain/Part.</div>
            <div className="data-cell">Score</div>
          </div>
          
          {filteredJockeys.map((jockey, index) => (
            <div className="data-row" key={index}>
              <div className="data-cell">{index + 1}</div>
              <div className="data-cell">{jockey.nom}</div>
              <div className="data-cell">{jockey.victoires}</div>
              <div className="data-cell">{jockey.place}</div>
              <div className="data-cell">{jockey.gainPart}€</div>
              <div className="data-cell">{jockey.score}</div>
            </div>
          ))}
          
          {filteredJockeys.length === 0 && (
            <div className="no-results">Aucun jockey ne correspond à votre recherche</div>
          )}
        </div>
      </div>
    );
  };
  
  // Composant de la page des chevaux
  const renderChevaux = () => {
    return (
      <div className="section-container">
        <h2>Performances des Chevaux</h2>
        <p>Données des chevaux les plus performants</p>
        
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Rechercher un cheval..." 
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
        
        <div className="data-grid">
          <div className="data-header">
            <div className="data-cell">Nom</div>
            <div className="data-cell">Victoires</div>
            <div className="data-cell">Places</div>
            <div className="data-cell">Gains totaux</div>
          </div>
          
          {chevaux
            .filter(cheval => cheval.nom.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((cheval, index) => (
              <div className="data-row" key={index}>
                <div className="data-cell">{cheval.nom}</div>
                <div className="data-cell">{cheval.victoires}</div>
                <div className="data-cell">{cheval.place}</div>
                <div className="data-cell">{cheval.gain.toLocaleString()}€</div>
              </div>
            ))}
            
          {chevaux.filter(cheval => cheval.nom.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
            <div className="no-results">Aucun cheval ne correspond à votre recherche</div>
          )}
        </div>
      </div>
    );
  };
  
  // Composant de la page des entraîneurs
  const renderEntraineurs = () => {
    return (
      <div className="section-container">
        <h2>Classement des Entraîneurs</h2>
        <p>Statistiques des meilleurs entraîneurs sur l'année 2025</p>
        
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Rechercher un entraîneur..." 
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
        
        <div className="data-grid">
          <div className="data-header">
            <div className="data-cell">Rang</div>
            <div className="data-cell">Nom</div>
            <div className="data-cell">Victoires</div>
            <div className="data-cell">Gains totaux</div>
          </div>
          
          {entraineurs
            .filter(entraineur => entraineur.nom.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((entraineur, index) => (
              <div className="data-row" key={index}>
                <div className="data-cell">{index + 1}</div>
                <div className="data-cell">{entraineur.nom}</div>
                <div className="data-cell">{entraineur.victoires}</div>
                <div className="data-cell">{entraineur.gainTotal.toLocaleString()}€</div>
              </div>
            ))}
            
          {entraineurs.filter(entraineur => entraineur.nom.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
            <div className="no-results">Aucun entraîneur ne correspond à votre recherche</div>
          )}
        </div>
      </div>
    );
  };
  
  // Rendu conditionnel du contenu principal
  const renderContent = () => {
    if (loading && !selectedHippodrome) {
      return <div className="loading-indicator">Chargement des données...</div>;
    }
    
    if (error) {
      return <div className="error-message">{error}</div>;
    }
    
    switch (activeMenu) {
      case 'accueil':
        return renderAccueil();
      case 'courses':
        return renderCoursesDuJour();
      case 'jockeys':
        return renderJockeys();
      case 'chevaux':
        return renderChevaux();
      case 'entraineurs':
        return renderEntraineurs();
      default:
        return renderAccueil();
    }
  };
  
  // Rendu principal
  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <i className="fas fa-horse-head" style={{ fontSize: '2rem', color: 'var(--gold)' }}></i>
          <h1>ANALYSE HIPPIQUE</h1>
        </div>
        <div className="search">
          <input 
            type="text" 
            placeholder="Rechercher un cheval, jockey..." 
            value={searchQuery}
            onChange={handleSearch}
          />
          <button><i className="fas fa-search"></i></button>
        </div>
      </header>
      
      <nav className="main-nav">
        <ul>
          <li className={activeMenu === 'accueil' ? 'active' : ''} onClick={() => setActiveMenu('accueil')}>
            <i className="fas fa-home"></i> Accueil
          </li>
          <li className={activeMenu === 'courses' ? 'active' : ''} onClick={() => setActiveMenu('courses')}>
            <i className="fas fa-flag-checkered"></i> Courses
          </li>
          <li className={activeMenu === 'jockeys' ? 'active' : ''} onClick={() => setActiveMenu('jockeys')}>
            <i className="fas fa-user"></i> Jockeys
          </li>
          <li className={activeMenu === 'chevaux' ? 'active' : ''} onClick={() => setActiveMenu('chevaux')}>
            <i className="fas fa-horse"></i> Chevaux
          </li>
          <li className={activeMenu === 'entraineurs' ? 'active' : ''} onClick={() => setActiveMenu('entraineurs')}>
            <i className="fas fa-users"></i> Entraîneurs
          </li>
        </ul>
      </nav>
      
      <main>
        {renderContent()}
      </main>
      
      <footer>
        <h1>ANALYSE HIPPIQUE</h1>
        <p>Système d'analyse pour événements hippiques - Dernière mise à jour: {selectedDate}</p>
      </footer>
    </div>
  );
};

// Montage de l'application React
ReactDOM.render(
  <App />,
  document.getElementById('app-root')
);