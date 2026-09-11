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
    if (fav.c < 4) continue;
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
    console.log(`  course répondant aux trois conditions. Environ 116 par an ; il en faudra`);
    console.log(`  250 à 400 pour conclure, soit deux à trois ans.`);
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
console.log('\n  À relancer après chaque série de paris réels. Les bornes ne se déplacent pas.');
