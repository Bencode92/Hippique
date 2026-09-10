#!/usr/bin/env node
/**
 * GRID SEARCH — Trouver la formule optimale par type de distance
 *
 * Pour chaque catégorie (Sprint/Mile/Middle/Staying) :
 *   - Teste toutes les combinaisons de poids (musique, cote, valeur, indivV)
 *   - Compare Top1/Top2/Top3 vs favori cote
 *   - Affiche les meilleures formules et celles qui battent le favori
 *
 * Usage : node grid-search-formules.js
 *         node grid-search-formules.js --step 5    (pas de 5% au lieu de 10%)
 */

const fs = require('fs');
const path = require('path');
const glob = require('path');

// ============================================================
// SCORING
// ============================================================
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

        // Peloton
        if (nbPartants < 9) s += val * wPelotonSmall;
        else if (nbPartants >= 14) s += indivV * wPelotonLarge;

        return { ...p, _s: s };
    }).sort((a, b) => b._s - a._s);
}

function distLabel(d) {
    return d < 1400 ? 'sprint' : d < 1700 ? 'mile' : d < 2200 ? 'middle' : 'staying';
}

// ============================================================
// CHARGER TOUTES LES COURSES
// ============================================================
function loadAllCourses() {
    const dir = path.join(__dirname, 'data', 'courses');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const courses = { sprint: [], mile: [], middle: [], staying: [] };
    let totalFiles = 0, totalCourses = 0;

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

                courses[dl].push({
                    participants: c.participants,
                    dist,
                    parCote,
                    hippo,
                    date: fileDate,
                    nom: c.nom || ''
                });
                totalCourses++;
            });
            totalFiles++;
        } catch (e) { /* skip */ }
    });

    console.log(`\n📁 ${totalFiles} fichiers, ${totalCourses} courses plat terminées`);
    console.log(`   Sprint: ${courses.sprint.length} | Mile: ${courses.mile.length} | Middle: ${courses.middle.length} | Staying: ${courses.staying.length}\n`);
    return courses;
}

// ============================================================
// GRID SEARCH
// ============================================================
function generateWeightCombos(step, includeIndivV) {
    const combos = [];
    const max = 100;

    if (includeIndivV) {
        // 4 variables : mus, cote, val, indivV (somme = 100)
        for (let mus = 0; mus <= max; mus += step) {
            for (let cote = 0; cote <= max - mus; cote += step) {
                for (let val = 0; val <= max - mus - cote; val += step) {
                    const indivV = max - mus - cote - val;
                    combos.push({
                        wMus: mus / 100, wCote: cote / 100,
                        wVal: val / 100, wIndivV: indivV / 100
                    });
                }
            }
        }
    } else {
        // 3 variables : mus, cote, val (somme = 100)
        for (let mus = 0; mus <= max; mus += step) {
            for (let cote = 0; cote <= max - mus; cote += step) {
                const val = max - mus - cote;
                combos.push({
                    wMus: mus / 100, wCote: cote / 100,
                    wVal: val / 100, wIndivV: 0
                });
            }
        }
    }

    return combos;
}

function evalCombo(courses, weights) {
    let n1 = 0, f1 = 0, n2 = 0, f2 = 0, n3 = 0, f3 = 0;
    let coteSumN1 = 0, winsN1 = 0;

    courses.forEach(c => {
        const scored = scorerAvecPoids(c.participants, c.dist, weights);

        if (scored[0]?.arrivee === 1) {
            n1++;
            if (scored[0].cote > 1) { coteSumN1 += scored[0].cote; winsN1++; }
        }
        if (scored.slice(0, 2).some(p => p.arrivee === 1)) n2++;
        if (scored.slice(0, 3).some(p => p.arrivee === 1)) n3++;

        if (c.parCote[0]?.arrivee === 1) f1++;
        if (c.parCote.slice(0, 2).some(p => p.arrivee === 1)) f2++;
        if (c.parCote.slice(0, 3).some(p => p.arrivee === 1)) f3++;
    });

    const total = courses.length;
    return {
        n1, f1, n2, f2, n3, f3, total,
        pN1: total > 0 ? n1 / total * 100 : 0,
        pF1: total > 0 ? f1 / total * 100 : 0,
        pN2: total > 0 ? n2 / total * 100 : 0,
        pF2: total > 0 ? f2 / total * 100 : 0,
        pN3: total > 0 ? n3 / total * 100 : 0,
        pF3: total > 0 ? f3 / total * 100 : 0,
        avgCoteWin: winsN1 > 0 ? coteSumN1 / winsN1 : 0,
        weights
    };
}

function gridSearchCategory(label, courses, step, includeIndivV) {
    if (courses.length < 5) {
        console.log(`⚠️  ${label}: ${courses.length} courses — pas assez pour optimiser\n`);
        return null;
    }

    // Tester avec différents ajustements peloton
    const pelotonCombos = [
        { wPelotonSmall: 0, wPelotonLarge: 0 },
        { wPelotonSmall: 0.10, wPelotonLarge: 0 },
        { wPelotonSmall: 0.15, wPelotonLarge: 0 },
        { wPelotonSmall: 0.20, wPelotonLarge: 0 },
        { wPelotonSmall: 0, wPelotonLarge: 0.15 },
        { wPelotonSmall: 0, wPelotonLarge: 0.30 },
        { wPelotonSmall: 0.15, wPelotonLarge: 0.15 },
        { wPelotonSmall: 0.15, wPelotonLarge: 0.30 },
        { wPelotonSmall: 0.20, wPelotonLarge: 0.30 },
    ];

    const weightCombos = generateWeightCombos(step, includeIndivV);
    console.log(`🔍 ${label}: ${courses.length} courses, ${weightCombos.length} formules × ${pelotonCombos.length} peloton = ${weightCombos.length * pelotonCombos.length} combinaisons`);

    // Favori baseline
    const fav = evalCombo(courses, { wMus: 0, wCote: 1, wVal: 0, wIndivV: 0, wPelotonSmall: 0, wPelotonLarge: 0 });

    let allResults = [];

    pelotonCombos.forEach(pel => {
        weightCombos.forEach(w => {
            const weights = { ...w, ...pel };
            const r = evalCombo(courses, weights);
            allResults.push(r);
        });
    });

    // Trier par Top1 %, puis Top2, puis Top3
    allResults.sort((a, b) => {
        if (b.pN1 !== a.pN1) return b.pN1 - a.pN1;
        if (b.pN2 !== a.pN2) return b.pN2 - a.pN2;
        return b.pN3 - a.pN3;
    });

    // Formule actuelle
    const currentWeights = {
        sprint:  { wMus: 0.4, wCote: 0.4, wVal: 0.2, wIndivV: 0, wPelotonSmall: 0.15, wPelotonLarge: 0 },
        mile:    { wMus: 0.2, wCote: 0.3, wVal: 0.5, wIndivV: 0, wPelotonSmall: 0.15, wPelotonLarge: 0 },
        middle:  { wMus: 0, wCote: 0.5, wVal: 0.3, wIndivV: 0.2, wPelotonSmall: 0.15, wPelotonLarge: 0 },
        staying: { wMus: 0.3, wCote: 0.4, wVal: 0.3, wIndivV: 0, wPelotonSmall: 0.15, wPelotonLarge: 0 },
    };
    const catKey = label.toLowerCase().split(' ')[0];
    const current = evalCombo(courses, currentWeights[catKey] || currentWeights.middle);

    // Meilleures formules qui battent le favori
    const beatFav = allResults.filter(r => r.pN1 > fav.pF1);

    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📊 ${label} — ${courses.length} courses`);
    console.log(`${'━'.repeat(70)}`);

    console.log(`\n🎯 Favori cote (baseline):`);
    console.log(`   Top1: ${fav.pF1.toFixed(1)}% (${fav.f1}/${fav.total}) | Top2: ${fav.pF2.toFixed(1)}% | Top3: ${fav.pF3.toFixed(1)}%`);

    console.log(`\n📐 Formule actuelle:`);
    const cw = currentWeights[catKey] || {};
    console.log(`   Mus×${cw.wMus} + Cote×${cw.wCote} + Val×${cw.wVal}${cw.wIndivV ? ` + IndivV×${cw.wIndivV}` : ''} | Peloton: small+${cw.wPelotonSmall||0} large+${cw.wPelotonLarge||0}`);
    console.log(`   Top1: ${current.pN1.toFixed(1)}% (${current.n1}/${current.total}) | Top2: ${current.pN2.toFixed(1)}% | Top3: ${current.pN3.toFixed(1)}%`);
    const diff1 = current.pN1 - fav.pF1;
    console.log(`   ${diff1 > 0 ? '✅' : '❌'} vs Favori: ${diff1 > 0 ? '+' : ''}${diff1.toFixed(1)}pp Top1`);

    console.log(`\n🏆 Top 10 meilleures formules:`);
    console.log(`${'#'.padStart(3)} ${'Mus'.padStart(4)} ${'Cote'.padStart(5)} ${'Val'.padStart(4)} ${'IndV'.padStart(5)} ${'Sm'.padStart(5)} ${'Lg'.padStart(5)} | ${'Top1'.padStart(6)} ${'Top2'.padStart(6)} ${'Top3'.padStart(6)} | ${'vsFav'.padStart(6)} ${'CoteMoy'.padStart(8)}`);
    console.log('─'.repeat(80));

    allResults.slice(0, 10).forEach((r, i) => {
        const w = r.weights;
        const d = r.pN1 - fav.pF1;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        console.log(
            `${medal}${String(i + 1).padStart(2)} ` +
            `${(w.wMus * 100).toFixed(0).padStart(3)}% ` +
            `${(w.wCote * 100).toFixed(0).padStart(4)}% ` +
            `${(w.wVal * 100).toFixed(0).padStart(3)}% ` +
            `${(w.wIndivV * 100).toFixed(0).padStart(4)}% ` +
            `${((w.wPelotonSmall || 0) * 100).toFixed(0).padStart(4)}% ` +
            `${((w.wPelotonLarge || 0) * 100).toFixed(0).padStart(4)}% ` +
            `| ${r.pN1.toFixed(1).padStart(5)}% ${r.pN2.toFixed(1).padStart(5)}% ${r.pN3.toFixed(1).padStart(5)}% ` +
            `| ${(d > 0 ? '+' : '') + d.toFixed(1) + 'pp'} ${r.avgCoteWin > 0 ? r.avgCoteWin.toFixed(1) : '-'}`
        );
    });

    if (beatFav.length) {
        console.log(`\n✅ ${beatFav.length} formules battent le favori sur Top1`);
    } else {
        console.log(`\n❌ Aucune formule ne bat le favori sur Top1`);
        // Chercher celles qui battent sur Top2 ou Top3
        const beatFav2 = allResults.filter(r => r.pN2 > fav.pF2);
        const beatFav3 = allResults.filter(r => r.pN3 > fav.pF3);
        if (beatFav2.length) console.log(`   → ${beatFav2.length} formules battent le favori sur Top2`);
        if (beatFav3.length) console.log(`   → ${beatFav3.length} formules battent le favori sur Top3`);
    }

    // Meilleure formule qui bat le favori avec la meilleure cote moyenne
    const bestValue = [...allResults]
        .filter(r => r.pN1 >= fav.pF1 && r.avgCoteWin > 0)
        .sort((a, b) => b.avgCoteWin * b.pN1 - a.avgCoteWin * a.pN1);

    if (bestValue.length) {
        const bv = bestValue[0];
        console.log(`\n💰 Meilleure VALUE (bat favori + meilleures cotes):`);
        console.log(`   Mus×${bv.weights.wMus} + Cote×${bv.weights.wCote} + Val×${bv.weights.wVal}${bv.weights.wIndivV ? ` + IndivV×${bv.weights.wIndivV}` : ''}`);
        console.log(`   Top1: ${bv.pN1.toFixed(1)}% | Cote moy: ${bv.avgCoteWin.toFixed(1)} | ROI estimé: ${((bv.pN1 / 100 * bv.avgCoteWin - 1) * 100).toFixed(0)}%`);
    }

    return {
        category: label,
        total: courses.length,
        favori: fav,
        current,
        best: allResults[0],
        beatFavCount: beatFav.length,
        bestValue: bestValue.length ? bestValue[0] : null
    };
}

// ============================================================
// MAIN
// ============================================================
const step = parseInt(process.argv.find(a => a.match(/^\d+$/)) || '10');
const fineStep = process.argv.includes('--fine') ? 5 : step;

console.log(`\n🏇 GRID SEARCH — Formule optimale par distance`);
console.log(`   Pas: ${step}% | IndivV inclus pour Middle`);
console.log('='.repeat(70));

const courses = loadAllCourses();

const results = {};
results.sprint = gridSearchCategory('Sprint (<1400m)', courses.sprint, step, false);
results.mile = gridSearchCategory('Mile (1400-1700m)', courses.mile, step, false);
results.middle = gridSearchCategory('Middle (1700-2200m)', courses.middle, step, true);
results.staying = gridSearchCategory('Staying (>2200m)', courses.staying, step, false);

// Résumé final
console.log(`\n${'═'.repeat(70)}`);
console.log(`📋 RÉSUMÉ — Formule recommandée par catégorie`);
console.log(`${'═'.repeat(70)}`);

Object.entries(results).forEach(([cat, r]) => {
    if (!r) return;
    const b = r.best;
    const w = b.weights;
    const diffVsFav = b.pN1 - r.favori.pF1;
    const diffVsCurrent = b.pN1 - r.current.pN1;

    console.log(`\n${cat.toUpperCase()} (${r.total} courses):`);
    console.log(`  Actuelle : Top1 ${r.current.pN1.toFixed(1)}% | Favori: ${r.favori.pF1.toFixed(1)}%`);
    console.log(`  Optimale : Mus×${w.wMus} + Cote×${w.wCote} + Val×${w.wVal}${w.wIndivV ? ` + IndivV×${w.wIndivV}` : ''} | Peloton: small+${(w.wPelotonSmall||0)*100}% large+${(w.wPelotonLarge||0)*100}%`);
    console.log(`  Top1: ${b.pN1.toFixed(1)}% (${diffVsFav > 0 ? '✅' : '❌'} ${diffVsFav > 0 ? '+' : ''}${diffVsFav.toFixed(1)}pp vs fav) (${diffVsCurrent > 0 ? '↑' : diffVsCurrent < 0 ? '↓' : '='}${Math.abs(diffVsCurrent).toFixed(1)}pp vs actuelle)`);
    console.log(`  Top2: ${b.pN2.toFixed(1)}% | Top3: ${b.pN3.toFixed(1)}%`);
    if (r.bestValue) {
        console.log(`  💰 VALUE: cote moy ${r.bestValue.avgCoteWin.toFixed(1)} → ROI ${((r.bestValue.pN1 / 100 * r.bestValue.avgCoteWin - 1) * 100).toFixed(0)}%`);
    }
});

// Sauvegarder les résultats
const output = {
    date: new Date().toISOString(),
    step,
    results: Object.fromEntries(
        Object.entries(results).filter(([, v]) => v).map(([k, v]) => [k, {
            total: v.total,
            favori: { top1: v.favori.pF1, top2: v.favori.pF2, top3: v.favori.pF3 },
            actuelle: {
                top1: v.current.pN1, top2: v.current.pN2, top3: v.current.pN3,
                weights: v.current.weights
            },
            optimale: {
                top1: v.best.pN1, top2: v.best.pN2, top3: v.best.pN3,
                weights: v.best.weights,
                avgCoteWin: v.best.avgCoteWin
            },
            bestValue: v.bestValue ? {
                top1: v.bestValue.pN1, avgCoteWin: v.bestValue.avgCoteWin,
                weights: v.bestValue.weights
            } : null,
            combosTestedCount: v.beatFavCount
        }])
    )
};

fs.writeFileSync(
    path.join(__dirname, 'data', 'backtest', 'grid_search_formules.json'),
    JSON.stringify(output, null, 2)
);
console.log(`\n💾 Résultats sauvegardés dans data/backtest/grid_search_formules.json`);
console.log(`\nTerminé.\n`);
