/* Test sequentiel (SPRT de Wald) sur la regle, au lieu d'une fenetre fixe.
 *
 * Recommandation de la revue du 11/09/2026 : une fenetre de douze mois donne
 * ±20 points pour un effet suppose de +7 %. Elle ne tranchera jamais. Le test
 * sequentiel, lui, s'arrete des que l'accumulation penche assez d'un cote.
 *
 *   H0 : la regle ne vaut pas mieux que la pratique parente, -3,7 % par pari
 *   H1 : la regle vaut son esperance de travail, +7 % par pari
 *   erreurs : alpha = beta = 0,05  →  bornes log a = ln(0,95/0,05) = +2,94
 *                                             log b = ln(0,05/0,95) = -2,94
 *
 * A chaque pari on ajoute le log du rapport de vraisemblance. Le gain d'un
 * pari vaut 0 (perdu) ou la cote (gagne) ; sous chaque hypothese la
 * probabilite de gain se deduit de l'esperance visee et de la cote.
 *
 * ATTENTION : rejoué sur l'historique, ce test n'est PAS valide — c'est cet
 * historique qui a servi a choisir la regle, donc la statistique y penche
 * forcement du bon cote. Le seul test qui compte demarre a zero sur les paris
 * a venir. D'ou la date de depart, fixee au 1er octobre 2026.
 *
 *     node bench/sprt_regle.mjs              test prospectif (defaut)
 *     node bench/sprt_regle.mjs --historique rejoue le passe, pour reference
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','SAINTCLOUD'];
const E0 = -0.037, E1 = 0.07;
const BORNE = Math.log(0.95 / 0.05);

const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue; const d = JSON.parse(l);
    const sg = d.paris && d.paris.E_SIMPLE_GAGNANT;
    if (sg && sg.length) rap.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, sg);
  }
const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue; const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const h = norm(d.hip); if (!MOI.some(x=>h.includes(x))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 14 || !ps.some(p=>p.a===1)) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    // La condition « cote >= 4 » a ete RETIREE de la regle jouee sur
    // recommandation de la revue : elle a ete trouvee apres coup, elle inverse
    // le biais favori/outsider national (-17,8 % sur ce segment) et elle
    // n'ajoute que de la variance. Elle reste OBSERVEE ci-dessous : si elle
    // est reelle, elle apparaitra ; sinon elle n'aura rien coute.
    const sg = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!sg) continue;
    const m = sg.find(x=>String(x.comb) === String(fav.n));
    L.push({ date: d.date, cote: fav.c, gagne: !!(m && m.div > 0) });
  }
L.sort((a,b)=>a.date.localeCompare(b.date));
const DEBUT = '2026-10-01';
const prospectif = !process.argv.includes('--historique');
const jeu = prospectif ? L.filter(x => x.date >= DEBUT) : L;

// p sous chaque hypothese, pour une cote donnee : E = p*cote - 1
const pSous = (E, cote) => Math.min(0.99, Math.max(0.01, (1 + E) / cote));
let S = 0, verdict = null, iFin = null;
const trace = [];
jeu.forEach((x, i) => {
  if (verdict) return;
  const p0 = pSous(E0, x.cote), p1 = pSous(E1, x.cote);
  S += x.gagne ? Math.log(p1 / p0) : Math.log((1 - p1) / (1 - p0));
  if (i % 50 === 49 || i === jeu.length - 1) trace.push({ i: i + 1, date: x.date, S });
  if (S >= BORNE)  { verdict = 'H1 — la règle vaut son espérance'; iFin = i + 1; }
  if (S <= -BORNE) { verdict = 'H0 — pas mieux que la pratique parente'; iFin = i + 1; }
});

console.log('TEST SÉQUENTIEL SUR LA RÈGLE — 14+ partants, favori ≥ 4, tes hippodromes\n');
console.log(`  H0 = ${(100*E0).toFixed(1)} % par pari   ·   H1 = ${(100*E1).toFixed(0)} %   ·   bornes ±${BORNE.toFixed(2)}`);
if (prospectif) {
  console.log(`  MODE PROSPECTIF — départ le ${DEBUT}, statistique remise à zéro.`);
  console.log(`  (l'historique 2022-2026 donne +1,99, mais c'est lui qui a servi à choisir`);
  console.log(`   la règle : il ne compte pas. node bench/sprt_regle.mjs --historique pour le voir.)\n`);
  if (!jeu.length) {
    console.log(`  Aucun pari enregistré depuis le ${DEBUT}. Le test commencera à la première`);
    console.log(`  course à 14 partants ou plus sur tes hippodromes — environ 165 par an.`);
    console.log(`  L'effet visé étant de +7 %, il faudra de l'ordre de 1 000 paris pour`);
    console.log(`  conclure : c'est le prix d'une règle plus large mais moins tranchée.`);
    ecrire(0, 0, null);
    process.exit(0);
  }
} else {
  console.log(`  MODE HISTORIQUE — NON VALIDE comme test, donné pour référence.`);
}
console.log(`  ${jeu.length} paris, du ${jeu[0].date} au ${jeu[jeu.length-1].date}\n`);
console.log('  après N paris   date         statistique   position');
for (const t of trace.filter((_,k)=>k % 2 === 0 || k === trace.length-1)) {
  const pct = Math.max(-1, Math.min(1, t.S / BORNE));
  const barre = '─'.repeat(12 + Math.round(pct * 12));
  console.log(`  ${String(t.i).padStart(11)}   ${t.date}   ${t.S >= 0 ? '+' : ''}${t.S.toFixed(2).padStart(6)}      ${barre}`);
}
console.log();
if (verdict) console.log(`  VERDICT après ${iFin} paris : ${verdict}`);
else {
  const reste = BORNE - S, versH0 = -BORNE - S;
  console.log(`  PAS DE VERDICT. Statistique à ${S >= 0 ? '+' : ''}${S.toFixed(2)} sur une borne de ±${BORNE.toFixed(2)}.`);
  console.log(`  Il manque ${reste.toFixed(2)} pour conclure en faveur de la règle,`);
  console.log(`  ${Math.abs(versH0).toFixed(2)} pour conclure contre.`);
  // vitesse d'accumulation observee
  const parPari = S / jeu.length;
  if (parPari > 0.001) console.log(`\n  Au rythme observé (${parPari.toFixed(4)} par pari), il faudrait encore ~${Math.ceil(reste/parPari)} paris,`
    + ` soit ${(Math.ceil(reste/parPari)/116).toFixed(1)} an(s).`);
  else console.log(`\n  Au rythme observé, la statistique n'avance pas : l'historique ne permet pas de conclure.`);
}
// sous-hypothese observee, sans effet sur la regle jouee
const sousH = (sel, lib) => {
  const a = jeu.filter(sel);
  if (a.length < 20) return console.log(`  ${lib.padEnd(26)}— ${a.length} pari(s), trop peu`);
  let s2 = 0;
  for (const x of a) {
    const p0 = pSous(E0, x.cote), p1 = pSous(E1, x.cote);
    s2 += x.gagne ? Math.log(p1 / p0) : Math.log((1 - p1) / (1 - p0));
  }
  const g = a.reduce((t,x)=>t+(x.gagne?Math.max(1.10,x.cote):0),0)/a.length;
  console.log(`  ${lib.padEnd(26)}${a.length} paris   ROI ${(100*(g-1)>=0?'+':'')}${(100*(g-1)).toFixed(1)} %   statistique ${s2>=0?'+':''}${s2.toFixed(2)}`);
};
if (jeu.length) {
  console.log('\n  SOUS-HYPOTHÈSE OBSERVÉE (retirée de la règle jouée)');
  sousH(x => x.cote >= 4, 'dont favori ≥ 4');
  sousH(x => x.cote <  4, 'dont favori < 4');
}

// état écrit pour l'affichage
function ecrire(nParis, stat, verd) {
 try {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/sprt_etat.json', JSON.stringify({
    _doc: "État du test séquentiel de la règle (14 partants et plus, tes hippodromes). "
        + "Écrit par bench/sprt_regle.mjs. H0 = -3,7 %, H1 = +7 %, bornes ±2,94.",
    maj: new Date().toISOString().slice(0, 10),
    debut: DEBUT, paris: nParis, statistique: Math.round(stat * 1000) / 1000,
    borne: Math.round(BORNE * 100) / 100, verdict: verd || null,
    esperance_travail: 0.074, intervalle: [-0.005, 0.153],
    courses_par_an: 165,
  }, null, 2));
  console.log('\n  état écrit dans data/sprt_etat.json');
 } catch (e) { console.error('  (état non écrit :', e.message, ')'); }
}
// le mode historique ne doit pas ecraser l'etat prospectif : il n'est pas un test
if (prospectif) ecrire(jeu.length, S, verdict);
else console.log('\n  (mode historique : l\'état prospectif n\'est pas modifié)');

console.log('\n  À relancer après chaque série de paris réels. Les bornes ne se déplacent pas.');
