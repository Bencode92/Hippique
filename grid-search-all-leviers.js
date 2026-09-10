#!/usr/bin/env node
/**
 * GRID SEARCH ALL LEVIERS — Walk-forward honnête
 *
 * Teste TOUS les leviers disponibles (données participant + classements)
 * pour chaque catégorie de distance, en walk-forward 60/40.
 *
 * Phase 1 : Score chaque levier individuellement
 * Phase 2 : Combinaisons des meilleurs leviers (top 5)
 * Phase 3 : Résumé avec formule recommandée
 *
 * Usage : node grid-search-all-leviers.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// CHARGER LES CLASSEMENTS
// ============================================================
function loadJSON(file) {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8')); }
    catch { return null; }
}

function buildLookup(data, keyField) {
    const map = {};
    if (!data?.resultats) return map;
    const list = Array.isArray(data.resultats) ? data.resultats : Object.entries(data.resultats).map(([k, v]) => ({ _key: k, ...v }));
    list.forEach(item => {
        const k = (item[keyField] || item._key || '').toUpperCase().trim();
        if (k) map[k] = item;
    });
    return map;
}

// Charger tous les classements
const chx25 = buildLookup(loadJSON('chevaux_2025_ponderated_latest.json'), 'Nom');
const chx26 = buildLookup(loadJSON('chevaux_ponderated_latest.json'), 'Nom');
const jk25 = buildLookup(loadJSON('jockeys_2025_ponderated_latest.json'), 'NomPostal');
const jk26 = buildLookup(loadJSON('jockeys_ponderated_latest.json'), 'NomPostal');
const crOr25 = buildLookup(loadJSON('cravache_or_2025_ponderated_latest.json'), 'NomPostal');
const crOr26 = buildLookup(loadJSON('cravache_or_ponderated_latest.json'), 'NomPostal');

// Forme récente, combo, distance stats
const formeData = loadJSON('chevaux_forme_recente.json');
const formeMap = formeData?.resultats || {};
const comboData = loadJSON('combo_jockey_entraineur.json');
const comboMap = comboData?.resultats || {};
const distStatsData = loadJSON('chevaux_distance_stats.json');
const distStatsMap = distStatsData?.resultats || {};

const popChx25 = Object.keys(chx25).length || 1;
const popChx26 = Object.keys(chx26).length || 1;
const popJk25 = Object.keys(jk25).length || 1;
const popJk26 = Object.keys(jk26).length || 1;
const popCr25 = Object.keys(crOr25).length || 1;
const popCr26 = Object.keys(crOr26).length || 1;

console.log(`Classements: chx25=${popChx25} chx26=${popChx26} jk25=${popJk25} jk26=${popJk26} crOr25=${popCr25} crOr26=${popCr26}`);
console.log(`Forme: ${Object.keys(formeMap).length} | Combos: ${Object.keys(comboMap).length} | DistStats: ${Object.keys(distStatsMap).length}`);

// ============================================================
// EXTRAIRE LE NOM DU CHEVAL (sans sexe/race/age)
// ============================================================
function extractNomCheval(chevalStr) {
    if (!chevalStr) return '';
    return chevalStr.replace(/\s+[MFH]\.\w*\.?\s*\d+\s*a\.?\s*$/i, '').trim().toUpperCase();
}

function extractJockey(jockeyStr) {
    return (jockeyStr || '').toUpperCase().trim();
}

function extractEntraineur(p) {
    return (p.entraineur || p['entraîneur'] || '').toUpperCase().trim();
}

// ============================================================
// DÉFINIR TOUS LES LEVIERS
// ============================================================
function computeAllLeviers(p, dist, nbPartants) {
    const nom = extractNomCheval(p.cheval);
    const jockey = extractJockey(p.jockey);
    const entraineur = extractEntraineur(p);

    // --- Données brutes du participant ---
    const coteVal = parseFloat(p.cote) || 0;
    const coteRef = parseFloat(p.cote_reference) || 0;
    const valeur = parseFloat(p.valeur) || 0;
    const gains = parseInt(String(p.gains).replace(/\D/g, '')) || 0;
    const nbCourses = parseInt(p.nb_courses) || 0;
    const nbVictoires = parseInt(p.nb_victoires) || 0;
    const nbPlaces = parseInt(p.nb_places) || 0;

    // Scores dérivés du participant
    const scoreCote = coteVal > 1 ? (1 / coteVal) * 100 : 50;
    const scoreCoteRef = coteRef > 1 ? (1 / coteRef) * 100 : 50;
    const tauxVIndiv = nbCourses >= 2 ? (nbVictoires / nbCourses) * 100 : 8;
    const tauxPIndiv = nbCourses >= 2 ? (nbPlaces / nbCourses) * 100 : 30;
    const gainNorm = gains > 0 ? Math.log10(gains) * 10 : 0; // log scale

    // Musique
    let scoreMusique = 50;
    if (p.musique) {
        const pos = p.musique.replace(/\(\d+\)/g, '').match(/(\d+|[DRT])[a-z]/gi);
        if (pos && pos.length >= 2) {
            const l = pos.slice(0, 5).map(x => {
                const v = x.slice(0, -1);
                if ('DRT'.includes(v)) return 12;
                const n = parseInt(v); return n === 0 ? 12 : n;
            });
            let sc = 0, w = 0;
            l.forEach((ps, i) => {
                const wt = (l.length - i) / l.length;
                const s = ps === 1 ? 100 : ps === 2 ? 80 : ps === 3 ? 65 : ps <= 5 ? 45 : ps <= 8 ? 25 : 10;
                sc += s * wt; w += wt;
            });
            scoreMusique = w > 0 ? sc / w : 50;
        }
    }

    // --- Classements chevaux ---
    const ch25 = chx25[nom];
    const ch26 = chx26[nom];
    const chTauxV25 = ch25 ? parseFloat(ch25.TauxVictoire || 0) : null;
    const chTauxV26 = ch26 ? parseFloat(ch26.TauxVictoire || 0) : null;
    const chTauxV = chTauxV25 !== null && chTauxV26 !== null ? Math.max(chTauxV25, chTauxV26) : chTauxV25 ?? chTauxV26 ?? 8;
    const chRang25 = ch25 ? parseInt(ch25.Rang) : null;
    const chRang26 = ch26 ? parseInt(ch26.Rang) : null;
    const chScore25 = chRang25 ? 100 * (1 - (chRang25 - 1) / popChx25) : null;
    const chScore26 = chRang26 ? 100 * (1 - (chRang26 - 1) / popChx26) : null;
    const chRangScore = chScore25 !== null && chScore26 !== null ? Math.max(chScore25, chScore26) : chScore25 ?? chScore26 ?? 50;
    const chGainMoy = Math.max(ch25?.GainMoyen || 0, ch26?.GainMoyen || 0) || 0;
    const chGainMoyNorm = chGainMoy > 0 ? Math.log10(chGainMoy) * 15 : 0;
    const chScoreMixte = Math.max(parseFloat(ch25?.ScoreMixte || 0), parseFloat(ch26?.ScoreMixte || 0));
    const chTauxP25 = ch25 ? parseFloat(ch25.TauxPlace || 0) : null;
    const chTauxP26 = ch26 ? parseFloat(ch26.TauxPlace || 0) : null;
    const chTauxP = chTauxP25 !== null && chTauxP26 !== null ? Math.max(chTauxP25, chTauxP26) : chTauxP25 ?? chTauxP26 ?? 30;

    // --- Classements jockeys ---
    const j25 = jk25[jockey];
    const j26 = jk26[jockey];
    const jTauxV = Math.max(j25 ? parseFloat(j25.TauxVictoire || 0) : 0, j26 ? parseFloat(j26.TauxVictoire || 0) : 0) || 8;
    const jTauxP = Math.max(j25 ? parseFloat(j25.TauxPlace || 0) : 0, j26 ? parseFloat(j26.TauxPlace || 0) : 0) || 30;
    const jRang25 = j25 ? parseInt(j25.Rang) : null;
    const jRang26 = j26 ? parseInt(j26.Rang) : null;
    const jScore25 = jRang25 ? 100 * (1 - (jRang25 - 1) / popJk25) : null;
    const jScore26 = jRang26 ? 100 * (1 - (jRang26 - 1) / popJk26) : null;
    const jRangScore = jScore25 !== null && jScore26 !== null ? Math.max(jScore25, jScore26) : jScore25 ?? jScore26 ?? 50;
    const jScoreMixte = Math.max(parseFloat(j25?.ScoreMixte || 0), parseFloat(j26?.ScoreMixte || 0));
    const jGainMoy = Math.max(j25?.GainMoyen || 0, j26?.GainMoyen || 0);
    const jGainMoyNorm = jGainMoy > 0 ? Math.log10(jGainMoy) * 15 : 0;

    // --- Cravache d'or ---
    const cr25 = crOr25[jockey];
    const cr26 = crOr26[jockey];
    const crRang25 = cr25 ? parseInt(cr25.Rang) : null;
    const crRang26 = cr26 ? parseInt(cr26.Rang) : null;
    const crScore25 = crRang25 ? 100 * (1 - (crRang25 - 1) / popCr25) : null;
    const crScore26 = crRang26 ? 100 * (1 - (crRang26 - 1) / popCr26) : null;
    const crRangScore = crScore25 !== null && crScore26 !== null ? Math.max(crScore25, crScore26) : crScore25 ?? crScore26 ?? 50;

    // --- Forme récente ---
    const forme = formeMap[nom];
    const formeScore = forme ? forme.formeScore : 50;

    // --- Combo jockey × entraîneur ---
    const comboKey = jockey + '|||' + entraineur;
    const combo = comboMap[comboKey];
    const comboTauxV = combo && combo.courses >= 3 ? combo.tauxVictoire : 10;

    // --- Stats par distance ---
    const distStats = distStatsMap[nom];
    const bucket = dist < 1400 ? 'sprint' : dist < 1700 ? 'mile' : dist < 2200 ? 'middle' : 'staying';
    const dsBucket = distStats?.[bucket];
    const dsTauxV = dsBucket && dsBucket.courses >= 2 ? dsBucket.tauxVictoire : null;
    const dsScore = dsTauxV ?? tauxVIndiv; // fallback sur indiv

    return {
        // Levier name → score value
        'Cote (1/cote)': scoreCote,
        'Cote ref (1/ref)': scoreCoteRef,
        'Valeur FG': valeur > 0 ? valeur : 50,
        'Musique': scoreMusique,
        'Gains (log)': gainNorm,
        'TauxV indiv': tauxVIndiv,
        'TauxP indiv': tauxPIndiv,
        'NbVictoires': nbVictoires * 5,
        'NbCourses': nbCourses,
        'Ch TauxV (ranking)': chTauxV,
        'Ch TauxP (ranking)': chTauxP,
        'Ch Rang (ranking)': chRangScore,
        'Ch GainMoy (ranking)': chGainMoyNorm,
        'Ch ScoreMixte': chScoreMixte,
        'Jk TauxV (ranking)': jTauxV,
        'Jk TauxP (ranking)': jTauxP,
        'Jk Rang (ranking)': jRangScore,
        'Jk ScoreMixte': jScoreMixte,
        'Jk GainMoy (ranking)': jGainMoyNorm,
        'Cravache Rang': crRangScore,
        'Forme récente': formeScore,
        'Combo Jk×Ent': comboTauxV,
        'Dist TauxV': dsScore,
    };
}

// ============================================================
// CHARGER COURSES
// ============================================================
function distLabel(d) { return d < 1400 ? 'sprint' : d < 1700 ? 'mile' : d < 2200 ? 'middle' : 'staying'; }

function loadAllCourses() {
    const dir = path.join(__dirname, 'data', 'courses');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    const courses = { sprint: [], mile: [], middle: [], staying: [] };

    files.forEach(f => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (data.type_reunion && data.type_reunion.toLowerCase() !== 'plat') return;
            const fileDate = (f.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || '';

            (data.courses || []).forEach(c => {
                if (c.type && c.type.toLowerCase() !== 'plat') return;
                if (!c.participants || !c.participants.length) return;
                if (!c.arrivee_definitive) return;
                if (!c.participants.some(p => p.arrivee === 1)) return;
                const dist = parseInt(String(c.distance || '').replace(/[^0-9]/g, '')) || 0;
                const dl = distLabel(dist);
                const avecCotes = c.participants.filter(p => p.cote > 1);
                const parCote = [...avecCotes].sort((a, b) => a.cote - b.cote);
                if (!parCote.length) return;

                // Pré-calculer les leviers pour chaque participant
                const enriched = c.participants.map(p => ({
                    ...p,
                    _leviers: computeAllLeviers(p, dist, c.participants.length)
                }));

                courses[dl].push({ participants: enriched, dist, parCote, date: fileDate });
            });
        } catch { /* skip */ }
    });
    return courses;
}

// ============================================================
// ÉVALUER UN LEVIER OU UNE COMBINAISON
// ============================================================
function evalLevier(courses, levierNames, weights) {
    let n1 = 0, f1 = 0, n2 = 0, f2 = 0, n3 = 0, f3 = 0;
    let coteSumN1 = 0, winsN1 = 0;

    courses.forEach(c => {
        const scored = c.participants.map(p => {
            let s = 0;
            levierNames.forEach((name, i) => {
                s += (p._leviers[name] || 0) * (weights ? weights[i] : 1);
            });
            return { ...p, _s: s };
        }).sort((a, b) => b._s - a._s);

        if (scored[0]?.arrivee === 1) { n1++; if (scored[0].cote > 1) { coteSumN1 += scored[0].cote; winsN1++; } }
        if (scored.slice(0, 2).some(p => p.arrivee === 1)) n2++;
        if (scored.slice(0, 3).some(p => p.arrivee === 1)) n3++;
        if (c.parCote[0]?.arrivee === 1) f1++;
        if (c.parCote.slice(0, 2).some(p => p.arrivee === 1)) f2++;
        if (c.parCote.slice(0, 3).some(p => p.arrivee === 1)) f3++;
    });

    const t = courses.length;
    return {
        n1, f1, n2, f2, n3, f3, total: t,
        pN1: t ? n1 / t * 100 : 0, pF1: t ? f1 / t * 100 : 0,
        pN2: t ? n2 / t * 100 : 0, pF2: t ? f2 / t * 100 : 0,
        pN3: t ? n3 / t * 100 : 0, pF3: t ? f3 / t * 100 : 0,
        avgCoteWin: winsN1 > 0 ? coteSumN1 / winsN1 : 0
    };
}

// ============================================================
// ANALYSE PAR CATÉGORIE
// ============================================================
function analyzeCategory(label, allCourses) {
    if (allCourses.length < 20) {
        console.log(`\n⚠️  ${label}: ${allCourses.length} courses — insuffisant\n`);
        return null;
    }

    allCourses.sort((a, b) => a.date.localeCompare(b.date));
    const splitIdx = Math.floor(allCourses.length * 0.6);
    const train = allCourses.slice(0, splitIdx);
    const test = allCourses.slice(splitIdx);

    console.log(`\n${'━'.repeat(80)}`);
    console.log(`📊 ${label} — ${allCourses.length} courses (train ${train.length} / test ${test.length})`);
    console.log(`   Train: ${train[0].date} → ${train[train.length - 1].date}`);
    console.log(`   Test:  ${test[0].date} → ${test[test.length - 1].date}`);
    console.log(`${'━'.repeat(80)}`);

    // Favori baseline
    const favTest = evalLevier(test, ['Cote (1/cote)'], [1]);

    // Levier names
    const levierNames = Object.keys(allCourses[0].participants[0]._leviers);

    // ── PHASE 1 : Chaque levier seul ──
    console.log(`\n📋 Phase 1 : Chaque levier seul (${levierNames.length} leviers)`);
    console.log(`${'Levier'.padEnd(25)} | ${'TRAIN'.padStart(6)} ${'TEST'.padStart(6)} ${'vsFav'.padStart(7)} | ${'T2'.padStart(5)} ${'T3'.padStart(5)} ${'CoteMoy'.padStart(8)}`);
    console.log('─'.repeat(80));

    const soloResults = levierNames.map(name => {
        const trainR = evalLevier(train, [name], [1]);
        const testR = evalLevier(test, [name], [1]);
        return { name, trainR, testR };
    });

    soloResults.sort((a, b) => b.testR.pN1 - a.testR.pN1);

    soloResults.forEach((r, i) => {
        const d = r.testR.pN1 - favTest.pF1;
        const icon = d > 0 ? '✅' : d === 0 ? '➖' : '  ';
        console.log(
            `${icon} ${r.name.padEnd(23)} | ${r.trainR.pN1.toFixed(1).padStart(5)}% ${r.testR.pN1.toFixed(1).padStart(5)}% ` +
            `${(d > 0 ? '+' : '') + d.toFixed(1) + 'pp'} ` +
            `| ${r.testR.pN2.toFixed(0).padStart(4)}% ${r.testR.pN3.toFixed(0).padStart(4)}% ` +
            `${r.testR.avgCoteWin > 0 ? r.testR.avgCoteWin.toFixed(1).padStart(7) : '      -'}`
        );
    });

    // ── PHASE 2 : Combinaisons des top 6 leviers ──
    const top6 = soloResults.slice(0, 6).map(r => r.name);
    console.log(`\n📋 Phase 2 : Combinaisons des 6 meilleurs leviers (poids par pas de 20%)`);
    console.log(`   ${top6.join(' | ')}`);

    // Tester paires avec grid 20%
    const pairResults = [];
    for (let i = 0; i < top6.length; i++) {
        for (let j = i + 1; j < top6.length; j++) {
            for (let w = 20; w <= 80; w += 20) {
                const w1 = w / 100, w2 = (100 - w) / 100;
                const trainR = evalLevier(train, [top6[i], top6[j]], [w1, w2]);
                const testR = evalLevier(test, [top6[i], top6[j]], [w1, w2]);
                pairResults.push({
                    names: [top6[i], top6[j]],
                    weights: [w1, w2],
                    trainR, testR
                });
            }
        }
    }

    // Tester triplets (top 4 seulement, pas de 33%)
    const top4 = top6.slice(0, 4);
    for (let i = 0; i < top4.length; i++) {
        for (let j = i + 1; j < top4.length; j++) {
            for (let k = j + 1; k < top4.length; k++) {
                for (let w1 = 20; w1 <= 60; w1 += 20) {
                    for (let w2 = 20; w2 <= 80 - w1; w2 += 20) {
                        const w3 = (100 - w1 - w2) / 100;
                        pairResults.push({
                            names: [top4[i], top4[j], top4[k]],
                            weights: [w1 / 100, w2 / 100, w3],
                            trainR: evalLevier(train, [top4[i], top4[j], top4[k]], [w1 / 100, w2 / 100, w3]),
                            testR: evalLevier(test, [top4[i], top4[j], top4[k]], [w1 / 100, w2 / 100, w3])
                        });
                    }
                }
            }
        }
    }

    pairResults.sort((a, b) => b.testR.pN1 !== a.testR.pN1 ? b.testR.pN1 - a.testR.pN1 : b.testR.pN2 - a.testR.pN2);

    console.log(`\n🏆 Top 15 combinaisons (sur TEST) :`);
    console.log(`${'#'.padStart(3)} ${'Formule'.padEnd(50)} | ${'TRAIN'.padStart(6)} ${'TEST'.padStart(6)} ${'vsFav'.padStart(7)} | ${'T2'.padStart(5)} ${'T3'.padStart(5)} ${'Cote'.padStart(5)}`);
    console.log('─'.repeat(95));

    pairResults.slice(0, 15).forEach((r, i) => {
        const formula = r.names.map((n, idx) => `${n.split(' ')[0]}×${(r.weights[idx] * 100).toFixed(0)}%`).join(' + ');
        const d = r.testR.pN1 - favTest.pF1;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        console.log(
            `${medal}${String(i + 1).padStart(2)} ${formula.padEnd(49)} | ${r.trainR.pN1.toFixed(1).padStart(5)}% ${r.testR.pN1.toFixed(1).padStart(5)}% ` +
            `${(d > 0 ? '+' : '') + d.toFixed(1) + 'pp'} ` +
            `| ${r.testR.pN2.toFixed(0).padStart(4)}% ${r.testR.pN3.toFixed(0).padStart(4)}% ` +
            `${r.testR.avgCoteWin > 0 ? r.testR.avgCoteWin.toFixed(1) : '-'}`
        );
    });

    const best = pairResults[0];
    const beatsFav = best.testR.pN1 > favTest.pF1;
    console.log(`\nFavori TEST: ${favTest.pF1.toFixed(1)}% | Meilleure combo: ${best.testR.pN1.toFixed(1)}% ${beatsFav ? '✅ BAT' : '❌ ne bat PAS'} le favori`);

    return {
        category: label,
        trainSize: train.length, testSize: test.length,
        favTest,
        soloTop: soloResults.slice(0, 10).map(r => ({
            name: r.name,
            trainTop1: r.trainR.pN1,
            testTop1: r.testR.pN1,
            testTop2: r.testR.pN2,
            testTop3: r.testR.pN3,
            avgCoteWin: r.testR.avgCoteWin
        })),
        comboTop: pairResults.slice(0, 10).map(r => ({
            names: r.names,
            weights: r.weights,
            trainTop1: r.trainR.pN1,
            testTop1: r.testR.pN1,
            testTop2: r.testR.pN2,
            testTop3: r.testR.pN3,
            avgCoteWin: r.testR.avgCoteWin
        })),
        beatsFav
    };
}

// ============================================================
// MAIN
// ============================================================
console.log(`\n🏇 GRID SEARCH ALL LEVIERS — Walk-Forward 60/40`);
console.log('='.repeat(80));

const courses = loadAllCourses();
console.log(`\nSprint: ${courses.sprint.length} | Mile: ${courses.mile.length} | Middle: ${courses.middle.length} | Staying: ${courses.staying.length}\n`);

const results = {};
results.sprint = analyzeCategory('Sprint (<1400m)', courses.sprint);
results.mile = analyzeCategory('Mile (1400-1700m)', courses.mile);
results.middle = analyzeCategory('Middle (1700-2200m)', courses.middle);
results.staying = analyzeCategory('Staying (>2200m)', courses.staying);

// Résumé final
console.log(`\n${'═'.repeat(80)}`);
console.log(`📋 RÉSUMÉ FINAL — Meilleur levier seul + meilleure combinaison par catégorie`);
console.log(`${'═'.repeat(80)}`);

Object.entries(results).forEach(([cat, r]) => {
    if (!r) return;
    const solo = r.soloTop[0];
    const combo = r.comboTop[0];
    const formula = combo.names.map((n, i) => `${n}×${(combo.weights[i] * 100).toFixed(0)}%`).join(' + ');

    console.log(`\n${cat.toUpperCase()} (${r.trainSize}+${r.testSize} courses):`);
    console.log(`  Favori TEST:     ${r.favTest.pF1.toFixed(1)}%`);
    console.log(`  Meilleur solo:   ${solo.name} → ${solo.testTop1.toFixed(1)}% ${solo.testTop1 > r.favTest.pF1 ? '✅' : '❌'}`);
    console.log(`  Meilleure combo: ${formula}`);
    console.log(`                   → Top1 ${combo.testTop1.toFixed(1)}% | Top2 ${combo.testTop2.toFixed(1)}% | Top3 ${combo.testTop3.toFixed(1)}% ${combo.testTop1 > r.favTest.pF1 ? '✅' : '❌'}`);
    if (combo.avgCoteWin > 0) {
        const roi = (combo.testTop1 / 100 * combo.avgCoteWin - 1) * 100;
        console.log(`                   → Cote moy: ${combo.avgCoteWin.toFixed(1)} | ROI: ${roi.toFixed(0)}%`);
    }
});

// Save
fs.writeFileSync(
    path.join(__dirname, 'data', 'backtest', 'grid_search_all_leviers.json'),
    JSON.stringify({ date: new Date().toISOString(), method: 'all-leviers walk-forward 60/40', results }, null, 2)
);
console.log(`\n💾 Sauvegardé dans data/backtest/grid_search_all_leviers.json\n`);
