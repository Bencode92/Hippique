// grid-search-final.js
// Grid search STRICT : 2025 figé → prédit 2026
// Protocole anti p-hacking : val (jan-fév) + holdout (mars) UNE SEULE FOIS
const fs = require('fs').promises;

function bayesRate(w, n, mu = 0.084, alpha = 10) { return (w + alpha * mu) / (n + alpha); }
function pct(r, t) { return r ? 100 * (1 - (r - 1) / Math.max(t, 1)) : null; }

async function loadLk(file, key) {
  try {
    const d = JSON.parse(await fs.readFile('data/' + file, 'utf8'));
    const m = {};
    (d.resultats || []).forEach(i => { const k = (i[key] || '').toUpperCase().trim(); if (k) m[k] = i; });
    return { map: m, total: d.resultats.length };
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

async function main() {
  console.log('=== GRID SEARCH FINAL — Protocole strict OpenAI ===\n');

  // 1. Charger classements 2025
  const lk = {
    ch: await loadLk('chevaux_2025_ponderated_latest.json', 'Nom'),
    j: await loadLk('jockeys_2025_ponderated_latest.json', 'NomPostal'),
    e: await loadLk('entraineurs_2025_ponderated_latest.json', 'NomPostal'),
    el: await loadLk('eleveurs_2025_ponderated_latest.json', 'NomPostal'),
    pr: await loadLk('proprietaires_2025_ponderated_latest.json', 'NomPostal'),
    co: await loadLk('cravache_or_2025_ponderated_latest.json', 'NomPostal'),
  };
  console.log('2025: ' + lk.ch.total + ' ch, ' + lk.j.total + ' j, ' + lk.e.total + ' e, ' + lk.co.total + ' co\n');

  // Stats dérivées 2025
  const loadJ = async f => { try { return JSON.parse(await fs.readFile('data/' + f, 'utf8')).resultats || {}; } catch (e) { return {}; } };
  const distCh = await loadJ('chevaux_distance_stats.json');
  const distJ = await loadJ('jockeys_distance_stats.json');
  const combos = await loadJ('combo_jockey_entraineur.json');

  // 2. Charger courses 2026
  const files = (await fs.readdir('data/courses')).filter(f => f.startsWith('2026-') && f.endsWith('.json')).sort();
  const allCourses = [];
  for (const file of files) {
    const dm = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;
    try {
      const data = JSON.parse(await fs.readFile('data/courses/' + file, 'utf8'));
      for (const c of (data.courses || [])) {
        if (!c.arrivee_definitive) continue;
        const parts = c.participants || [];
        if (parts.length < 4 || !parts[0].arrivee) continue;
        allCourses.push({
          date: dm[1], nbP: parts.length, type: c.type,
          dist: parseInt(String(c.distance || '').replace(/[^0-9]/g, '')) || 0,
          hasCotes: parts.some(p => p.cote > 1),
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

  // Split : val (jan-fév) / holdout (mars+)
  const valCourses = allCourses.filter(c => c.date >= '2026-01-01' && c.date < '2026-03-01');
  const holdoutCourses = allCourses.filter(c => c.date >= '2026-03-01');
  const janCourses = allCourses.filter(c => c.date >= '2026-01-01' && c.date < '2026-02-01');
  const fevCourses = allCourses.filter(c => c.date >= '2026-02-01' && c.date < '2026-03-01');

  console.log('Val jan-fév: ' + valCourses.length + ' (jan:' + janCourses.length + ' fév:' + fevCourses.length + ')');
  console.log('Holdout mars+: ' + holdoutCourses.length + '\n');

  // 3. Features
  function getActorScore(item, total, variant) {
    if (!item) return 50; // médiane pour non-trouvé
    const rang = parseInt(item.Rang) || total;
    const tv = parseFloat(item.TauxVictoire || 0);
    const tp = parseFloat(item.TauxPlace || 0);
    const gm = Math.min(100, parseFloat(item.GainMoyen || 0) / 500);

    if (variant === 'V1') return pct(rang, total);
    if (variant === 'V2') return bayesRate(parseFloat(item.NbVictoires || item.Victoires || 0), parseFloat(item.NbCourses || item.Partants || 0), 0.084, 10) * 50 + gm * 50;
    if (variant === 'V3') return tv * 0.4 + tp * 0.15 + gm * 0.2 + pct(rang, total) * 0.25;
    return pct(rang, total);
  }

  function scoreParticipant(p, course, config) {
    const db = course.dist < 1400 ? 'sprint' : course.dist < 1900 ? 'mile' : course.dist < 2400 ? 'intermediaire' : 'staying';

    const rc = lk.ch.map[p.ch]; const rj = matchInit(lk.j.map, p.j);
    const re = matchInit(lk.e.map, p.e); const rel = matchInit(lk.el.map, p.el);
    const rpr = matchInit(lk.pr.map, p.pr); const rco = matchInit(lk.co.map, p.j);

    let score = 0;
    score += config.wCh * getActorScore(rc, lk.ch.total, config.variant);
    score += config.wJ * getActorScore(rj, lk.j.total, config.variant);
    score += config.wE * getActorScore(re, lk.e.total, config.variant);
    score += config.wEl * getActorScore(rel, lk.el.total, config.variant);
    score += config.wPr * getActorScore(rpr, lk.pr.total, config.variant);

    // Bonus cravache d'or
    if (config.cravache && rco) {
      score += Math.max(0, Math.min(15, (21 - parseInt(rco.Rang)) * 0.75));
    }

    // Distance fit
    if (config.distFit) {
      const dsc = distCh[p.ch];
      if (dsc && dsc[db] && dsc[db].courses >= 2 && dsc.global) {
        score += (dsc[db].tauxVictoire - dsc.global.tauxVictoire) * 0.3;
      }
      const dsj = distJ[p.j];
      if (dsj && dsj[db] && dsj[db].courses >= 2 && dsj.global) {
        score += (dsj[db].tauxVictoire - dsj.global.tauxVictoire) * 0.2;
      }
    }

    // Combo jockey × entraîneur
    if (config.combo) {
      const co = combos[p.j + '|||' + p.e];
      if (co && co.courses >= 3) {
        score += bayesRate(co.victoires, co.courses, 0.084, 20) * 30;
      }
    }

    return score;
  }

  function evalConfig(coursesSet, config) {
    let t1 = 0, t2 = 0, t3 = 0, f1 = 0, f2 = 0, total = 0, ll = 0;

    for (const c of coursesSet) {
      total++;
      const scored = c.participants.map(p => ({ ...p, s: scoreParticipant(p, c, config) }));
      scored.sort((a, b) => b.s - a.s);

      if (scored[0]?.pos === 1) t1++;
      if (scored.slice(0, 2).some(p => p.pos === 1)) t2++;
      if (scored.slice(0, 3).some(p => p.pos === 1)) t3++;

      // Softmax log-loss
      const maxS = Math.max(...scored.map(s => s.s));
      const exps = scored.map(s => Math.exp((s.s - maxS) / config.temp));
      const sumE = exps.reduce((a, b) => a + b, 0);
      const winner = scored.findIndex(s => s.pos === 1);
      if (winner >= 0) ll += -Math.log(Math.max(exps[winner] / sumE, 1e-6));

      // Favori marché
      if (c.hasCotes) {
        const byCote = [...c.participants.filter(p => p.cote > 1)].sort((a, b) => a.cote - b.cote);
        if (byCote[0]?.pos === 1) f1++;
        if (byCote.slice(0, 2).some(p => p.pos === 1)) f2++;
      }
    }

    return {
      total, t1: +(t1 / total * 100).toFixed(1), t2: +(t2 / total * 100).toFixed(1),
      t3: +(t3 / total * 100).toFixed(1), ll: +(ll / total).toFixed(3),
      f1: +(f1 / total * 100).toFixed(1), f2: +(f2 / total * 100).toFixed(1)
    };
  }

  // 4. Générer la grille
  const configs = [];
  const wChVals = [0.35, 0.45, 0.55, 0.65];
  const wJVals = [0.10, 0.15, 0.25, 0.35];
  const wEVals = [0.00, 0.05, 0.15];
  const wElVals = [0.00, 0.05];
  const wPrVals = [0.00, 0.05];
  const variants = ['V1', 'V2', 'V3'];
  const temps = [8, 12, 20];

  for (const wCh of wChVals) {
    for (const wJ of wJVals) {
      for (const wE of wEVals) {
        for (const wEl of wElVals) {
          for (const wPr of wPrVals) {
            const sum = wCh + wJ + wE + wEl + wPr;
            if (Math.abs(sum - 1.0) > 0.05) continue;

            for (const variant of variants) {
              for (const temp of temps) {
                for (const cravache of [false, true]) {
                  for (const distFit of [false, true]) {
                    for (const combo of [false, true]) {
                      const name = `Ch${wCh}_J${wJ}_E${wE}_${variant}_t${temp}${cravache ? '_CO' : ''}${distFit ? '_DF' : ''}${combo ? '_CB' : ''}`;
                      configs.push({ name, wCh, wJ, wE, wEl, wPr, variant, temp, cravache, distFit, combo });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(configs.length + ' configurations à tester\n');

  // 5. Évaluer sur VALIDATION (jan-fév)
  const results = [];
  let count = 0;
  for (const cfg of configs) {
    const r = evalConfig(valCourses, cfg);
    results.push({ ...cfg, ...r });
    count++;
    if (count % 500 === 0) process.stdout.write(count + '/' + configs.length + '... ');
  }
  console.log('\n');

  // 6. Trier par log-loss (meilleur = plus bas)
  results.sort((a, b) => a.ll - b.ll);

  // Top 10 par log-loss
  console.log('=== TOP 10 PAR LOG-LOSS (validation jan-fév) ===');
  console.log('Config'.padEnd(50) + 'Top1   Top2   LL     |FavT1  FavT2');
  console.log('-'.repeat(90));
  results.slice(0, 10).forEach(r => {
    const bat = r.t1 > r.f1 ? '✅' : '';
    console.log(r.name.padEnd(50) + String(r.t1).padEnd(7) + String(r.t2).padEnd(7) + String(r.ll).padEnd(7) + '|' + String(r.f1).padEnd(7) + String(r.f2).padEnd(7) + bat);
  });

  // Top 10 par top1
  results.sort((a, b) => b.t1 - a.t1 || a.ll - b.ll);
  console.log('\n=== TOP 10 PAR TOP1 ===');
  console.log('Config'.padEnd(50) + 'Top1   Top2   LL     |FavT1  FavT2');
  console.log('-'.repeat(90));
  results.slice(0, 10).forEach(r => {
    const bat = r.t1 > r.f1 ? '✅' : '';
    console.log(r.name.padEnd(50) + String(r.t1).padEnd(7) + String(r.t2).padEnd(7) + String(r.ll).padEnd(7) + '|' + String(r.f1).padEnd(7) + String(r.f2).padEnd(7) + bat);
  });

  // 7. Stabilité : top configs doivent marcher sur jan ET fév
  console.log('\n=== STABILITÉ MENSUELLE (top 5 par top1) ===');
  const top5 = results.slice(0, 5);
  for (const cfg of top5) {
    const rJan = evalConfig(janCourses, cfg);
    const rFev = evalConfig(fevCourses, cfg);
    console.log(cfg.name.slice(0, 40).padEnd(42) + 'Jan:' + rJan.t1 + '% Fév:' + rFev.t1 + '% Écart:' + Math.abs(rJan.t1 - rFev.t1).toFixed(1));
  }

  // 8. HOLDOUT FINAL — UNE SEULE MESURE
  console.log('\n' + '═'.repeat(70));
  console.log('HOLDOUT FINAL — MARS 2026+ (données jamais vues)');
  console.log('═'.repeat(70));

  // Prendre les 3 meilleurs (par top1 + LL)
  results.sort((a, b) => (b.t1 * 2 - b.ll * 10) - (a.t1 * 2 - a.ll * 10));
  const finalistes = results.slice(0, 3);

  for (const cfg of finalistes) {
    const h = evalConfig(holdoutCourses, cfg);
    console.log('\n' + cfg.name);
    console.log('  Top1: ' + h.t1 + '% | Top2: ' + h.t2 + '% | Top3: ' + h.t3 + '% | LL: ' + h.ll);
    console.log('  Favori: ' + h.f1 + '% top1 | ' + h.f2 + '% top2');
    console.log('  ' + (h.t1 > h.f1 ? '✅ BAT LE FAVORI de +' + (h.t1 - h.f1).toFixed(1) + ' pts' : '❌ Favori gagne de ' + (h.f1 - h.t1).toFixed(1) + ' pts'));
  }

  // Baseline
  const hBase = evalConfig(holdoutCourses, { ...finalistes[0] });
  const avgN = holdoutCourses.reduce((s, c) => s + c.nbP, 0) / holdoutCourses.length;
  console.log('\nBaseline random: ' + (100 / avgN).toFixed(1) + '% (' + avgN.toFixed(0) + ' partants moy)');

  // Sauvegarder
  const report = {
    date: new Date().toISOString(),
    protocole: 'grid_search_2025_to_2026_strict',
    configs_tested: configs.length,
    validation: { courses: valCourses.length, jan: janCourses.length, fev: fevCourses.length },
    holdout: { courses: holdoutCourses.length },
    top10_by_top1: results.slice(0, 10).map(r => ({ name: r.name, t1: r.t1, t2: r.t2, ll: r.ll, f1: r.f1 })),
    finalistes: finalistes.map(f => {
      const h = evalConfig(holdoutCourses, f);
      return { config: f.name, val: { t1: f.t1, ll: f.ll }, holdout: { t1: h.t1, t2: h.t2, ll: h.ll, f1: h.f1, f2: h.f2 }, weights: { wCh: f.wCh, wJ: f.wJ, wE: f.wE, variant: f.variant, temp: f.temp, cravache: f.cravache, distFit: f.distFit, combo: f.combo } };
    }),
    baseline: { random: +(100 / avgN).toFixed(1) }
  };

  await fs.writeFile('data/backtest/grid_search_final.json', JSON.stringify(report, null, 2));
  console.log('\n✅ data/backtest/grid_search_final.json');
}

main().catch(err => { console.error(err); process.exit(1); });
