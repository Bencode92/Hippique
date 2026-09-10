#!/usr/bin/env node
/**
 * GRID SEARCH WALK-FORWARD — Validation honnête
 *
 * Sépare les données en TRAIN (première moitié) et TEST (seconde moitié)
 * Optimise sur TRAIN, évalue sur TEST → pas d'overfitting
 *
 * Usage : node grid-search-walkforward.js
 */

const fs = require('fs');
const path = require('path');

function parseMusique(musique) {
    if (!musique) return 50;
    const pos = musique.replace(/\(\d+\)/g, '').match(/(\d+|[DRT])[a-z]/gi);
    if (!pos || pos.length < 2) return 50;
    const l = pos.slice(0, 5).map(x => {
        const v = x.slice(0, -1);
        if ('DRT'.includes(v)) return 12;
        const n = parseInt(v);
        return n === 0 ? 12 : n;
    });
    let sc = 0, w = 0;
    l.forEach((ps, i) => {
        const wt = (l.length - i) / l.length;
        const s = ps === 1 ? 100 : ps === 2 ? 80 : ps === 3 ? 65 : ps <= 5 ? 45 : ps <= 8 ? 25 : 10;
        sc += s * wt; w += wt;
    });
    return w > 0 ? sc / w : 50;
}

function scorerAvecPoids(participants, dist, weights) {
    const { wMus, wCote, wVal, wIndivV, wPelotonSmall, wPelotonLarge } = weights;
    const nbPartants = participants.length;
    return participants.map(p => {
        const val = parseFloat(p.valeur) || 50;
        const coteS = p.cote > 1 ? (1 / p.cote) * 100 : 50;
        const mus = parseMusique(p.musique);
        const nbC = parseInt(p.nb_courses) || 0;
        const indivV = nbC >= 2 ? (parseInt(p.nb_victoires) || 0) / nbC * 100 : 8;
        let s = mus * wMus + coteS * wCote + val * wVal + indivV * wIndivV;
        if (nbPartants < 9) s += val * wPelotonSmall;
        else if (nbPartants >= 14) s += indivV * wPelotonLarge;
        return { ...p, _s: s };
    }).sort((a, b) => b._s - a._s);
}

function distLabel(d) { return d < 1400 ? 'sprint' : d < 1700 ? 'mile' : d < 2200 ? 'middle' : 'staying'; }

function loadAllCourses() {
    const dir = path.join(__dirname, 'data', 'courses');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    const courses = { sprint: [], mile: [], middle: [], staying: [] };

    files.forEach(f => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (data.type_reunion && data.type_reunion.toLowerCase() !== 'plat') return;
            const hippo = (data.hippodrome || '').toUpperCase();
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
                courses[dl].push({ participants: c.participants, dist, parCote, hippo, date: fileDate, nom: c.nom || '' });
            });
        } catch (e) { /* skip */ }
    });
    return courses;
}

function generateCombos(step, includeIndivV) {
    const combos = [];
    const max = 100;
    if (includeIndivV) {
        for (let mus = 0; mus <= max; mus += step)
            for (let cote = 0; cote <= max - mus; cote += step)
                for (let val = 0; val <= max - mus - cote; val += step)
                    combos.push({ wMus: mus/100, wCote: cote/100, wVal: val/100, wIndivV: (max-mus-cote-val)/100 });
    } else {
        for (let mus = 0; mus <= max; mus += step)
            for (let cote = 0; cote <= max - mus; cote += step)
                combos.push({ wMus: mus/100, wCote: cote/100, wVal: (max-mus-cote)/100, wIndivV: 0 });
    }
    return combos;
}

function evalCombo(courses, weights) {
    let n1 = 0, f1 = 0, n2 = 0, f2 = 0, n3 = 0, f3 = 0;
    let coteSumN1 = 0, winsN1 = 0;
    courses.forEach(c => {
        const scored = scorerAvecPoids(c.participants, c.dist, weights);
        if (scored[0]?.arrivee === 1) { n1++; if (scored[0].cote > 1) { coteSumN1 += scored[0].cote; winsN1++; } }
        if (scored.slice(0,2).some(p => p.arrivee === 1)) n2++;
        if (scored.slice(0,3).some(p => p.arrivee === 1)) n3++;
        if (c.parCote[0]?.arrivee === 1) f1++;
        if (c.parCote.slice(0,2).some(p => p.arrivee === 1)) f2++;
        if (c.parCote.slice(0,3).some(p => p.arrivee === 1)) f3++;
    });
    const t = courses.length;
    return { n1, f1, n2, f2, n3, f3, total: t,
        pN1: t?n1/t*100:0, pF1: t?f1/t*100:0, pN2: t?n2/t*100:0, pF2: t?f2/t*100:0,
        pN3: t?n3/t*100:0, pF3: t?f3/t*100:0,
        avgCoteWin: winsN1 > 0 ? coteSumN1/winsN1 : 0, weights };
}

// ============================================================
// WALK-FORWARD
// ============================================================
function walkForward(label, courses, step, includeIndivV) {
    if (courses.length < 20) {
        console.log(`⚠️  ${label}: ${courses.length} courses — pas assez\n`);
        return null;
    }

    // Trier par date
    courses.sort((a, b) => a.date.localeCompare(b.date));
    const splitIdx = Math.floor(courses.length * 0.6); // 60% train, 40% test
    const train = courses.slice(0, splitIdx);
    const test = courses.slice(splitIdx);

    const trainDates = `${train[0].date} → ${train[train.length-1].date}`;
    const testDates = `${test[0].date} → ${test[test.length-1].date}`;

    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📊 ${label} — ${courses.length} courses`);
    console.log(`   TRAIN: ${train.length} courses (${trainDates})`);
    console.log(`   TEST:  ${test.length} courses (${testDates})`);
    console.log(`${'━'.repeat(70)}`);

    const pelotonCombos = [
        { wPelotonSmall: 0, wPelotonLarge: 0 },
        { wPelotonSmall: 0.10, wPelotonLarge: 0 },
        { wPelotonSmall: 0.15, wPelotonLarge: 0 },
        { wPelotonSmall: 0.20, wPelotonLarge: 0 },
        { wPelotonSmall: 0, wPelotonLarge: 0.15 },
        { wPelotonSmall: 0, wPelotonLarge: 0.30 },
        { wPelotonSmall: 0.15, wPelotonLarge: 0.15 },
        { wPelotonSmall: 0.15, wPelotonLarge: 0.30 },
    ];

    const weightCombos = generateCombos(step, includeIndivV);

    // Optimize on TRAIN
    let bestTrain = [];
    pelotonCombos.forEach(pel => {
        weightCombos.forEach(w => {
            const weights = { ...w, ...pel };
            const r = evalCombo(train, weights);
            bestTrain.push(r);
        });
    });
    bestTrain.sort((a, b) => b.pN1 !== a.pN1 ? b.pN1 - a.pN1 : b.pN2 - a.pN2);

    // Evaluate top 20 TRAIN formulas on TEST
    const top20 = bestTrain.slice(0, 20);
    const testResults = top20.map(trainR => {
        const testR = evalCombo(test, trainR.weights);
        return { trainR, testR };
    });
    testResults.sort((a, b) => b.testR.pN1 !== a.testR.pN1 ? b.testR.pN1 - a.testR.pN1 : b.testR.pN2 - a.testR.pN2);

    // Favori baseline
    const favTrain = evalCombo(train, { wMus: 0, wCote: 1, wVal: 0, wIndivV: 0, wPelotonSmall: 0, wPelotonLarge: 0 });
    const favTest = evalCombo(test, { wMus: 0, wCote: 1, wVal: 0, wIndivV: 0, wPelotonSmall: 0, wPelotonLarge: 0 });

    // Formule actuelle
    const currentWeights = {
        sprint:  { wMus: 0.4, wCote: 0.4, wVal: 0.2, wIndivV: 0, wPelotonSmall: 0.15, wPelotonLarge: 0 },
        mile:    { wMus: 0.2, wCote: 0.3, wVal: 0.5, wIndivV: 0, wPelotonSmall: 0.15, wPelotonLarge: 0 },
        middle:  { wMus: 0, wCote: 0.5, wVal: 0.3, wIndivV: 0.2, wPelotonSmall: 0.15, wPelotonLarge: 0 },
        staying: { wMus: 0.3, wCote: 0.4, wVal: 0.3, wIndivV: 0, wPelotonSmall: 0.15, wPelotonLarge: 0 },
    };
    const catKey = label.toLowerCase().split(' ')[0];
    const currTrain = evalCombo(train, currentWeights[catKey]);
    const currTest = evalCombo(test, currentWeights[catKey]);

    console.log(`\n🎯 Favori cote:     TRAIN ${favTrain.pF1.toFixed(1)}% | TEST ${favTest.pF1.toFixed(1)}%`);
    console.log(`📐 Formule actuelle: TRAIN ${currTrain.pN1.toFixed(1)}% | TEST ${currTest.pN1.toFixed(1)}%`);

    console.log(`\n🏆 Top 10 (optimisées sur TRAIN, évaluées sur TEST):`);
    console.log(`${'#'.padStart(3)} ${'Mus'.padStart(4)} ${'Cote'.padStart(5)} ${'Val'.padStart(4)} ${'IndV'.padStart(5)} ${'Sm'.padStart(5)} ${'Lg'.padStart(5)} | ${'TRAIN'.padStart(6)} ${'TEST'.padStart(6)} ${'vsFav'.padStart(7)} | ${'T2'.padStart(5)} ${'T3'.padStart(5)} ${'Cote'.padStart(5)}`);
    console.log('─'.repeat(85));

    testResults.slice(0, 10).forEach((r, i) => {
        const w = r.testR.weights;
        const d = r.testR.pN1 - favTest.pF1;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        console.log(
            `${medal}${String(i+1).padStart(2)} ` +
            `${(w.wMus*100).toFixed(0).padStart(3)}% ` +
            `${(w.wCote*100).toFixed(0).padStart(4)}% ` +
            `${(w.wVal*100).toFixed(0).padStart(3)}% ` +
            `${(w.wIndivV*100).toFixed(0).padStart(4)}% ` +
            `${((w.wPelotonSmall||0)*100).toFixed(0).padStart(4)}% ` +
            `${((w.wPelotonLarge||0)*100).toFixed(0).padStart(4)}% ` +
            `| ${r.trainR.pN1.toFixed(1).padStart(5)}% ${r.testR.pN1.toFixed(1).padStart(5)}% ` +
            `${(d>0?'+':'')+d.toFixed(1)+'pp'} ` +
            `| ${r.testR.pN2.toFixed(0).padStart(4)}% ${r.testR.pN3.toFixed(0).padStart(4)}% ` +
            `${r.testR.avgCoteWin > 0 ? r.testR.avgCoteWin.toFixed(1) : '-'}`
        );
    });

    const best = testResults[0];
    const beatsFav = best.testR.pN1 > favTest.pF1;
    console.log(`\n${beatsFav ? '✅' : '❌'} Meilleure formule ${beatsFav ? 'BAT' : 'ne bat PAS'} le favori sur TEST (${best.testR.pN1.toFixed(1)}% vs ${favTest.pF1.toFixed(1)}%)`);

    if (best.testR.avgCoteWin > 0) {
        const roi = (best.testR.pN1 / 100 * best.testR.avgCoteWin - 1) * 100;
        console.log(`💰 ROI estimé sur TEST: ${roi.toFixed(0)}% (cote moy: ${best.testR.avgCoteWin.toFixed(1)})`);
    }

    return {
        category: label, trainSize: train.length, testSize: test.length,
        favTest, currTest,
        best: best.testR,
        bestWeights: best.testR.weights,
        beatsFav
    };
}

// ============================================================
// MAIN
// ============================================================
console.log(`\n🏇 GRID SEARCH WALK-FORWARD — Validation honnête`);
console.log(`   60% TRAIN → 40% TEST (zéro leakage)`);
console.log('='.repeat(70));

const courses = loadAllCourses();
console.log(`Sprint: ${courses.sprint.length} | Mile: ${courses.mile.length} | Middle: ${courses.middle.length} | Staying: ${courses.staying.length}`);

const results = {};
results.sprint = walkForward('Sprint (<1400m)', courses.sprint, 10, false);
results.mile = walkForward('Mile (1400-1700m)', courses.mile, 10, false);
results.middle = walkForward('Middle (1700-2200m)', courses.middle, 10, true);
results.staying = walkForward('Staying (>2200m)', courses.staying, 10, false);

// Résumé
console.log(`\n${'═'.repeat(70)}`);
console.log(`📋 RÉSUMÉ WALK-FORWARD (honnête, out-of-sample)`);
console.log(`${'═'.repeat(70)}`);

Object.entries(results).forEach(([cat, r]) => {
    if (!r) return;
    const w = r.bestWeights;
    console.log(`\n${cat.toUpperCase()} (train ${r.trainSize} / test ${r.testSize}):`);
    console.log(`  Favori TEST:  ${r.favTest.pF1.toFixed(1)}%`);
    console.log(`  Actuelle TEST: ${r.currTest.pN1.toFixed(1)}%`);
    console.log(`  Optimale TEST: ${r.best.pN1.toFixed(1)}% ${r.beatsFav ? '✅ BAT le favori' : '❌ ne bat pas le favori'}`);
    console.log(`  Formule: Mus×${w.wMus} + Cote×${w.wCote} + Val×${w.wVal}${w.wIndivV ? ` + IndivV×${w.wIndivV}` : ''}`);
    console.log(`  Top2: ${r.best.pN2.toFixed(1)}% | Top3: ${r.best.pN3.toFixed(1)}%`);
});

// Save
const output = {
    date: new Date().toISOString(),
    method: 'walk-forward 60/40',
    results: Object.fromEntries(
        Object.entries(results).filter(([,v]) => v).map(([k, v]) => [k, {
            trainSize: v.trainSize, testSize: v.testSize,
            favoriTest: { top1: v.favTest.pF1, top2: v.favTest.pF2, top3: v.favTest.pF3 },
            actuelleTest: { top1: v.currTest.pN1, top2: v.currTest.pN2, top3: v.currTest.pN3 },
            optimaleTest: { top1: v.best.pN1, top2: v.best.pN2, top3: v.best.pN3, avgCoteWin: v.best.avgCoteWin },
            bestWeights: v.bestWeights,
            beatsFavori: v.beatsFav
        }])
    )
};
fs.writeFileSync(path.join(__dirname, 'data', 'backtest', 'grid_search_walkforward.json'), JSON.stringify(output, null, 2));
console.log(`\n💾 Sauvegardé dans data/backtest/grid_search_walkforward.json\n`);
