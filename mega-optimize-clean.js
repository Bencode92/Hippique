// mega-optimize-clean.js
// Walk-forward STRICT — ZERO leakage
// Toutes les features sont calculées UNIQUEMENT sur données < date de la course
// Pas de fichier pré-calculé, tout incrémental
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';

function bayesRate(w, n, mu = 0.084, alpha = 10) {
  return (w + alpha * mu) / (n + alpha);
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
        if (!['Plat', 'Obstacle'].includes(c.type)) continue;
        const parts = c.participants || [];
        if (!parts.length || !parts[0].jockey || parts.length < 4) continue;
        courses.push({
          date: dm[1],
          distance: parseInt(String(c.distance || '').replace(/[^0-9]/g, '')) || 0,
          type: c.type,
          nbPartants: parts.length,
          participants: parts.map((p, i) => ({
            pos: parseInt(p['n°'] || (i + 1)),
            ch: (p.cheval || '').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase(),
            j: (p.jockey || '').toUpperCase().trim(),
            e: (p.entraineur || p['entraîneur'] || '').toUpperCase().trim(),
            poids: parseInt(String(p.poids || '').match(/(\d+)/)?.[1] || 0),
            corde: parseInt(String(p.corde || '').match(/(\d+)/)?.[1] || 0),
            nbC: parseInt(p.nb_courses) || 0,
            nbV: parseInt(p.nb_victoires) || 0,
            nbP: parseInt(p.nb_places) || 0,
            gains: parseInt(p.gains) || 0,
          }))
        });
      }
    } catch (e) { }
  }
  return courses.sort((a, b) => a.date.localeCompare(b.date));
}

// Stats accumulées walk-forward (aucun fichier pré-calculé)
class WalkForwardStats {
  constructor() {
    this.cheval = {};    // ch → {c, v, p, gains, lastDate, results:[]}
    this.jockey = {};    // j → {c, v, results:[]}
    this.combo = {};     // j|||e → {c, v}
    this.chevalDist = {}; // ch → {sprint:{c,v}, mile:{c,v}, ...}
    this.jockeyDist = {}; // j → {sprint:{c,v}, ...}
  }

  update(course) {
    const db = this.getDistBucket(course.distance);
    for (const p of course.participants) {
      if (!p.pos || p.pos < 1) continue;
      const isWin = p.pos === 1;
      const isPlace = p.pos <= 3;

      // Cheval
      if (p.ch) {
        if (!this.cheval[p.ch]) this.cheval[p.ch] = { c: 0, v: 0, p: 0, gains: 0, results: [] };
        this.cheval[p.ch].c++;
        if (isWin) this.cheval[p.ch].v++;
        if (isPlace) this.cheval[p.ch].p++;
        this.cheval[p.ch].gains += p.gains || 0;
        this.cheval[p.ch].results.push({ date: course.date, pos: p.pos, n: course.nbPartants });
      }

      // Jockey
      if (p.j) {
        if (!this.jockey[p.j]) this.jockey[p.j] = { c: 0, v: 0, results: [] };
        this.jockey[p.j].c++;
        if (isWin) this.jockey[p.j].v++;
        this.jockey[p.j].results.push({ date: course.date, pos: p.pos });
      }

      // Combo
      if (p.j && p.e) {
        const k = `${p.j}|||${p.e}`;
        if (!this.combo[k]) this.combo[k] = { c: 0, v: 0 };
        this.combo[k].c++;
        if (isWin) this.combo[k].v++;
      }

      // Distance cheval
      if (p.ch && db) {
        if (!this.chevalDist[p.ch]) this.chevalDist[p.ch] = {};
        if (!this.chevalDist[p.ch][db]) this.chevalDist[p.ch][db] = { c: 0, v: 0 };
        this.chevalDist[p.ch][db].c++;
        if (isWin) this.chevalDist[p.ch][db].v++;
      }

      // Distance jockey
      if (p.j && db) {
        if (!this.jockeyDist[p.j]) this.jockeyDist[p.j] = {};
        if (!this.jockeyDist[p.j][db]) this.jockeyDist[p.j][db] = { c: 0, v: 0 };
        this.jockeyDist[p.j][db].c++;
        if (isWin) this.jockeyDist[p.j][db].v++;
      }
    }
  }

  getDistBucket(d) {
    if (d < 1400) return 'sprint';
    if (d < 1900) return 'mile';
    if (d < 2400) return 'middle';
    return 'staying';
  }

  // Forme récente walk-forward (decay exponentiel, uniquement courses passées)
  getFormeCheval(ch) {
    const s = this.cheval[ch];
    if (!s || s.results.length === 0) return 50;
    const last5 = s.results.slice(-5);
    let score = 0, weight = 0;
    last5.forEach((r, i) => {
      const w = (i + 1) / last5.length; // Plus récent = plus de poids
      const posScore = r.pos === 1 ? 100 : r.pos === 2 ? 75 : r.pos === 3 ? 60 : r.pos <= 5 ? 40 : 15;
      score += posScore * w;
      weight += w;
    });
    return weight > 0 ? score / weight : 50;
  }

  getFormeJockey(j) {
    const s = this.jockey[j];
    if (!s || s.results.length === 0) return 50;
    const last10 = s.results.slice(-10);
    let wins = 0;
    last10.forEach(r => { if (r.pos === 1) wins++; });
    return bayesRate(wins, last10.length, 0.1, 5) * 200;
  }

  getDistFit(key, distMap, db) {
    const d = distMap[key];
    if (!d || !d[db] || d[db].c < 2) return 0;
    const totalC = Object.values(d).reduce((s, v) => s + v.c, 0);
    const totalV = Object.values(d).reduce((s, v) => s + v.v, 0);
    const globalRate = totalC > 0 ? totalV / totalC : 0.084;
    const distRate = d[db].v / d[db].c;
    return (distRate - globalRate) * 100;
  }
}

function buildFeatures(p, course, ws) {
  const db = ws.getDistBucket(course.distance);
  const avgPoids = course.participants.reduce((s, p) => s + p.poids, 0) / course.nbPartants;

  const sc = ws.cheval[p.ch] || { c: 0, v: 0, p: 0 };
  const sj = ws.jockey[p.j] || { c: 0, v: 0 };
  const co = ws.combo[`${p.j}|||${p.e}`] || { c: 0, v: 0 };

  return {
    // Walk-forward bayésiennes (ZERO leakage)
    walkChevalV: bayesRate(sc.v, sc.c, 0.084, 10) * 100,
    walkChevalP: bayesRate(sc.p, sc.c, 0.3, 10) * 100,
    walkJockeyV: bayesRate(sj.v, sj.c, 0.084, 20) * 100,
    walkCombo: bayesRate(co.v, co.c, bayesRate(sj.v, sj.c, 0.084, 20), 5) * 100,
    walkFormeCheval: ws.getFormeCheval(p.ch),
    walkFormeJockey: ws.getFormeJockey(p.j),
    walkDistCheval: ws.getDistFit(p.ch, ws.chevalDist, db),
    walkDistJockey: ws.getDistFit(p.j, ws.jockeyDist, db),
    corde: p.corde > 0 ? 50 + (50 - (p.corde - 1) * 8) * ({ sprint: 0.5, mile: 0.3, middle: 0.15, staying: 0.05 }[db] || 0.2) : 50,
    poids: avgPoids > 0 && p.poids > 0 ? 50 - (p.poids - avgPoids) * 2 : 50,
    experience: Math.min(100, sc.c * 5),
  };
}

function evaluate(courses, ws, params) {
  let top1 = 0, top3in3 = 0, total = 0, ll = 0;
  const localWS = Object.create(ws); // Shallow copy pour walk-forward

  for (const course of courses) {
    const scored = course.participants.map(p => {
      const f = buildFeatures(p, course, ws);
      let score = 0;
      for (const [feat, weight] of Object.entries(params.weights)) {
        if (f[feat] !== undefined) score += f[feat] * weight;
      }
      return { ...p, score, features: f };
    });

    scored.sort((a, b) => b.score - a.score);
    const maxS = Math.max(...scored.map(s => s.score));
    const exps = scored.map(s => Math.exp((s.score - maxS) / params.temp));
    const sumE = exps.reduce((a, b) => a + b, 0);
    scored.forEach((s, i) => s.proba = exps[i] / sumE);

    total++;
    if (scored[0].pos === 1) top1++;
    if (scored.slice(0, 3).some(s => s.pos <= 3)) top3in3++;
    const winner = scored.find(s => s.pos === 1);
    if (winner) ll += -Math.log(Math.max(winner.proba, 1e-6));

    // Update APRÈS prédiction
    ws.update(course);
  }

  return { total, top1: +(top1 / total * 100).toFixed(1), top3: +(top3in3 / total * 100).toFixed(1), ll: +(ll / total).toFixed(3) };
}

async function main() {
  console.log('=== MÉGA OPTIMISATION CLEAN (ZERO LEAKAGE) ===\n');

  const courses = await loadCourses();
  console.log(`${courses.length} courses\n`);

  const trainEnd = Math.floor(courses.length * 0.6);
  const valEnd = Math.floor(courses.length * 0.8);
  console.log(`Train: 0-${trainEnd} (${courses[trainEnd - 1]?.date}) | Val: ${trainEnd}-${valEnd} (${courses[valEnd - 1]?.date}) | Test: ${valEnd}-${courses.length}\n`);

  // Accumuler les stats sur le train
  const trainWS = new WalkForwardStats();
  for (let i = 0; i < trainEnd; i++) trainWS.update(courses[i]);

  // Configs à tester — UNIQUEMENT des features walk-forward
  const configs = [
    { name: 'WALK_V', weights: { walkChevalV: 1, walkJockeyV: 0.5 }, temp: 8 },
    { name: 'WALK_VP', weights: { walkChevalV: 1, walkChevalP: 0.3, walkJockeyV: 0.5 }, temp: 8 },
    { name: 'WALK+FORME', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, walkFormeCheval: 0.5, walkFormeJockey: 0.2 }, temp: 8 },
    { name: 'WALK+FORME_FORT', weights: { walkChevalV: 0.5, walkJockeyV: 0.2, walkFormeCheval: 1.0, walkFormeJockey: 0.3 }, temp: 8 },
    { name: 'FORME_ONLY', weights: { walkFormeCheval: 1, walkFormeJockey: 0.3 }, temp: 8 },
    { name: 'WALK+DIST', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, walkDistCheval: 0.5, walkDistJockey: 0.3 }, temp: 8 },
    { name: 'WALK+COMBO', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, walkCombo: 0.3 }, temp: 8 },
    { name: 'WALK+CORDE', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, corde: 0.2 }, temp: 8 },
    { name: 'WALK+POIDS', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, poids: 0.2 }, temp: 8 },
    { name: 'WALK+EXP', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, experience: 0.2 }, temp: 8 },
    { name: 'ALL_CLEAN', weights: { walkChevalV: 0.5, walkChevalP: 0.2, walkJockeyV: 0.3, walkFormeCheval: 0.4, walkFormeJockey: 0.1, walkDistCheval: 0.2, walkCombo: 0.1 }, temp: 8 },
    { name: 'ALL_CLEAN_FORT', weights: { walkChevalV: 0.7, walkChevalP: 0.3, walkJockeyV: 0.4, walkFormeCheval: 0.6, walkFormeJockey: 0.2, walkDistCheval: 0.3, walkDistJockey: 0.2, walkCombo: 0.15 }, temp: 8 },
    // Températures
    { name: 'WALK+FORME t5', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, walkFormeCheval: 0.5, walkFormeJockey: 0.2 }, temp: 5 },
    { name: 'WALK+FORME t3', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, walkFormeCheval: 0.5, walkFormeJockey: 0.2 }, temp: 3 },
    { name: 'WALK+FORME t12', weights: { walkChevalV: 0.7, walkJockeyV: 0.3, walkFormeCheval: 0.5, walkFormeJockey: 0.2 }, temp: 12 },
    // Alpha bayésien
    { name: 'WALK_a5', weights: { walkChevalV: 1, walkJockeyV: 0.5 }, temp: 8, alpha: 5 },
    { name: 'WALK_a20', weights: { walkChevalV: 1, walkJockeyV: 0.5 }, temp: 8, alpha: 20 },
  ];

  console.log('Config'.padEnd(22) + 'Top1%  Top3%  LL');
  console.log('-'.repeat(55));

  const results = [];
  for (const cfg of configs) {
    // Clone les walk stats pour chaque config
    const ws = new WalkForwardStats();
    for (let i = 0; i < trainEnd; i++) ws.update(courses[i]);

    const r = evaluate(courses.slice(trainEnd, valEnd), ws, cfg);
    results.push({ ...cfg, ...r });
    console.log(cfg.name.padEnd(22) + String(r.top1).padEnd(7) + String(r.top3).padEnd(7) + r.ll);
  }

  results.sort((a, b) => {
    const sa = a.top1 * 2 + a.top3 - a.ll * 10;
    const sb = b.top1 * 2 + b.top3 - b.ll * 10;
    return sb - sa;
  });

  console.log('\n=== TOP 3 (validation) ===');
  results.slice(0, 3).forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}: top1=${r.top1}% top3=${r.top3}% LL=${r.ll}`);
  });

  // Test final
  const best = results[0];
  console.log('\n=== TEST FINAL (ZERO LEAKAGE) ===');
  const testWS = new WalkForwardStats();
  for (let i = 0; i < valEnd; i++) testWS.update(courses[i]);

  const testR = evaluate(courses.slice(valEnd), testWS, best);
  const avgN = courses.slice(valEnd).reduce((s, c) => s + c.nbPartants, 0) / testR.total;

  console.log(`Config: ${best.name}`);
  console.log(`Courses: ${testR.total}`);
  console.log(`Top 1: ${testR.top1}% (baseline ${(100 / avgN).toFixed(1)}%)`);
  console.log(`Top 3 in 3: ${testR.top3}%`);
  console.log(`Log-loss: ${testR.ll} (uniforme ${Math.log(avgN).toFixed(3)})`);
  console.log(`Lift vs random: +${(testR.top1 - 100 / avgN).toFixed(1)} pts`);
  console.log(`Weights: ${JSON.stringify(best.weights)}`);

  await fs.mkdir('./data/backtest', { recursive: true });
  await fs.writeFile('./data/backtest/clean_optimization.json', JSON.stringify({
    date: new Date().toISOString(), method: 'ZERO_LEAKAGE',
    allResults: results.slice(0, 5), bestConfig: best, testResult: testR,
    baseline: { top1: +(100 / avgN).toFixed(1), ll: +Math.log(avgN).toFixed(3) }
  }, null, 2));
  console.log('\n✅ data/backtest/clean_optimization.json');
}

main().catch(err => { console.error(err); process.exit(1); });
