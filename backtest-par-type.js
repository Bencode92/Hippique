// backtest-par-type.js
// Grid search PAR TYPE DE COURSE — walk-forward strict
// Val (jan-fév) → Holdout (mars+), split par distance + peloton
const fs = require('fs').promises;

function loadLk(file, key) {
  try { const d = JSON.parse(require('fs').readFileSync('data/' + file)); const m = {}; (d.resultats || []).forEach(i => { const k = (i[key] || '').toUpperCase().trim(); if (k) m[k] = i; }); return { map: m, total: d.resultats.length }; } catch (e) { return { map: {}, total: 1 }; }
}
function matchInit(map, nom) { if (!nom || nom.length < 3) return null; const n = nom.toUpperCase().trim(); if (map[n]) return map[n]; const cl = n.replace(/^MME\s+|^MLLE\s+/i, ''); const m = cl.match(/^([A-Z]{1,3})\.?\s*(.+?)(?:\s*\(.*\))?$/); if (!m) return null; const init = m[1].charAt(0); let fam = m[2].trim().replace(/\s*\([A-Z]\)\s*$/, '').trim(); if (fam.length < 3) return null; for (const [k, v] of Object.entries(map)) { if ((k.endsWith(fam) || k.includes(' ' + fam)) && k.replace(fam, '').replace(/^MME\s+/i, '').trim().charAt(0) === init) return v; } return null; }
function pct(r, t) { return r ? 100 * (1 - (r - 1) / Math.max(t, 1)) : 50; }

async function main() {
  const ch25 = loadLk('chevaux_2025_ponderated_latest.json', 'Nom');
  const j25 = loadLk('jockeys_2025_ponderated_latest.json', 'NomPostal');
  const co25 = loadLk('cravache_or_2025_ponderated_latest.json', 'NomPostal');
  const distJ = JSON.parse(require('fs').readFileSync('data/jockeys_distance_stats.json')).resultats || {};
  const combos = JSON.parse(require('fs').readFileSync('data/combo_jockey_entraineur.json')).resultats || {};

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
          fieldSize: parts.length < 9 ? 'small' : parts.length < 14 ? 'medium' : 'large',
          hasCotes: parts.some(p => p.cote > 1),
          participants: parts.map(p => ({
            pos: p.arrivee, cote: p.cote || 0,
            ch: (p.cheval || '').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase(),
            j: (p.jockey || '').toUpperCase().trim(),
            e: (p.entraineur || p['entraîneur'] || '').toUpperCase().trim(),
            valeur: parseFloat(p.valeur) || 0,
            nbC: parseInt(p.nb_courses) || 0, nbV: parseInt(p.nb_victoires) || 0,
          }))
        });
      }
    } catch (e) { }
  }

  // Split
  const valC = courses.filter(c => c.date >= '2026-01-01' && c.date < '2026-03-01');
  const holdC = courses.filter(c => c.date >= '2026-03-01');

  console.log('=== BACKTEST PAR TYPE — Val jan-fév (' + valC.length + ') → Holdout mars+ (' + holdC.length + ') ===\n');

  // Features (classements 2025 = zero leakage)
  const feats = {
    valeur: { fn: (p, c) => p.valeur > 0 ? p.valeur : 50, w: 0.5 },
    ch25tV: { fn: (p, c) => { const r = ch25.map[p.ch]; return r ? parseFloat(r.TauxVictoire || 0) : 8; }, w: 1.0 },
    ch25rg: { fn: (p, c) => { const r = ch25.map[p.ch]; return r ? pct(parseInt(r.Rang), ch25.total) : 50; }, w: 0.3 },
    cote: { fn: (p, c) => p.cote > 1 ? (1 / p.cote) * 100 : 50, w: 0.3 },
    j25rg: { fn: (p, c) => { const r = matchInit(j25.map, p.j); return r ? pct(parseInt(r.Rang), j25.total) : 50; }, w: 0.3 },
    j25tV: { fn: (p, c) => { const r = matchInit(j25.map, p.j); return r ? parseFloat(r.TauxVictoire || 0) : 8; }, w: 0.5 },
    combo: { fn: (p, c) => { const co = combos[p.j + '|||' + p.e]; return (co && co.courses >= 3) ? co.tauxVictoire : 10; }, w: 0.3 },
  };

  // Toutes les combos de features
  const fNames = Object.keys(feats);
  const cfgs = [];
  // Singles
  for (const f of fNames) cfgs.push([f]);
  // Paires
  for (let i = 0; i < fNames.length; i++) for (let j = i + 1; j < fNames.length; j++) cfgs.push([fNames[i], fNames[j]]);
  // Triples
  for (let i = 0; i < fNames.length; i++) for (let j = i + 1; j < fNames.length; j++) for (let k = j + 1; k < fNames.length; k++) cfgs.push([fNames[i], fNames[j], fNames[k]]);
  // Quadruples
  for (let i = 0; i < fNames.length; i++) for (let j = i + 1; j < fNames.length; j++) for (let k = j + 1; k < fNames.length; k++) for (let l = k + 1; l < fNames.length; l++) cfgs.push([fNames[i], fNames[j], fNames[k], fNames[l]]);

  function ev(sub, cfg) {
    let t1 = 0, t2 = 0, f1 = 0, f2 = 0, n = 0;
    for (const c of sub) {
      n++;
      const sc = c.participants.map(p => { let s = 0; cfg.forEach(f => s += feats[f].fn(p, c) * feats[f].w); return { ...p, s }; });
      sc.sort((a, b) => b.s - a.s);
      if (sc[0]?.pos === 1) t1++;
      if (sc.slice(0, 2).some(p => p.pos === 1)) t2++;
      if (c.hasCotes) { const bc = [...c.participants.filter(p => p.cote > 1)].sort((a, b) => a.cote - b.cote); if (bc[0]?.pos === 1) f1++; if (bc.slice(0, 2).some(p => p.pos === 1)) f2++; }
    }
    return { t1: +(t1 / n * 100).toFixed(1), t2: +(t2 / n * 100).toFixed(1), f1: +(f1 / n * 100).toFixed(1), f2: +(f2 / n * 100).toFixed(1), n };
  }

  // Segments
  const segments = [
    { name: 'SPRINT (<1400m)', filter: c => c.db === 'sprint' },
    { name: 'MILE (1400-1900m)', filter: c => c.db === 'mile' },
    { name: 'MIDDLE (1900-2400m)', filter: c => c.db === 'middle' },
    { name: 'STAYING (2400m+)', filter: c => c.db === 'staying' },
    { name: 'PETIT CHAMP (<9)', filter: c => c.fieldSize === 'small' },
    { name: 'MOYEN CHAMP (9-14)', filter: c => c.fieldSize === 'medium' },
    { name: 'GRAND CHAMP (14+)', filter: c => c.fieldSize === 'large' },
  ];

  const finalReport = {};

  for (const seg of segments) {
    const valSub = valC.filter(seg.filter);
    const holdSub = holdC.filter(seg.filter);
    if (valSub.length < 10 || holdSub.length < 10) continue;

    // Évaluer toutes les configs sur VALIDATION
    const valResults = cfgs.map(cfg => {
      const r = ev(valSub, cfg);
      return { cfg: cfg.join('+'), features: cfg, ...r };
    });
    valResults.sort((a, b) => b.t1 - a.t1 || b.t2 - a.t2);

    // Top 3 sur validation → tester sur HOLDOUT
    const top3 = valResults.slice(0, 3);
    const holdResults = top3.map(vr => {
      const hr = ev(holdSub, vr.features);
      return { ...vr, hold_t1: hr.t1, hold_t2: hr.t2, hold_f1: hr.f1, hold_f2: hr.f2, hold_n: hr.n };
    });

    finalReport[seg.name] = holdResults;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(seg.name);
    console.log('Val: ' + valSub.length + 'c | Holdout: ' + holdSub.length + 'c');
    console.log('');
    console.log('Config'.padEnd(30) + '│ VAL t1   VAL t2  │ HOLD t1  HOLD t2  FavH t1  Bat?');
    console.log('─'.repeat(85));

    for (const r of holdResults) {
      const bat = r.hold_t1 > r.hold_f1 ? '✅' : '❌';
      console.log(
        r.cfg.padEnd(30) + '│ ' +
        String(r.t1 + '%').padEnd(9) + String(r.t2 + '%').padEnd(8) + '│ ' +
        String(r.hold_t1 + '%').padEnd(9) + String(r.hold_t2 + '%').padEnd(9) +
        String(r.hold_f1 + '%').padEnd(9) + bat
      );
    }
    console.log('');
  }

  // Sauvegarder
  await fs.writeFile('data/backtest/par_type_report.json', JSON.stringify({ date: new Date().toISOString(), val: valC.length, holdout: holdC.length, segments: finalReport }, null, 2));
  console.log('✅ data/backtest/par_type_report.json');
}

main().catch(err => { console.error(err); process.exit(1); });
