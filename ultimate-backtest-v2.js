// ultimate-backtest-v2.js
// Test EXHAUSTIF des 28 critères avec toutes les pondérations
// PAS de walk-forward incrémental (source de leakage)
// Utilise UNIQUEMENT : classements figés + données PMU du participant + cotes
// Compare CHAQUE config au favori marché
const fs = require('fs').promises;

async function loadLookup(file, keyField) {
  try {
    const d = JSON.parse(await fs.readFile('data/' + file, 'utf8'));
    const m = {};
    (d.resultats || []).forEach(i => {
      const k = (i[keyField] || '').toUpperCase().trim();
      if (k) m[k] = i;
    });
    return { map: m, total: (d.resultats || []).length };
  } catch (e) { return { map: {}, total: 1 }; }
}

function matchInit(map, nom) {
  if (!nom || nom.length < 3) return null;
  const n = nom.toUpperCase().trim();
  if (map[n]) return map[n];
  const cleaned = n.replace(/^MME\s+|^MLLE\s+/i, '');
  const m = cleaned.match(/^([A-Z]{1,3})\.?\s*(.+?)(?:\s*\(.*\))?$/);
  if (!m) return null;
  const init = m[1].charAt(0);
  let fam = m[2].trim().replace(/\s*\([A-Z]\)\s*$/, '').trim();
  if (fam.length < 3) return null;
  for (const [k, v] of Object.entries(map)) {
    if ((k.endsWith(fam) || k.includes(' ' + fam)) && k.replace(fam, '').replace(/^MME\s+/i, '').trim().charAt(0) === init) return v;
  }
  return null;
}

function pct(rang, total) { return rang ? 100 * (1 - (rang - 1) / Math.max(total, 1)) : null; }

async function main() {
  console.log('=== ULTIMATE BACKTEST V2 — 28 CRITÈRES ===\n');

  // Charger tous les classements
  const lk = {
    ch: await loadLookup('chevaux_ponderated_latest.json', 'Nom'),
    j: await loadLookup('jockeys_ponderated_latest.json', 'NomPostal'),
    e: await loadLookup('entraineurs_ponderated_latest.json', 'NomPostal'),
    el: await loadLookup('eleveurs_ponderated_latest.json', 'NomPostal'),
    pr: await loadLookup('proprietaires_ponderated_latest.json', 'NomPostal'),
    co: await loadLookup('cravache_or_ponderated_latest.json', 'NomPostal'),
    ch25: await loadLookup('chevaux_2025_ponderated_latest.json', 'Nom'),
    j25: await loadLookup('jockeys_2025_ponderated_latest.json', 'NomPostal'),
    e25: await loadLookup('entraineurs_2025_ponderated_latest.json', 'NomPostal'),
  };

  // Stats dérivées
  const loadJ = async f => { try { return JSON.parse(await fs.readFile('data/' + f, 'utf8')).resultats || {}; } catch (e) { return {}; } };
  const distCh = await loadJ('chevaux_distance_stats.json');
  const distJ = await loadJ('jockeys_distance_stats.json');
  const formeCh = await loadJ('chevaux_forme_recente.json');
  const formeJ = await loadJ('jockeys_forme_recente.json');
  const combos = await loadJ('combo_jockey_entraineur.json');
  const stableF = await loadJ('stable_form.json');
  const intervalle = await loadJ('intervalle_courses.json');

  // Charger courses avec arrivées + cotes
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
          participants: parts.map(p => ({
            pos: p.arrivee, cote: p.cote || 0,
            ch: (p.cheval || '').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase(),
            j: (p.jockey || '').toUpperCase().trim(),
            e: (p.entraineur || p['entraîneur'] || '').toUpperCase().trim(),
            el: (p['éleveurs'] || '').toUpperCase().trim(),
            pr: (p['propriétaire'] || '').toUpperCase().trim(),
            poids: parseInt(String(p.poids || '').match(/(\d+)/)?.[1] || 0),
            corde: parseInt(String(p.corde || '').match(/(\d+)/)?.[1] || 0),
            nbC: parseInt(p.nb_courses) || 0, nbV: parseInt(p.nb_victoires) || 0,
            nbPl: parseInt(p.nb_places) || 0, gains: parseInt(p.gains) || 0,
            valeur: parseFloat(p.valeur) || 0,
          }))
        });
      }
    } catch (e) { }
  }

  console.log(courses.length + ' courses\n');

  // Split val/test
  const VAL_END = Math.floor(courses.length * 0.6);
  const valCourses = courses.slice(0, VAL_END);
  const testCourses = courses.slice(VAL_END);
  console.log('Val: ' + valCourses.length + ' | Test: ' + testCourses.length + '\n');

  // Construire les features pour chaque participant (PAS de walk-forward)
  function buildFeatures(p, course) {
    const db = course.dist < 1400 ? 'sprint' : course.dist < 1900 ? 'mile' : course.dist < 2400 ? 'intermediaire' : 'staying';
    const avgPoids = course.participants.reduce((s, x) => s + x.poids, 0) / course.nbP;

    const rc = lk.ch.map[p.ch] || matchInit(lk.ch.map, p.ch);
    const rj = matchInit(lk.j.map, p.j);
    const re = matchInit(lk.e.map, p.e);
    const rel = matchInit(lk.el.map, p.el);
    const rpr = matchInit(lk.pr.map, p.pr);
    const rco = matchInit(lk.co.map, p.j);
    const rc25 = lk.ch25.map[p.ch];
    const rj25 = matchInit(lk.j25.map, p.j);
    const re25 = matchInit(lk.e25.map, p.e);

    const dsc = distCh[p.ch]; const dsj = distJ[p.j];
    const fc = formeCh[p.ch]; const fj = formeJ[p.j];
    const combo = combos[p.j + '|||' + p.e];
    const sf = stableF[p.e]; const ic = intervalle[p.ch];

    return {
      // 1. Cote marché
      F01_cote: p.cote > 1 ? 1 / p.cote * 100 : 10,
      // 2-4. Stats individuelles PMU
      F02_indivTauxV: p.nbC >= 2 ? p.nbV / p.nbC * 100 : 8,
      F03_indivTauxP: p.nbC >= 2 ? p.nbPl / p.nbC * 100 : 30,
      F04_indivGainPC: p.nbC >= 2 ? Math.min(100, p.gains / p.nbC / 50000) : 50,
      // 5. Expérience
      F05_experience: Math.min(100, p.nbC * 2),
      // 6-7. Poids et corde
      F06_poids: avgPoids > 0 && p.poids > 0 ? 50 - (p.poids - avgPoids) * 3 : 50,
      F07_corde: p.corde > 0 ? 50 + (50 - (p.corde - 1) * 8) * ({ sprint: 0.5, mile: 0.3, intermediaire: 0.15, staying: 0.05 }[db] || 0.2) : 50,
      // 8. Valeur France Galop
      F08_valeur: p.valeur > 0 ? p.valeur : 50,
      // 9-14. Rangs 2026
      F09_rangCheval: rc ? pct(parseInt(rc.Rang), lk.ch.total) : 50,
      F10_rangJockey: rj ? pct(parseInt(rj.Rang), lk.j.total) : 50,
      F11_rangEntraineur: re ? pct(parseInt(re.Rang), lk.e.total) : 50,
      F12_rangEleveur: rel ? pct(parseInt(rel.Rang), lk.el.total) : 50,
      F13_rangProprio: rpr ? pct(parseInt(rpr.Rang), lk.pr.total) : 50,
      F14_cravacheOr: rco ? pct(parseInt(rco.Rang), lk.co.total) : 0,
      // 15-17. Gains/taux classement
      F15_gainMoyenCheval: rc ? Math.min(100, parseFloat(rc.GainMoyen || 0) / 500) : 50,
      F16_tauxVCheval: rc ? parseFloat(rc.TauxVictoire || 0) : 8,
      F17_tauxPCheval: rc ? parseFloat(rc.TauxPlace || 0) : 30,
      F18_gainMoyenJockey: rj ? Math.min(100, parseFloat(rj.GainMoyen || 0) / 100) : 50,
      // 19-21. Rangs 2025
      F19_rangCheval25: rc25 ? pct(parseInt(rc25.Rang), lk.ch25.total) : 50,
      F20_rangJockey25: rj25 ? pct(parseInt(rj25.Rang), lk.j25.total) : 50,
      F21_rangEntraineur25: re25 ? pct(parseInt(re25.Rang), lk.e25.total) : 50,
      // 22-23. Forme
      F22_formeCheval: fc ? fc.formeScore : 50,
      F23_formeJockey: fj ? fj.formeScore : 50,
      // 24-25. Distance
      F24_distCheval: (dsc && dsc[db] && dsc[db].courses >= 2 && dsc.global) ? dsc[db].tauxVictoire : 8,
      F25_distJockey: (dsj && dsj[db] && dsj[db].courses >= 2 && dsj.global) ? dsj[db].tauxVictoire : 8,
      // 26. Combo
      F26_combo: combo && combo.courses >= 3 ? combo.tauxVictoire : 10,
      // 27. Stable form
      F27_stable: sf ? sf.formeStable : 50,
      // 28. Intervalle
      F28_intervalle: ic ? (ic.joursDepuis <= 7 ? 30 : ic.joursDepuis <= 25 ? 70 : ic.joursDepuis <= 45 ? 55 : 25) : 50,
    };
  }

  function evalConfig(coursesSet, weights, temp = 12) {
    let top1 = 0, top2 = 0, top3 = 0, total = 0, favT1 = 0, favT2 = 0;

    for (const c of coursesSet) {
      total++;
      const scored = c.participants.map(p => {
        const f = buildFeatures(p, c);
        let score = 0;
        for (const [k, w] of Object.entries(weights)) {
          if (f[k] !== undefined) score += f[k] * w;
        }
        return { ...p, score };
      });
      scored.sort((a, b) => b.score - a.score);

      if (scored[0]?.pos === 1) top1++;
      if (scored.slice(0, 2).some(p => p.pos === 1)) top2++;
      if (scored.slice(0, 3).some(p => p.pos === 1)) top3++;

      const byOdds = [...c.participants.filter(p => p.cote > 1)].sort((a, b) => a.cote - b.cote);
      if (byOdds[0]?.pos === 1) favT1++;
      if (byOdds.slice(0, 2).some(p => p.pos === 1)) favT2++;
    }

    return {
      total,
      top1: +(top1 / total * 100).toFixed(1),
      top2: +(top2 / total * 100).toFixed(1),
      top3: +(top3 / total * 100).toFixed(1),
      favT1: +(favT1 / total * 100).toFixed(1),
      favT2: +(favT2 / total * 100).toFixed(1),
    };
  }

  // GÉNÉRER TOUTES LES CONFIGS
  const allFeatures = Object.keys(buildFeatures(courses[0].participants[0], courses[0]));
  console.log('Features: ' + allFeatures.length + '\n');

  const configs = [];

  // A. Chaque feature seule
  for (const f of allFeatures) {
    configs.push({ name: f, weights: { [f]: 1 } });
  }

  // B. Cote + chaque feature (3 poids différents)
  for (const f of allFeatures) {
    if (f === 'F01_cote') continue;
    for (const w of [0.1, 0.3, 0.5, 1.0]) {
      configs.push({ name: 'COTE+' + f.slice(4) + '_' + w, weights: { F01_cote: 1, [f]: w } });
    }
  }

  // C. Meilleures combos sans cote (paires)
  const topF = ['F02_indivTauxV', 'F04_indivGainPC', 'F08_valeur', 'F09_rangCheval', 'F10_rangJockey', 'F15_gainMoyenCheval', 'F16_tauxVCheval', 'F22_formeCheval', 'F23_formeJockey'];
  for (let i = 0; i < topF.length; i++) {
    for (let j = i + 1; j < topF.length; j++) {
      configs.push({ name: topF[i].slice(4) + '+' + topF[j].slice(4), weights: { [topF[i]]: 1, [topF[j]]: 0.5 } });
      configs.push({ name: topF[j].slice(4) + '+' + topF[i].slice(4), weights: { [topF[j]]: 1, [topF[i]]: 0.5 } });
    }
  }

  // D. Triples
  for (let i = 0; i < topF.length; i++) {
    for (let j = i + 1; j < topF.length; j++) {
      for (let k = j + 1; k < topF.length; k++) {
        configs.push({ name: topF[i].slice(4, 10) + '+' + topF[j].slice(4, 10) + '+' + topF[k].slice(4, 10), weights: { [topF[i]]: 1, [topF[j]]: 0.5, [topF[k]]: 0.3 } });
      }
    }
  }

  // E. Cote + meilleures triples
  for (let i = 0; i < topF.length; i++) {
    for (let j = i + 1; j < topF.length; j++) {
      configs.push({ name: 'C+' + topF[i].slice(4, 10) + '+' + topF[j].slice(4, 10), weights: { F01_cote: 1, [topF[i]]: 0.3, [topF[j]]: 0.3 } });
    }
  }

  console.log(configs.length + ' configurations à tester\n');

  // Évaluer sur VALIDATION
  const results = [];
  for (const cfg of configs) {
    const r = evalConfig(valCourses, cfg.weights);
    results.push({ ...cfg, ...r });
  }

  // Trier par top1 puis top2
  results.sort((a, b) => b.top1 - a.top1 || b.top2 - a.top2);

  // Afficher le top 20
  console.log('=== TOP 20 (validation) ===');
  console.log('Config'.padEnd(40) + 'Top1   Top2   Top3   |FavT1  FavT2  Bat?');
  console.log('-'.repeat(90));
  results.slice(0, 20).forEach(r => {
    const bat = r.top1 > r.favT1 ? '✅' : (r.top1 === r.favT1 ? '=' : '');
    console.log(r.name.padEnd(40) + String(r.top1).padEnd(7) + String(r.top2).padEnd(7) + String(r.top3).padEnd(7) + '|' + String(r.favT1).padEnd(7) + String(r.favT2).padEnd(7) + bat);
  });

  // Configs qui battent le favori
  const beat1 = results.filter(r => r.top1 > r.favT1);
  const beat2 = results.filter(r => r.top2 > r.favT2);

  console.log('\n=== BATTENT LE FAVORI EN TOP1: ' + beat1.length + '/' + results.length + ' ===');
  beat1.slice(0, 10).forEach(r => console.log('  ' + r.name + ': ' + r.top1 + '% vs ' + r.favT1 + '%'));

  console.log('\n=== BATTENT LE FAVORI EN TOP2: ' + beat2.length + '/' + results.length + ' ===');
  beat2.slice(0, 10).forEach(r => console.log('  ' + r.name + ': ' + r.top2 + '% vs ' + r.favT2 + '%'));

  // TEST FINAL
  const best = beat1.length ? beat1[0] : results[0];
  console.log('\n=== TEST FINAL (données test) ===');
  const tr = evalConfig(testCourses, best.weights);
  console.log('Config: ' + best.name);
  console.log('Top1: ' + tr.top1 + '% vs Favori ' + tr.favT1 + '% ' + (tr.top1 > tr.favT1 ? '✅' : '❌'));
  console.log('Top2: ' + tr.top2 + '% vs Favori ' + tr.favT2 + '% ' + (tr.top2 > tr.favT2 ? '✅' : '❌'));
  console.log('Top3: ' + tr.top3 + '%');

  await fs.writeFile('data/backtest/ultimate_v2_report.json', JSON.stringify({
    date: new Date().toISOString(), configs: configs.length,
    top20: results.slice(0, 20).map(r => ({ name: r.name, top1: r.top1, top2: r.top2, favT1: r.favT1, weights: r.weights })),
    beatFav1: beat1.length, beatFav2: beat2.length,
    test: { config: best.name, ...tr, weights: best.weights }
  }, null, 2));
  console.log('\n✅ data/backtest/ultimate_v2_report.json');
}

main().catch(err => { console.error(err); process.exit(1); });
