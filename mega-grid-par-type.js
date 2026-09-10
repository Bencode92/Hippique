// mega-grid-par-type.js
// Grid search EXHAUSTIF par type de course
// 24 critères × pondérations × 7 segments
// Val jan-fév → Holdout mars+
const fs = require('fs').promises;
const fss = require('fs');

function loadLk(file, key) { try { const d = JSON.parse(fss.readFileSync('data/' + file)); const m = {}; (d.resultats || []).forEach(i => { const k = (i[key] || '').toUpperCase().trim(); if (k) m[k] = i; }); return { map: m, total: d.resultats.length }; } catch (e) { return { map: {}, total: 1 }; } }
function matchInit(map, nom) { if (!nom || nom.length < 3) return null; const n = nom.toUpperCase().trim(); if (map[n]) return map[n]; const cl = n.replace(/^MME\s+|^MLLE\s+/i, ''); const m = cl.match(/^([A-Z]{1,3})\.?\s*(.+?)(?:\s*\(.*\))?$/); if (!m) return null; const init = m[1].charAt(0); let fam = m[2].trim().replace(/\s*\([A-Z]\)\s*$/, '').trim(); if (fam.length < 3) return null; for (const [k, v] of Object.entries(map)) { if ((k.endsWith(fam) || k.includes(' ' + fam)) && k.replace(fam, '').replace(/^MME\s+/i, '').trim().charAt(0) === init) return v; } return null; }
function pct(r, t) { return r ? 100 * (1 - (r - 1) / Math.max(t, 1)) : 50; }
function bayesRate(w, n, mu = 0.084, alpha = 10) { return (w + alpha * mu) / (n + alpha); }

async function main() {
  console.log('=== MÉGA GRID SEARCH PAR TYPE DE COURSE ===\n');

  // Charger toutes les données
  const ch25 = loadLk('chevaux_2025_ponderated_latest.json', 'Nom');
  const j25 = loadLk('jockeys_2025_ponderated_latest.json', 'NomPostal');
  const e25 = loadLk('entraineurs_2025_ponderated_latest.json', 'NomPostal');
  const el25 = loadLk('eleveurs_2025_ponderated_latest.json', 'NomPostal');
  const pr25 = loadLk('proprietaires_2025_ponderated_latest.json', 'NomPostal');
  const co25 = loadLk('cravache_or_2025_ponderated_latest.json', 'NomPostal');
  const distJ = JSON.parse(fss.readFileSync('data/jockeys_distance_stats.json')).resultats || {};
  const distCh = JSON.parse(fss.readFileSync('data/chevaux_distance_stats.json')).resultats || {};
  const combos = JSON.parse(fss.readFileSync('data/combo_jockey_entraineur.json')).resultats || {};
  const stableF = JSON.parse(fss.readFileSync('data/stable_form.json')).resultats || {};
  const intervalle = JSON.parse(fss.readFileSync('data/intervalle_courses.json')).resultats || {};
  const formeCh = JSON.parse(fss.readFileSync('data/chevaux_forme_recente.json')).resultats || {};
  const formeJ = JSON.parse(fss.readFileSync('data/jockeys_forme_recente.json')).resultats || {};

  // Charger courses
  const files = (await fs.readdir('data/courses')).filter(f => f.startsWith('2026-') && f.endsWith('.json')).sort();
  const courses = [];
  for (const file of files) {
    const dm = file.match(/^(\d{4}-\d{2}-\d{2})/); if (!dm) continue;
    try {
      const data = JSON.parse(await fs.readFile('data/courses/' + file, 'utf8'));
      for (const c of (data.courses || [])) {
        if (!c.arrivee_definitive) continue;
        const parts = c.participants || [];
        if (parts.length < 4 || !parts[0].arrivee) continue;
        const dist = parseInt(String(c.distance || '').replace(/[^0-9]/g, '')) || 0;
        courses.push({
          date: dm[1], nbP: parts.length, type: c.type, dist,
          db: dist < 1400 ? 'sprint' : dist < 1900 ? 'mile' : dist < 2400 ? 'middle' : 'staying',
          fs: parts.length < 9 ? 'small' : parts.length < 14 ? 'medium' : 'large',
          hasCotes: parts.some(p => p.cote > 1),
          participants: parts.map(p => ({
            pos: p.arrivee, cote: p.cote || 0,
            ch: (p.cheval || '').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase(),
            j: (p.jockey || '').toUpperCase().trim(),
            e: (p.entraineur || p['entraîneur'] || '').toUpperCase().trim(),
            el: (p['éleveurs'] || '').toUpperCase().trim(),
            pr: (p['propriétaire'] || '').toUpperCase().trim(),
            valeur: parseFloat(p.valeur) || 0,
            poids: parseInt(String(p.poids || '').match(/(\d+)/)?.[1] || 0),
            corde: parseInt(String(p.corde || '').match(/(\d+)/)?.[1] || 0),
            nbC: parseInt(p.nb_courses) || 0, nbV: parseInt(p.nb_victoires) || 0,
            nbP: parseInt(p.nb_places) || 0, gains: parseInt(p.gains) || 0,
            musique: p.musique || '',
          }))
        });
      }
    } catch (e) { }
  }

  const valC = courses.filter(c => c.date >= '2026-01-01' && c.date < '2026-03-01');
  const holdC = courses.filter(c => c.date >= '2026-03-01');
  console.log('Val: ' + valC.length + ' | Holdout: ' + holdC.length + '\n');

  // 24 features avec calcul
  function computeFeatures(p, c) {
    const rc = ch25.map[p.ch]; const rj = matchInit(j25.map, p.j);
    const re = matchInit(e25.map, p.e); const rel = matchInit(el25.map, p.el);
    const rpr = matchInit(pr25.map, p.pr); const rco = matchInit(co25.map, p.j);
    const avgP = c.participants.reduce((s, x) => s + x.poids, 0) / c.nbP;

    // Musique
    let mus = 50;
    if (p.musique) {
      const pos = p.musique.replace(/\(\d+\)/g, '').match(/(\d+|[DRT])[a-z]/gi);
      if (pos && pos.length >= 2) {
        const l5 = pos.slice(0, 5).map(x => { const v = x.slice(0, -1); if ('DRT'.includes(v)) return 0; const n = parseInt(v); return n === 0 ? 12 : n; });
        let sc = 0, w = 0;
        l5.forEach((ps, i) => { const wt = (l5.length - i) / l5.length; const s = ps === 1 ? 100 : ps === 2 ? 80 : ps === 3 ? 65 : ps <= 5 ? 45 : ps <= 8 ? 25 : 10; sc += s * wt; w += wt; });
        mus = w > 0 ? sc / w : 50;
      }
    }

    const db = c.db;
    const dsj = distJ[p.j]; const dsc = distCh[p.ch];
    const co = combos[p.j + '|||' + p.e];
    const sf = stableF[p.e]; const ic = intervalle[p.ch];
    const fc = formeCh[p.ch]; const fj = formeJ[p.j];

    return {
      cote: p.cote > 1 ? (1 / p.cote) * 100 : 50,
      valeur: p.valeur > 0 ? p.valeur : 50,
      indivV: p.nbC >= 2 ? bayesRate(p.nbV, p.nbC) * 100 : 8.4,
      indivP: p.nbC >= 2 ? bayesRate(p.nbP, p.nbC, 0.3) * 100 : 30,
      gainPC: p.nbC >= 2 ? Math.min(100, p.gains / p.nbC / 50000) : 50,
      musique: mus,
      chRang: rc ? pct(parseInt(rc.Rang), ch25.total) : 50,
      chTauxV: rc ? parseFloat(rc.TauxVictoire || 0) : 8,
      chGain: rc ? Math.min(100, parseFloat(rc.GainMoyen || 0) / 500) : 50,
      jRang: rj ? pct(parseInt(rj.Rang), j25.total) : 50,
      jTauxV: rj ? parseFloat(rj.TauxVictoire || 0) : 8,
      jGainP: rj ? Math.min(100, parseFloat(rj['Gain/Part.'] || rj.GainMoyen || 0) / 100) : 50,
      eRang: re ? pct(parseInt(re.Rang), e25.total) : 50,
      eTauxV: re ? parseFloat(re.TauxVictoire || 0) : 8,
      cravRg: rco ? pct(parseInt(rco.Rang), co25.total) : 0,
      distJ: (dsj && dsj[db] && dsj[db].courses >= 5 && dsj.global) ? dsj[db].tauxVictoire : 8,
      distCh: (dsc && dsc[db] && dsc[db].courses >= 3 && dsc.global) ? dsc[db].tauxVictoire : 8,
      combo: (co && co.courses >= 3) ? co.tauxVictoire : 10,
      stable: sf ? sf.formeStable : 50,
      formeCh: fc ? fc.formeScore : 50,
      formeJ: fj ? fj.formeScore : 50,
      ecartP: avgP > 0 && p.poids > 0 ? 50 - (p.poids - avgP) * 3 : 50,
      corde: p.corde > 0 ? 50 + (50 - (p.corde - 1) * 8) * ({ sprint: 0.5, mile: 0.3, middle: 0.15, staying: 0.05 }[db] || 0.2) : 50,
      interv: ic ? (ic.joursDepuis <= 7 ? 30 : ic.joursDepuis <= 25 ? 70 : ic.joursDepuis <= 45 ? 55 : 25) : 50,
    };
  }

  // Groupes de features pour limiter les combinaisons
  const groups = {
    cheval: ['chTauxV', 'chRang', 'chGain'],
    jockey: ['jTauxV', 'jRang', 'jGainP'],
    cote: ['cote'],
    valeur: ['valeur'],
    indiv: ['indivV', 'indivP', 'gainPC'],
    musique: ['musique'],
    entraineur: ['eTauxV', 'eRang'],
    cravache: ['cravRg'],
    distance: ['distJ', 'distCh'],
    combo: ['combo'],
    forme: ['formeCh', 'formeJ'],
    stable: ['stable'],
    physique: ['ecartP', 'corde'],
    intervalle: ['interv'],
  };

  // Pour chaque groupe, on prend le meilleur critère
  // Puis on combine les groupes avec des poids
  const groupNames = Object.keys(groups);

  // Générer les configs : sélection de 2 à 5 groupes avec poids
  const weightOptions = [0.1, 0.3, 0.5, 1.0];
  const configs = [];

  // 1. Chaque critère seul
  for (const [gn, feats] of Object.entries(groups)) {
    for (const f of feats) {
      configs.push({ name: f, features: { [f]: 1 } });
    }
  }

  // 2. Paires de groupes (1 critère par groupe, 2 poids)
  const topGroups = ['cheval', 'jockey', 'cote', 'valeur', 'indiv', 'musique', 'cravache', 'distance', 'combo', 'forme'];
  const bestPerGroup = { cheval: 'chTauxV', jockey: 'jTauxV', cote: 'cote', valeur: 'valeur', indiv: 'indivV', musique: 'musique', entraineur: 'eTauxV', cravache: 'cravRg', distance: 'distJ', combo: 'combo', forme: 'formeCh', stable: 'stable', physique: 'ecartP', intervalle: 'interv' };

  for (let i = 0; i < topGroups.length; i++) {
    for (let j = i + 1; j < topGroups.length; j++) {
      for (const w1 of [0.3, 0.5, 1.0]) {
        for (const w2 of [0.3, 0.5, 1.0]) {
          configs.push({
            name: topGroups[i].slice(0, 4) + '_' + topGroups[j].slice(0, 4),
            features: { [bestPerGroup[topGroups[i]]]: w1, [bestPerGroup[topGroups[j]]]: w2 }
          });
        }
      }
    }
  }

  // 3. Triples
  for (let i = 0; i < topGroups.length; i++) {
    for (let j = i + 1; j < topGroups.length; j++) {
      for (let k = j + 1; k < topGroups.length; k++) {
        configs.push({
          name: topGroups[i].slice(0, 3) + '+' + topGroups[j].slice(0, 3) + '+' + topGroups[k].slice(0, 3),
          features: { [bestPerGroup[topGroups[i]]]: 1, [bestPerGroup[topGroups[j]]]: 0.5, [bestPerGroup[topGroups[k]]]: 0.3 }
        });
      }
    }
  }

  // 4. Quadruples (top 7 groupes seulement)
  const top7 = ['cheval', 'jockey', 'cote', 'valeur', 'indiv', 'distance', 'combo'];
  for (let i = 0; i < top7.length; i++) {
    for (let j = i + 1; j < top7.length; j++) {
      for (let k = j + 1; k < top7.length; k++) {
        for (let l = k + 1; l < top7.length; l++) {
          configs.push({
            name: top7[i].slice(0, 3) + '+' + top7[j].slice(0, 3) + '+' + top7[k].slice(0, 3) + '+' + top7[l].slice(0, 3),
            features: { [bestPerGroup[top7[i]]]: 1, [bestPerGroup[top7[j]]]: 0.5, [bestPerGroup[top7[k]]]: 0.3, [bestPerGroup[top7[l]]]: 0.2 }
          });
        }
      }
    }
  }

  console.log(configs.length + ' configs à tester par segment\n');

  function evalCfg(subset, cfg) {
    let t1 = 0, t2 = 0, t3 = 0, f1 = 0, f2 = 0, n = 0;
    for (const c of subset) {
      n++;
      const scored = c.participants.map(p => {
        const feat = computeFeatures(p, c);
        let s = 0;
        for (const [f, w] of Object.entries(cfg.features)) { s += (feat[f] || 50) * w; }
        return { ...p, s };
      });
      scored.sort((a, b) => b.s - a.s);
      if (scored[0]?.pos === 1) t1++;
      if (scored.slice(0, 2).some(p => p.pos === 1)) t2++;
      if (scored.slice(0, 3).some(p => p.pos === 1)) t3++;
      if (c.hasCotes) { const bc = [...c.participants.filter(p => p.cote > 1)].sort((a, b) => a.cote - b.cote); if (bc[0]?.pos === 1) f1++; if (bc.slice(0, 2).some(p => p.pos === 1)) f2++; }
    }
    return { t1: +(t1 / n * 100).toFixed(1), t2: +(t2 / n * 100).toFixed(1), t3: +(t3 / n * 100).toFixed(1), f1: +(f1 / n * 100).toFixed(1), f2: +(f2 / n * 100).toFixed(1), n };
  }

  // Segments
  const segments = [
    { name: 'SPRINT (<1400m)', filter: c => c.db === 'sprint' },
    { name: 'MILE (1400-1900m)', filter: c => c.db === 'mile' },
    { name: 'MIDDLE (1900-2400m)', filter: c => c.db === 'middle' },
    { name: 'STAYING (2400m+)', filter: c => c.db === 'staying' },
    { name: 'PETIT (<9 partants)', filter: c => c.fs === 'small' },
    { name: 'MOYEN (9-14)', filter: c => c.fs === 'medium' },
    { name: 'GRAND (14+)', filter: c => c.fs === 'large' },
  ];

  const report = {};

  for (const seg of segments) {
    const valSub = valC.filter(seg.filter);
    const holdSub = holdC.filter(seg.filter);
    if (valSub.length < 10 || holdSub.length < 10) { console.log(seg.name + ': pas assez de données\n'); continue; }

    process.stdout.write(seg.name + ' (' + valSub.length + '/' + holdSub.length + ')... ');

    // Évaluer sur validation
    const valRes = configs.map(cfg => ({ ...cfg, ...evalCfg(valSub, cfg) }));
    valRes.sort((a, b) => b.t1 - a.t1 || b.t2 - a.t2);

    // Top 5 → holdout
    const top5 = valRes.slice(0, 5);
    const holdRes = top5.map(vr => {
      const hr = evalCfg(holdSub, vr);
      return { name: vr.name, features: vr.features, val_t1: vr.t1, val_t2: vr.t2, val_f1: vr.f1, hold_t1: hr.t1, hold_t2: hr.t2, hold_t3: hr.t3, hold_f1: hr.f1, hold_f2: hr.f2, hold_n: hr.n };
    });

    report[seg.name] = holdRes;

    console.log('OK');
    console.log('━━━ ' + seg.name + ' ━━━');
    console.log('  ' + 'Config'.padEnd(30) + '│ VAL t1  │ HOLD t1  HOLD t2  FavH t1  Bat?');
    console.log('  ' + '─'.repeat(75));
    for (const r of holdRes) {
      const bat = r.hold_t1 > r.hold_f1 ? '✅ +' + (r.hold_t1 - r.hold_f1).toFixed(0) : '❌';
      console.log('  ' + r.name.padEnd(30) + '│ ' + String(r.val_t1 + '%').padEnd(8) + '│ ' + String(r.hold_t1 + '%').padEnd(9) + String(r.hold_t2 + '%').padEnd(9) + String(r.hold_f1 + '%').padEnd(9) + bat);
    }
    console.log('');
  }

  // Sauvegarder
  await fs.writeFile('data/backtest/mega_grid_par_type.json', JSON.stringify({
    date: new Date().toISOString(),
    configs_tested: configs.length,
    val_courses: valC.length,
    holdout_courses: holdC.length,
    segments: report
  }, null, 2));
  console.log('✅ data/backtest/mega_grid_par_type.json');
}

main().catch(err => { console.error(err); process.exit(1); });
