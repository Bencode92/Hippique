/* Règle d'arrêt de la pratique — le seul dispositif qui protège d'un effet
 * sans mécanisme.
 *
 * L'effet Longchamp / Saint-Cloud est réel et répliqué, mais six hypothèses
 * causales ont été réfutées (plancher, trois places, handicap-gros-pool,
 * favori T-8, overround-outsiders, piste connue). Sans cause, rien ne
 * préviendra qu'il a cessé d'exister : il faut donc le surveiller.
 *
 * RÈGLE, figée : ROI glissant sur 24 mois du favori au simple gagnant à
 * Longchamp et Saint-Cloud. Si l'intervalle de confiance à 95 % passe
 * ENTIÈREMENT sous -8 %, la pratique s'arrête et doit être revalidée.
 *
 * Le seuil de -8 % n'est pas optimisé : il est à un écart-type sous le -3,7 %
 * mesuré, et au-dessus du -14 % du reste de la France. Ne pas l'ajuster après
 * coup — c'est tout l'intérêt d'une règle écrite d'avance.
 *
 *     node bench/regle_arret.mjs
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];
const SEUIL_ARRET = -8;
const FENETRE_MOIS = 24;

const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT' || !MOI.some(m=>norm(d.hip).includes(m))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    L.push({ date: d.date, gain: fav.a === 1 ? fav.c : 0 });
  }
L.sort((a,b)=>a.date.localeCompare(b.date));

const bilan = a => {
  if (a.length < 30) return null;
  const g = a.map(x=>x.gain);
  const m = g.reduce((s,x)=>s+x,0)/a.length;
  const se = Math.sqrt(g.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length);
  return { n:a.length, roi:100*(m-1), bas:100*(m-1-1.96*se), haut:100*(m-1+1.96*se) };
};
const reculer = (iso, mois) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString().slice(0,10);
};

const dernier = L[L.length-1].date;
console.log(`Règle d'arrêt — favori, simple gagnant, Longchamp et Saint-Cloud`);
console.log(`Fenêtre ${FENETRE_MOIS} mois · seuil ${SEUIL_ARRET} % · ${L.length} courses depuis ${L[0].date}\n`);

// série glissante, un point par trimestre
console.log('  arrêté au      ROI 24 mois        intervalle 95 %        verdict');
const points = [];
for (let d = new Date(L[0].date + 'T00:00:00Z'); ; d.setUTCMonth(d.getUTCMonth()+3)) {
  const fin = d.toISOString().slice(0,10);
  if (fin > dernier) break;
  const deb = reculer(fin, FENETRE_MOIS);
  const b = bilan(L.filter(x=>x.date > deb && x.date <= fin));
  if (!b) continue;
  points.push({ fin, ...b });
}
for (const p of points.slice(-10)) {
  const stop = p.haut < SEUIL_ARRET;
  console.log(`  ${p.fin}   ${(p.roi>=0?'+':'')}${p.roi.toFixed(1)} %  (n=${String(p.n).padStart(4)})   `
    + `[${p.bas.toFixed(1)} ; ${p.haut.toFixed(1)}]`.padEnd(22)
    + (stop ? 'ARRÊT' : 'continuer'));
}

const p = points[points.length-1];
console.log(`\nVERDICT AU ${p.fin}`);
console.log(`  ROI 24 mois : ${(p.roi>=0?'+':'')}${p.roi.toFixed(1)} %   intervalle [${p.bas.toFixed(1)} ; ${p.haut.toFixed(1)}]   n = ${p.n}`);
if (p.haut < SEUIL_ARRET) {
  console.log(`  ⛔ L'intervalle est entièrement sous ${SEUIL_ARRET} % — la pratique s'arrête et doit être revalidée.`);
} else {
  console.log(`  ✅ L'intervalle n'est pas entièrement sous ${SEUIL_ARRET} % — la pratique continue.`);
  console.log(`     Marge avant déclenchement : ${(p.haut - SEUIL_ARRET).toFixed(1)} points sur la borne haute.`);
}
// ── Sensibilité de la règle ────────────────────────────────────────────
// Une règle d'arrêt doit être évaluée sur ce qu'elle laisse passer, pas
// seulement sur son verdict du jour.
const demiLargeur = (p.haut - p.roi);
console.log(`\nCE QUE LA RÈGLE LAISSE PASSER`);
console.log(`  Avec ${p.n} courses sur 24 mois, l'intervalle vaut ± ${demiLargeur.toFixed(1)} points.`);
console.log(`  Pour que sa borne haute passe sous ${SEUIL_ARRET} %, il faut un ROI de`);
console.log(`  ${(SEUIL_ARRET - demiLargeur).toFixed(1)} % — soit PIRE que le reste de la France (-14 %).`);
console.log(`  Telle qu'écrite, la règle protège d'un effondrement, pas d'une érosion :`);
console.log(`  une dérive de -4 % vers -12 % ne la déclencherait jamais.`);
console.log(`  C'est un arbitrage à rendre explicitement, pas à corriger en douce.`);

console.log(`\n  À relancer tous les trimestres. Ne pas ajuster le seuil : une règle`);
console.log(`  d'arrêt qu'on déplace quand elle se rapproche ne protège de rien.`);

// ── CUSUM (Page) ────────────────────────────────────────────────────────
// Une fenêtre glissante ne détecte pas une érosion : elle noie la dérive dans
// son propre intervalle. Le CUSUM cumule les écarts course par course et
// signale dès que le cumul dépasse un seuil, sans attendre que la moyenne de
// fenêtre bouge.
//
// NOTE DE SIGNE. La formule proposée — S = max(0, S + (rendement − référence
// + 4 pts)) — détecte une HAUSSE : quand le rendement s'effondre, le terme
// devient négatif et S retombe à zéro, donc l'alarme ne sonne jamais. Le
// CUSUM unilatéral BAS s'écrit :
//        S = max(0, S + (référence − rendement − marge))
// avec marge = la moitié de la dérive à détecter. C'est cette forme qui est
// implémentée ici.
const REF   = -0.037;   // chiffre canonique, par course
const DERIVE = -0.08;   // dérive à détecter : passage de -4 % à -12 %
const MARGE = Math.abs(DERIVE) / 2;
const ARL0_CIBLE = 3700; // ~10 ans à 370 courses/an sans fausse alerte

const x = L.map(c => c.gain - 1);   // profit par euro misé

function cusum(serie, h) {
  let S = 0;
  for (let i = 0; i < serie.length; i++) {
    S = Math.max(0, S + (REF - serie[i] - MARGE));
    if (S > h) return i + 1;        // course de déclenchement
  }
  return null;
}
// calibrage de h par rééchantillonnage sous l'hypothèse « rien n'a changé »
function calibrer() {
  const tirage = n => Array.from({length:n}, () => x[(Math.random()*x.length)|0]);
  // borne haute large : le cumul évolue à l'échelle de sd*sqrt(n), soit ~90
  // pour 3 700 courses à 150 pt d'écart-type. Une borne à 30 saturerait.
  let lo = 1, hi = 600;
  for (let it = 0; it < 22; it++) {
    const h = (lo + hi) / 2;
    let dec = 0;
    const N = 400;
    for (let k = 0; k < N; k++) if (cusum(tirage(ARL0_CIBLE), h) !== null) dec++;
    // on vise ~63 % de déclenchement sur une longueur ARL0 (loi géométrique)
    if (dec / N > 0.63) lo = h; else hi = h;
  }
  return (lo + hi) / 2;
}
const h = calibrer();

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`CUSUM — détecter une érosion, pas seulement un effondrement\n`);
console.log(`  référence ${(100*REF).toFixed(1)} % · dérive visée ${(100*DERIVE).toFixed(0)} pt · marge ${(100*MARGE).toFixed(0)} pt`);
console.log(`  seuil h calibré par rééchantillonnage : ${h.toFixed(2)}  (1 fausse alerte / ~10 ans)`);

const decl = cusum(x, h);
console.log(`\n  SUR L'HISTORIQUE RÉEL (${x.length} courses, ${L[0].date} → ${dernier})`);
if (decl === null) console.log(`  ✅ le CUSUM ne se déclenche pas — conforme à la prédiction écrite d'avance.`);
else console.log(`  ⛔ déclenchement à la course ${decl} (${L[decl-1].date}).`);

// puissance : combien de courses pour repérer la dérive si elle survient ?
const sim = [];
for (let k = 0; k < 400; k++) {
  const dec = Math.random; // rendements dégradés : on retire la dérive à chaque tirage
  const serie = Array.from({length:4000}, () => x[(Math.random()*x.length)|0] + DERIVE);
  const d = cusum(serie, h);
  if (d !== null) sim.push(d);
}
sim.sort((a,b)=>a-b);
if (sim.length) {
  const med = sim[sim.length>>1];
  console.log(`\n  SI L'ÉROSION SURVIENT (${(100*DERIVE).toFixed(0)} pt) : détectée en ${med} courses en médiane`);
  console.log(`  soit ${(med/370).toFixed(1)} an${med/370>=2?'s':''} à 370 courses par an  ` +
              `(9 fois sur 10 avant ${sim[Math.floor(0.9*sim.length)]} courses)`);
  console.log(`  Pour mémoire, la fenêtre glissante 24 mois ne la détecte jamais.`);
}
