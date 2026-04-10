// mega-optimize.js
// Grid search MASSIF sur toutes les combinaisons de features et poids
// Walk-forward strict : train 60% → val 20% → test 20%
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';

function bayesRate(w, n, mu, alpha) { return (w + alpha * mu) / (n + alpha); }

async function loadAllData() {
  // Charger classements pondérés
  const loadPond = async (f) => {
    try {
      const d = JSON.parse(await fs.readFile('data/' + f, 'utf8'));
      const m = {};
      (d.resultats || []).forEach(i => {
        const k = (i.Nom || i.NomPostal || '').toUpperCase().trim();
        if (k) m[k] = { rang: parseInt(i.Rang), tauxV: parseFloat(i.TauxVictoire) || 0, gainMoy: parseFloat(i.GainMoyen) || 0, scoreMixte: parseFloat(i.ScoreMixte) || 0 };
      });
      return { map: m, total: d.resultats?.length || 1 };
    } catch (e) { return { map: {}, total: 1 }; }
  };

  const loadJson = async (f) => {
    try { return JSON.parse(await fs.readFile('data/' + f, 'utf8')).resultats || {}; }
    catch (e) { return {}; }
  };

  return {
    chevaux: await loadPond('chevaux_ponderated_latest.json'),
    jockeys: await loadPond('jockeys_ponderated_latest.json'),
    entraineurs: await loadPond('entraineurs_ponderated_latest.json'),
    eleveurs: await loadPond('eleveurs_ponderated_latest.json'),
    proprietaires: await loadPond('proprietaires_ponderated_latest.json'),
    cravacheOr: await loadPond('cravache_or_ponderated_latest.json'),
    chevaux25: await loadPond('chevaux_2025_ponderated_latest.json'),
    jockeys25: await loadPond('jockeys_2025_ponderated_latest.json'),
    entraineurs25: await loadPond('entraineurs_2025_ponderated_latest.json'),
    distChevaux: await loadJson('chevaux_distance_stats.json'),
    distJockeys: await loadJson('jockeys_distance_stats.json'),
    formeChevaux: await loadJson('chevaux_forme_recente.json'),
    formeJockeys: await loadJson('jockeys_forme_recente.json'),
    combos: await loadJson('combo_jockey_entraineur.json'),
    stableForm: await loadJson('stable_form.json'),
    intervalle: await loadJson('intervalle_courses.json'),
  };
}

async function loadCourses() {
  const files = (await fs.readdir(COURSES_DIR)).filter(f => f.endsWith('.json')).sort();
  const courses = [];
  for (const file of files) {
    const dm = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;
    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));
      for (const c of (data.courses || [])) {
        if (!['Plat','Obstacle'].includes(c.type)) continue;
        const parts = c.participants || [];
        if (!parts.length || !parts[0].jockey || parts.length < 4) continue;
        courses.push({
          date: dm[1], distance: parseInt(String(c.distance||'').replace(/[^0-9]/g,''))||0,
          type: c.type, hippodrome: data.hippodrome || '',
          participants: parts.map((p,i) => ({
            pos: parseInt(p['n°']||(i+1)),
            ch: (p.cheval||'').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i,'').trim().toUpperCase(),
            j: (p.jockey||'').toUpperCase().trim(),
            e: (p.entraineur||p['entraîneur']||'').toUpperCase().trim(),
            el: (p['éleveurs']||'').toUpperCase().trim(),
            pr: (p['propriétaire']||'').toUpperCase().trim(),
            poids: parseInt(String(p.poids||'').match(/(\d+)/)?.[1]||0),
            nbC: parseInt(p.nb_courses)||0, nbV: parseInt(p.nb_victoires)||0,
            nbP: parseInt(p.nb_places)||0, gains: parseInt(p.gains)||0,
            corde: parseInt(String(p.corde||'').match(/(\d+)/)?.[1]||0),
            cote: parseFloat(p.cote)||0,
          }))
        });
      }
    } catch(e) {}
  }
  return courses.sort((a,b) => a.date.localeCompare(b.date));
}

function matchInitiale(map, nom) {
  if (!nom || nom.length < 3) return null;
  if (map[nom]) return map[nom];
  const cleaned = nom.replace(/^MME\s+|^MLLE\s+/i,'');
  const m = cleaned.match(/^([A-Z]{1,3})\.?\s*(.+?)(?:\s*\(.*\))?$/);
  if (!m) return null;
  const init = m[1].charAt(0);
  let fam = m[2].trim().replace(/\s*\([A-Z]\)\s*$/,'').trim();
  if (fam.length < 3) return null;
  for (const [k,v] of Object.entries(map)) {
    if ((k.endsWith(fam) || k.includes(' '+fam)) && k.replace(fam,'').replace(/^MME\s+/i,'').trim().charAt(0) === init) return v;
  }
  return null;
}

function percentile(rang, total) { return rang ? 100 * (1 - (rang-1)/Math.max(total,1)) : null; }

function scoreCourse(course, allData, params, walkStats) {
  const db = course.distance < 1400 ? 'sprint' : course.distance < 1900 ? 'mile' : course.distance < 2400 ? 'intermediaire' : 'staying';
  const dbMap = {sprint:'sprint',mile:'mile',intermediaire:'intermediaire',staying:'staying'};
  const avgPoids = course.participants.reduce((s,p) => s + p.poids, 0) / course.participants.length;

  return course.participants.map(p => {
    let features = {};

    // F1: Rang percentile cheval 2026
    const rc = allData.chevaux.map[p.ch] || matchInitiale(allData.chevaux.map, p.ch);
    features.chevalPerc = rc ? percentile(rc.rang, allData.chevaux.total) : 50;

    // F2: Rang percentile jockey 2026
    const rj = matchInitiale(allData.jockeys.map, p.j);
    features.jockeyPerc = rj ? percentile(rj.rang, allData.jockeys.total) : 50;

    // F3: Rang percentile entraîneur 2026
    const re = matchInitiale(allData.entraineurs.map, p.e);
    features.entraineurPerc = re ? percentile(re.rang, allData.entraineurs.total) : 50;

    // F4: Gain moyen cheval (niveau course)
    features.gainMoyen = rc ? Math.min(100, rc.gainMoy / 500) : 50;

    // F5: Stats individuelles PMU (taux V bayésien)
    features.indivTauxV = p.nbC >= 2 ? bayesRate(p.nbV, p.nbC, 0.084, 10) * 100 : 8.4;

    // F6: Gains carrière par course
    features.indivGainPC = p.nbC >= 2 ? Math.min(100, (p.gains / p.nbC) / 50000) : 50;

    // F7: Forme récente cheval
    const fc = allData.formeChevaux[p.ch];
    features.formeCheval = fc ? fc.formeScore : 50;

    // F8: Forme récente jockey
    const fj = allData.formeJockeys[p.j];
    features.formeJockey = fj ? fj.formeScore : 50;

    // F9: Spé distance cheval
    const dsc = allData.distChevaux[p.ch];
    features.distCheval = (dsc && dsc[db] && dsc[db].courses >= 2 && dsc.global) ?
      dsc[db].tauxVictoire - dsc.global.tauxVictoire : 0;

    // F10: Spé distance jockey
    const dsj = allData.distJockeys[p.j];
    features.distJockey = (dsj && dsj[db] && dsj[db].courses >= 2 && dsj.global) ?
      dsj[db].tauxVictoire - dsj.global.tauxVictoire : 0;

    // F11: Combo jockey × entraîneur
    const co = allData.combos[`${p.j}|||${p.e}`];
    features.combo = (co && co.courses >= 3) ? co.tauxVictoire : 10;

    // F12: Cravache d'or
    const rco = matchInitiale(allData.cravacheOr.map, p.j);
    features.cravacheOr = rco ? percentile(rco.rang, allData.cravacheOr.total) : 0;

    // F13: Historique 2025 cheval
    const rc25 = allData.chevaux25.map[p.ch];
    features.cheval2025 = rc25 ? percentile(rc25.rang, allData.chevaux25.total) : 50;

    // F14: Historique 2025 jockey
    const rj25 = matchInitiale(allData.jockeys25.map, p.j);
    features.jockey2025 = rj25 ? percentile(rj25.rang, allData.jockeys25.total) : 50;

    // F15: Stable form
    const sf = allData.stableForm[p.e];
    features.stable = sf ? sf.formeStable : 50;

    // F16: Intervalle courses
    const ic = allData.intervalle[p.ch];
    const ij = ic ? ic.joursDepuis : 30;
    features.intervalle = ij <= 7 ? 30 : ij <= 14 ? 40 : ij <= 25 ? 70 : ij <= 45 ? 55 : ij <= 90 ? 35 : 20;

    // F17: Corde
    features.corde = p.corde > 0 ? Math.max(0, 100 - (p.corde - 1) * 8) : 50;
    const cordeImpact = {sprint:1,mile:0.6,intermediaire:0.3,staying:0.1};
    features.corde = 50 + (features.corde - 50) * (cordeImpact[db] || 0.5);

    // F18: Poids porté
    features.poids = avgPoids > 0 && p.poids > 0 ? 50 - (p.poids - avgPoids) * 3 : 50;

    // F19: Walk-forward stats (bayésiennes, accumulées uniquement sur le passé)
    const ws = walkStats;
    const wsc = ws.cheval[p.ch] || {c:0,v:0,p:0};
    features.walkCheval = bayesRate(wsc.v, wsc.c, 0.084, 10) * 100;
    const wsj = ws.jockey[p.j] || {c:0,v:0};
    features.walkJockey = bayesRate(wsj.v, wsj.c, 0.084, 20) * 100;

    // F20: Éleveur
    const rel = matchInitiale(allData.eleveurs.map, p.el);
    features.eleveurPerc = rel ? percentile(rel.rang, allData.eleveurs.total) : 50;

    // Score composé selon les paramètres
    let score = 0;
    for (const [feat, weight] of Object.entries(params.weights)) {
      if (features[feat] !== undefined && weight !== 0) {
        score += features[feat] * weight;
      }
    }

    return { ...p, score, features };
  });
}

function updateWalkStats(course, ws) {
  for (const p of course.participants) {
    if (!p.pos || p.pos < 1) continue;
    if (p.ch) { if (!ws.cheval[p.ch]) ws.cheval[p.ch]={c:0,v:0,p:0}; ws.cheval[p.ch].c++; if(p.pos===1)ws.cheval[p.ch].v++; if(p.pos<=3)ws.cheval[p.ch].p++; }
    if (p.j) { if (!ws.jockey[p.j]) ws.jockey[p.j]={c:0,v:0}; ws.jockey[p.j].c++; if(p.pos===1)ws.jockey[p.j].v++; }
  }
}

function evaluate(courses, allData, params, startIdx) {
  let top1=0, top3in3=0, total=0, ll=0;
  const ws = JSON.parse(JSON.stringify(params.initWalkStats || {cheval:{},jockey:{}}));

  for (let i = 0; i < courses.length; i++) {
    const scored = scoreCourse(courses[i], allData, params, ws);
    scored.sort((a,b) => b.score - a.score);

    const max = Math.max(...scored.map(s=>s.score));
    const exps = scored.map(s => Math.exp((s.score-max)/params.temp));
    const sum = exps.reduce((a,b)=>a+b,0);
    scored.forEach((s,idx) => s.proba = exps[idx]/sum);

    total++;
    if (scored[0].pos === 1) top1++;
    const t3 = scored.slice(0,3);
    if (t3.some(s => s.pos <= 3)) top3in3++;
    const winner = scored.find(s => s.pos === 1);
    if (winner) ll += -Math.log(Math.max(winner.proba, 1e-6));

    updateWalkStats(courses[i], ws);
  }

  return {
    total, top1: +(top1/total*100).toFixed(1), top3: +(top3in3/total*100).toFixed(1),
    ll: +(ll/total).toFixed(3), walkStats: ws
  };
}

async function main() {
  console.log('=== MÉGA OPTIMISATION — TOUTES FEATURES ===\n');

  const allData = await loadAllData();
  const courses = await loadCourses();
  console.log(`${courses.length} courses, 20 features disponibles\n`);

  const trainEnd = Math.floor(courses.length * 0.6);
  const valEnd = Math.floor(courses.length * 0.8);
  console.log(`Train: 0-${trainEnd} | Val: ${trainEnd}-${valEnd} | Test: ${valEnd}-${courses.length}\n`);

  // Walk stats pour la phase train
  const trainWS = {cheval:{},jockey:{}};
  for (let i = 0; i < trainEnd; i++) updateWalkStats(courses[i], trainWS);

  // Configurations à tester — combinaisons de poids pour chaque feature
  const featureSets = [
    // Minimaliste : cheval + jockey seulement
    { name: 'MINIMAL', weights: {chevalPerc:1,jockeyPerc:0.5}, temp: 8 },
    { name: 'MINIMAL+gain', weights: {chevalPerc:1,jockeyPerc:0.5,gainMoyen:0.3}, temp: 8 },

    // Walk-forward stats (bayésiennes pures)
    { name: 'WALK_ONLY', weights: {walkCheval:1,walkJockey:0.5}, temp: 8 },
    { name: 'WALK+indiv', weights: {walkCheval:1,walkJockey:0.5,indivTauxV:0.3}, temp: 8 },

    // Classement + walk
    { name: 'RANK+WALK', weights: {chevalPerc:0.5,jockeyPerc:0.3,walkCheval:0.5,walkJockey:0.3}, temp: 8 },
    { name: 'RANK+WALK+gain', weights: {chevalPerc:0.5,jockeyPerc:0.3,walkCheval:0.5,walkJockey:0.3,gainMoyen:0.2}, temp: 8 },

    // Avec forme
    { name: 'RANK+FORME', weights: {chevalPerc:0.7,jockeyPerc:0.3,formeCheval:0.3,formeJockey:0.1}, temp: 8 },
    { name: 'RANK+FORME+WALK', weights: {chevalPerc:0.5,jockeyPerc:0.3,formeCheval:0.2,walkCheval:0.3,walkJockey:0.2}, temp: 8 },

    // Avec distance
    { name: 'RANK+DIST', weights: {chevalPerc:0.7,jockeyPerc:0.3,distCheval:0.5,distJockey:0.3}, temp: 8 },

    // Avec combo
    { name: 'RANK+COMBO', weights: {chevalPerc:0.7,jockeyPerc:0.3,combo:0.2}, temp: 8 },

    // Avec cravache
    { name: 'RANK+CRAVACHE', weights: {chevalPerc:0.7,jockeyPerc:0.3,cravacheOr:0.2}, temp: 8 },

    // Avec 2025
    { name: 'RANK+2025', weights: {chevalPerc:0.5,jockeyPerc:0.3,cheval2025:0.3,jockey2025:0.2}, temp: 8 },

    // Avec intervalle
    { name: 'RANK+INTERV', weights: {chevalPerc:0.7,jockeyPerc:0.3,intervalle:0.2}, temp: 8 },

    // Avec stable
    { name: 'RANK+STABLE', weights: {chevalPerc:0.7,jockeyPerc:0.3,stable:0.1}, temp: 8 },

    // Avec indiv stats
    { name: 'RANK+INDIV', weights: {chevalPerc:0.5,jockeyPerc:0.3,indivTauxV:0.5,indivGainPC:0.3}, temp: 8 },
    { name: 'INDIV_ONLY', weights: {indivTauxV:1,indivGainPC:0.5}, temp: 8 },

    // Avec corde
    { name: 'RANK+CORDE', weights: {chevalPerc:0.7,jockeyPerc:0.3,corde:0.2}, temp: 8 },

    // Avec poids
    { name: 'RANK+POIDS', weights: {chevalPerc:0.7,jockeyPerc:0.3,poids:0.2}, temp: 8 },

    // Tout ensemble (léger)
    { name: 'ALL_LIGHT', weights: {chevalPerc:0.5,jockeyPerc:0.3,walkCheval:0.3,formeCheval:0.1,distCheval:0.2,combo:0.1,indivTauxV:0.2,intervalle:0.1}, temp: 8 },

    // Tout ensemble (fort)
    { name: 'ALL_HEAVY', weights: {chevalPerc:0.7,jockeyPerc:0.4,walkCheval:0.4,walkJockey:0.2,formeCheval:0.2,formeJockey:0.1,distCheval:0.3,distJockey:0.2,combo:0.15,cravacheOr:0.1,cheval2025:0.2,jockey2025:0.1,stable:0.05,intervalle:0.1,indivTauxV:0.3,indivGainPC:0.2,corde:0.05,poids:0.05}, temp: 8 },

    // Températures variées pour le meilleur config
    { name: 'RANK+WALK t5', weights: {chevalPerc:0.5,jockeyPerc:0.3,walkCheval:0.5,walkJockey:0.3}, temp: 5 },
    { name: 'RANK+WALK t3', weights: {chevalPerc:0.5,jockeyPerc:0.3,walkCheval:0.5,walkJockey:0.3}, temp: 3 },
    { name: 'RANK+WALK t12', weights: {chevalPerc:0.5,jockeyPerc:0.3,walkCheval:0.5,walkJockey:0.3}, temp: 12 },

    // Éleveur ?
    { name: 'RANK+ELEVEUR', weights: {chevalPerc:0.7,jockeyPerc:0.3,eleveurPerc:0.2}, temp: 8 },

    // Gain moyen seul
    { name: 'GAIN_ONLY', weights: {gainMoyen:1}, temp: 8 },
    { name: 'GAIN+INDIV', weights: {gainMoyen:0.5,indivGainPC:0.5,indivTauxV:0.3}, temp: 8 },
  ];

  // Évaluer chaque config sur validation
  console.log('Config'.padEnd(25) + 'Top1%  Top3%  LL     Score');
  console.log('-'.repeat(65));

  const results = [];
  for (const cfg of featureSets) {
    const params = { weights: cfg.weights, temp: cfg.temp, initWalkStats: JSON.parse(JSON.stringify(trainWS)) };
    const r = evaluate(courses.slice(trainEnd, valEnd), allData, params, 0);
    const composite = r.top1 * 2 + r.top3 - r.ll * 10;
    results.push({ ...cfg, ...r, composite });
    console.log(cfg.name.padEnd(25) + String(r.top1).padEnd(7) + String(r.top3).padEnd(7) + String(r.ll).padEnd(7) + composite.toFixed(1));
  }

  // Top 5
  results.sort((a,b) => b.composite - a.composite);
  console.log('\n=== TOP 5 CONFIGS (validation) ===');
  results.slice(0,5).forEach((r,i) => {
    console.log(`${i+1}. ${r.name}: top1=${r.top1}% top3=${r.top3}% LL=${r.ll}`);
    console.log(`   Weights: ${JSON.stringify(r.weights)}`);
  });

  // Test final sur le best
  const best = results[0];
  console.log('\n=== TEST FINAL (données jamais vues) ===');
  const valWS = JSON.parse(JSON.stringify(trainWS));
  for (let i = trainEnd; i < valEnd; i++) updateWalkStats(courses[i], valWS);

  const testParams = { weights: best.weights, temp: best.temp, initWalkStats: valWS };
  const testResult = evaluate(courses.slice(valEnd), allData, testParams, 0);

  const avgN = courses.slice(valEnd).reduce((s,c) => s + c.participants.length, 0) / testResult.total;
  console.log(`Config: ${best.name}`);
  console.log(`Courses: ${testResult.total}`);
  console.log(`Top 1 gagne:  ${testResult.top1}% (baseline: ${(100/avgN).toFixed(1)}%)`);
  console.log(`Top 3 in 3:   ${testResult.top3}%`);
  console.log(`Log-loss:     ${testResult.ll} (baseline: ${Math.log(avgN).toFixed(3)})`);
  console.log(`Weights: ${JSON.stringify(best.weights)}`);

  // Sauvegarder
  await fs.mkdir('./data/backtest', {recursive:true});
  await fs.writeFile('./data/backtest/mega_optimization.json', JSON.stringify({
    date: new Date().toISOString(),
    allResults: results.slice(0,10),
    bestConfig: best,
    testResult,
    baseline: { top1: +(100/avgN).toFixed(1), ll: +Math.log(avgN).toFixed(3) }
  }, null, 2));

  console.log('\n✅ Rapport → data/backtest/mega_optimization.json');
}

main().catch(err => { console.error('❌', err); process.exit(1); });
