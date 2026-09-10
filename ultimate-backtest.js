// ultimate-backtest.js
// Test EXHAUSTIF : toutes les combinaisons de features et poids
// Comparé au favori marché sur chaque course
// Walk-forward strict, zero leakage
const fs = require('fs').promises;
const path = require('path');

function bayesRate(w, n, mu = 0.084, alpha = 10) { return (w + alpha * mu) / (n + alpha); }

async function loadCourses() {
  const files = (await fs.readdir('data/courses')).filter(f => f.endsWith('.json')).sort();
  const courses = [];
  for (const file of files) {
    const dm = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;
    try {
      const data = JSON.parse(await fs.readFile('data/courses/' + file, 'utf8'));
      for (const c of (data.courses || [])) {
        if (!c.arrivee_definitive) continue;
        const parts = c.participants || [];
        if (parts.length < 4 || !parts[0].arrivee || !parts.some(p => p.cote > 1)) continue;
        courses.push({
          date: dm[1], nbP: parts.length, type: c.type,
          dist: parseInt(String(c.distance || '').replace(/[^0-9]/g, '')) || 0,
          hippo: data.hippodrome || '',
          participants: parts.map(p => ({
            pos: p.arrivee, cote: p.cote || 0,
            ch: (p.cheval || '').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase(),
            j: (p.jockey || '').toUpperCase().trim(),
            e: (p.entraineur || p['entraîneur'] || '').toUpperCase().trim(),
            poids: parseInt(String(p.poids || '').match(/(\d+)/)?.[1] || 0),
            corde: parseInt(String(p.corde || '').match(/(\d+)/)?.[1] || 0),
            nbC: parseInt(p.nb_courses) || 0, nbV: parseInt(p.nb_victoires) || 0,
            nbP: parseInt(p.nb_places) || 0, gains: parseInt(p.gains) || 0,
          }))
        });
      }
    } catch (e) { }
  }
  return courses.sort((a, b) => a.date.localeCompare(b.date));
}

class Stats {
  constructor() { this.ch = {}; this.j = {}; this.e = {}; this.combo = {}; this.chDist = {}; this.jDist = {}; }

  update(course) {
    const db = course.dist < 1400 ? 'sprint' : course.dist < 1900 ? 'mile' : course.dist < 2400 ? 'middle' : 'staying';
    for (const p of course.participants) {
      if (!p.pos || p.pos < 1) continue;
      const w = p.pos === 1;
      if (p.ch) {
        if (!this.ch[p.ch]) this.ch[p.ch] = { c: 0, v: 0, p: 0, g: 0, r: [] };
        this.ch[p.ch].c++; if (w) this.ch[p.ch].v++; if (p.pos <= 3) this.ch[p.ch].p++;
        this.ch[p.ch].g += p.gains; this.ch[p.ch].r.push(p.pos);
        if (!this.chDist[p.ch]) this.chDist[p.ch] = {};
        if (!this.chDist[p.ch][db]) this.chDist[p.ch][db] = { c: 0, v: 0 };
        this.chDist[p.ch][db].c++; if (w) this.chDist[p.ch][db].v++;
      }
      if (p.j) {
        if (!this.j[p.j]) this.j[p.j] = { c: 0, v: 0, r: [] };
        this.j[p.j].c++; if (w) this.j[p.j].v++; this.j[p.j].r.push(p.pos);
        if (!this.jDist[p.j]) this.jDist[p.j] = {};
        if (!this.jDist[p.j][db]) this.jDist[p.j][db] = { c: 0, v: 0 };
        this.jDist[p.j][db].c++; if (w) this.jDist[p.j][db].v++;
      }
      if (p.e) {
        if (!this.e[p.e]) this.e[p.e] = { c: 0, v: 0 };
        this.e[p.e].c++; if (w) this.e[p.e].v++;
      }
      if (p.j && p.e) {
        const k = p.j + '|||' + p.e;
        if (!this.combo[k]) this.combo[k] = { c: 0, v: 0 };
        this.combo[k].c++; if (w) this.combo[k].v++;
      }
    }
  }

  forme(key, type) {
    const s = (type === 'ch' ? this.ch : this.j)[key];
    if (!s || !s.r.length) return 50;
    const l = s.r.slice(-5);
    let sc = 0, w = 0;
    l.forEach((r, i) => { const wt = (i + 1) / l.length; const ps = r === 1 ? 100 : r === 2 ? 75 : r === 3 ? 60 : r <= 5 ? 40 : 15; sc += ps * wt; w += wt; });
    return w > 0 ? sc / w : 50;
  }

  distFit(key, distMap, db) {
    const d = distMap[key];
    if (!d || !d[db] || d[db].c < 2) return 0;
    const tc = Object.values(d).reduce((s, v) => s + v.c, 0);
    const tv = Object.values(d).reduce((s, v) => s + v.v, 0);
    return tc > 0 ? (d[db].v / d[db].c - tv / tc) * 100 : 0;
  }
}

function buildFeatures(p, course, ws) {
  const db = course.dist < 1400 ? 'sprint' : course.dist < 1900 ? 'mile' : course.dist < 2400 ? 'middle' : 'staying';
  const sc = ws.ch[p.ch] || { c: 0, v: 0, p: 0, g: 0, r: [] };
  const sj = ws.j[p.j] || { c: 0, v: 0, r: [] };
  const se = ws.e[p.e] || { c: 0, v: 0 };
  const co = ws.combo[(p.j + '|||' + p.e)] || { c: 0, v: 0 };
  const avgP = course.participants.reduce((s, x) => s + x.poids, 0) / course.nbP;

  return {
    // Cote marché (proba implicite)
    coteProba: p.cote > 1 ? 1 / p.cote : 0.1,

    // Walk-forward bayésiennes
    chevalV: bayesRate(sc.v, sc.c, 0.084, 10) * 100,
    chevalP: bayesRate(sc.p, sc.c, 0.3, 10) * 100,
    jockeyV: bayesRate(sj.v, sj.c, 0.084, 20) * 100,
    entraineurV: bayesRate(se.v, se.c, 0.084, 15) * 100,
    comboV: bayesRate(co.v, co.c, bayesRate(sj.v, sj.c, 0.084, 20), 5) * 100,

    // Forme
    formeCheval: ws.forme(p.ch, 'ch'),
    formeJockey: ws.forme(p.j, 'j'),

    // Distance
    distCheval: ws.distFit(p.ch, ws.chDist, db),
    distJockey: ws.distFit(p.j, ws.jDist, db),

    // Stats individuelles PMU
    indivV: p.nbC >= 2 ? bayesRate(p.nbV, p.nbC, 0.084, 10) * 100 : 8.4,
    indivP: p.nbC >= 2 ? bayesRate(p.nbP, p.nbC, 0.3, 10) * 100 : 30,
    gainPC: p.nbC >= 2 ? Math.min(100, p.gains / p.nbC / 50000) : 50,
    experience: Math.min(100, (sc.c || 0) * 5),

    // Corde et poids
    corde: p.corde > 0 ? 50 + (50 - (p.corde - 1) * 8) * ({ sprint: 0.5, mile: 0.3, middle: 0.15, staying: 0.05 }[db] || 0.2) : 50,
    poids: avgP > 0 && p.poids > 0 ? 50 - (p.poids - avgP) * 2 : 50,
  };
}

function evaluate(courses, startIdx, ws, weights, temp) {
  let top1 = 0, top2 = 0, top3 = 0, total = 0;
  let favTop1 = 0, favTop2 = 0;
  let beatFavTop1 = 0, beatFavTop2 = 0;

  for (let i = startIdx; i < courses.length; i++) {
    const c = courses[i];
    total++;

    // Notre modèle
    const scored = c.participants.map(p => {
      const f = buildFeatures(p, c, ws);
      let score = 0;
      for (const [k, w] of Object.entries(weights)) {
        if (f[k] !== undefined && w !== 0) score += f[k] * w;
      }
      return { ...p, score };
    });
    scored.sort((a, b) => b.score - a.score);

    if (scored[0]?.pos === 1) top1++;
    if (scored.slice(0, 2).some(p => p.pos === 1)) top2++;
    if (scored.slice(0, 3).some(p => p.pos === 1)) top3++;

    // Favori marché
    const byOdds = [...c.participants.filter(p => p.cote > 1)].sort((a, b) => a.cote - b.cote);
    if (byOdds[0]?.pos === 1) favTop1++;
    if (byOdds.slice(0, 2).some(p => p.pos === 1)) favTop2++;

    // Notre modèle bat-il le favori ?
    if (scored[0]?.pos === 1 && byOdds[0]?.pos !== 1) beatFavTop1++;
    if (scored.slice(0, 2).some(p => p.pos === 1) && !byOdds.slice(0, 2).some(p => p.pos === 1)) beatFavTop2++;

    ws.update(c);
  }

  return { total, top1: +(top1 / total * 100).toFixed(1), top2: +(top2 / total * 100).toFixed(1), top3: +(top3 / total * 100).toFixed(1), favTop1: +(favTop1 / total * 100).toFixed(1), favTop2: +(favTop2 / total * 100).toFixed(1), beatFavTop1, beatFavTop2 };
}

async function main() {
  console.log('=== ULTIMATE BACKTEST : TOUTES COMBINAISONS vs MARCHÉ ===\n');

  const courses = await loadCourses();
  console.log(courses.length + ' courses avec arrivées + cotes\n');

  const WARMUP = Math.floor(courses.length * 0.4);
  const VAL_END = Math.floor(courses.length * 0.7);

  console.log('Warm-up: ' + WARMUP + ' | Val: ' + WARMUP + '-' + VAL_END + ' | Test: ' + VAL_END + '-' + courses.length + '\n');

  // Features individuelles
  const featureNames = ['coteProba', 'chevalV', 'chevalP', 'jockeyV', 'entraineurV', 'comboV', 'formeCheval', 'formeJockey', 'distCheval', 'distJockey', 'indivV', 'indivP', 'gainPC', 'experience', 'corde', 'poids'];

  // Configs à tester — MASSIF
  const configs = [];

  // 1. Chaque feature seule
  for (const f of featureNames) {
    configs.push({ name: f + '_SEUL', weights: { [f]: 1 }, temp: 12 });
  }

  // 2. Cote seule (baseline marché)
  configs.push({ name: 'COTE_PURE', weights: { coteProba: 1 }, temp: 12 });

  // 3. Cote + chaque feature
  for (const f of featureNames) {
    if (f === 'coteProba') continue;
    configs.push({ name: 'COTE+' + f, weights: { coteProba: 1, [f]: 0.3 }, temp: 12 });
    configs.push({ name: 'COTE+' + f + '_fort', weights: { coteProba: 0.7, [f]: 0.5 }, temp: 12 });
  }

  // 4. Cote + combinaisons 2 features
  const topFeatures = ['chevalV', 'jockeyV', 'formeCheval', 'formeJockey', 'indivV', 'gainPC', 'comboV'];
  for (let i = 0; i < topFeatures.length; i++) {
    for (let j = i + 1; j < topFeatures.length; j++) {
      configs.push({
        name: 'COTE+' + topFeatures[i].slice(0, 6) + '+' + topFeatures[j].slice(0, 6),
        weights: { coteProba: 1, [topFeatures[i]]: 0.3, [topFeatures[j]]: 0.3 },
        temp: 12
      });
    }
  }

  // 5. Sans cote — meilleures combos pures
  configs.push({ name: 'PURE_chV+jV+forme', weights: { chevalV: 0.7, jockeyV: 0.3, formeCheval: 0.5, formeJockey: 0.2 }, temp: 12 });
  configs.push({ name: 'PURE_indiv+forme', weights: { indivV: 0.5, gainPC: 0.3, formeCheval: 0.5 }, temp: 12 });
  configs.push({ name: 'PURE_all', weights: { chevalV: 0.5, jockeyV: 0.3, formeCheval: 0.3, indivV: 0.3, gainPC: 0.2, comboV: 0.1 }, temp: 12 });

  // 6. Cote + tout
  configs.push({ name: 'COTE+ALL_light', weights: { coteProba: 1, chevalV: 0.2, jockeyV: 0.1, formeCheval: 0.2, indivV: 0.1 }, temp: 12 });
  configs.push({ name: 'COTE+ALL_fort', weights: { coteProba: 0.5, chevalV: 0.3, jockeyV: 0.2, formeCheval: 0.3, formeJockey: 0.1, indivV: 0.2, gainPC: 0.1, comboV: 0.1 }, temp: 12 });

  // 7. Températures
  for (const t of [3, 5, 8, 15, 20]) {
    configs.push({ name: 'COTE_t' + t, weights: { coteProba: 1 }, temp: t });
  }

  console.log(configs.length + ' configurations à tester\n');

  // Phase validation
  console.log('Config'.padEnd(35) + 'Top1   Top2   Top3   FavT1  FavT2  BatFav');
  console.log('-'.repeat(90));

  const results = [];
  for (const cfg of configs) {
    const ws = new Stats();
    for (let i = 0; i < WARMUP; i++) ws.update(courses[i]);

    const wsClone = JSON.parse(JSON.stringify(ws));
    Object.setPrototypeOf(wsClone, Stats.prototype);
    // Copier les méthodes
    wsClone.forme = ws.forme.bind(wsClone);
    wsClone.distFit = ws.distFit.bind(wsClone);
    wsClone.update = ws.update.bind(wsClone);

    // Recréer un objet Stats propre
    const wsEval = new Stats();
    wsEval.ch = JSON.parse(JSON.stringify(ws.ch));
    wsEval.j = JSON.parse(JSON.stringify(ws.j));
    wsEval.e = JSON.parse(JSON.stringify(ws.e));
    wsEval.combo = JSON.parse(JSON.stringify(ws.combo));
    wsEval.chDist = JSON.parse(JSON.stringify(ws.chDist));
    wsEval.jDist = JSON.parse(JSON.stringify(ws.jDist));

    const r = evaluate(courses.slice(WARMUP, VAL_END), 0, wsEval, cfg.weights, cfg.temp);
    const composite = r.top1 * 2 + r.top2 * 1.5 + r.top3 - r.favTop1 * 2;
    results.push({ ...cfg, ...r, composite });

    if (r.top1 >= r.favTop1 - 5 || r.top2 >= r.favTop2 - 5) {
      console.log(cfg.name.padEnd(35) +
        String(r.top1).padEnd(7) + String(r.top2).padEnd(7) + String(r.top3).padEnd(7) +
        String(r.favTop1).padEnd(7) + String(r.favTop2).padEnd(7) +
        (r.top1 >= r.favTop1 ? '✅T1 ' : '') + (r.top2 >= r.favTop2 ? '✅T2' : ''));
    }
  }

  // Top résultats
  results.sort((a, b) => b.top2 - a.top2);

  console.log('\n=== TOP 10 CONFIGS PAR TOP2 (gagnant dans nos 2 premiers) ===');
  console.log('Config'.padEnd(35) + 'Top1   Top2   Top3   FavT1  FavT2  BatFav?');
  console.log('-'.repeat(90));
  results.slice(0, 10).forEach(r => {
    const bat1 = r.top1 >= r.favTop1 ? '✅' : '❌';
    const bat2 = r.top2 >= r.favTop2 ? '✅' : '❌';
    console.log(r.name.padEnd(35) + String(r.top1).padEnd(7) + String(r.top2).padEnd(7) + String(r.top3).padEnd(7) + String(r.favTop1).padEnd(7) + String(r.favTop2).padEnd(7) + bat1 + 'T1 ' + bat2 + 'T2');
  });

  // Configs qui BATTENT le favori marché
  const beatFav1 = results.filter(r => r.top1 > r.favTop1);
  const beatFav2 = results.filter(r => r.top2 > r.favTop2);

  console.log('\n=== CONFIGS QUI BATTENT LE FAVORI ===');
  console.log('Battent en Top1: ' + beatFav1.length + '/' + results.length);
  beatFav1.forEach(r => console.log('  ' + r.name + ': ' + r.top1 + '% vs ' + r.favTop1 + '% (Δ+' + (r.top1 - r.favTop1).toFixed(1) + ')'));

  console.log('\nBattent en Top2: ' + beatFav2.length + '/' + results.length);
  beatFav2.forEach(r => console.log('  ' + r.name + ': ' + r.top2 + '% vs ' + r.favTop2 + '% (Δ+' + (r.top2 - r.favTop2).toFixed(1) + ')'));

  // TEST FINAL sur le best qui bat le favori (si il existe)
  const bestBeat = results.find(r => r.top2 > r.favTop2) || results[0];
  console.log('\n=== TEST FINAL (données jamais vues) ===');
  console.log('Config: ' + bestBeat.name);

  const testWS = new Stats();
  for (let i = 0; i < VAL_END; i++) testWS.update(courses[i]);
  const testR = evaluate(courses.slice(VAL_END), 0, testWS, bestBeat.weights, bestBeat.temp);

  console.log('Courses test: ' + testR.total);
  console.log('Notre Top1: ' + testR.top1 + '% | Favori: ' + testR.favTop1 + '% | ' + (testR.top1 >= testR.favTop1 ? '✅ ON BAT' : '❌ Marché gagne'));
  console.log('Notre Top2: ' + testR.top2 + '% | Favori: ' + testR.favTop2 + '% | ' + (testR.top2 >= testR.favTop2 ? '✅ ON BAT' : '❌ Marché gagne'));
  console.log('Notre Top3: ' + testR.top3 + '%');
  console.log('Weights: ' + JSON.stringify(bestBeat.weights));

  // Sauvegarder
  await fs.writeFile('data/backtest/ultimate_report.json', JSON.stringify({
    date: new Date().toISOString(),
    configs_tested: configs.length,
    top10: results.slice(0, 10).map(r => ({ name: r.name, top1: r.top1, top2: r.top2, favTop1: r.favTop1, favTop2: r.favTop2, weights: r.weights })),
    beatFavoriTop1: beatFav1.map(r => r.name),
    beatFavoriTop2: beatFav2.map(r => r.name),
    testResult: { config: bestBeat.name, ...testR, weights: bestBeat.weights }
  }, null, 2));

  console.log('\n✅ data/backtest/ultimate_report.json');
}

main().catch(err => { console.error(err); process.exit(1); });
