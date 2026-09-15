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
// Relevés live (data/cotes_live/<date>_<hippo>_R<r>C<c>_live.json) : la cote 2 à
// 5 minutes avant le départ. Dans un quart des courses le favori à T-2 n'est
// pas celui de la clôture ; le test prospectif doit enregistrer le cheval
// EFFECTIVEMENT misé et sa cote au moment de la mise, sinon il mesure un pari
// qui n'a pas été fait (revue du 15/09/2026). Le dividende, lui, est celui
// du cheval misé à la clôture — c'est ce que paie le guichet.
const live = new Map();
try {
  for (const f of fs.readdirSync('data/cotes_live').filter(x=>x.endsWith('_live.json'))) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})_(.+)_R(\d+)C(\d+)_live\.json$/); if (!m) continue;
    try {
      const d = JSON.parse(fs.readFileSync('data/cotes_live/'+f,'utf8'));
      const ps = (d.participants||[]).filter(p=>p.cote_live>1);
      if (ps.length < 2) continue;
      const fav = ps.reduce((a,b)=>a.cote_live<=b.cote_live?a:b);
      live.set(`${m[1]}|${norm(m[2])}|${+m[3]}|${+m[4]}`, { n: fav.numPmu, nom: fav.nom, cote: fav.cote_live, cr: fav.cote_reference, minutes: d.minutes_avant_depart, heure: d.scraped_at });
    } catch {}
  }
} catch {}

const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue; const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const h = norm(d.hip); if (!MOI.some(x=>h.includes(x))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 14 || !ps.some(p=>p.a===1)) continue;
    // Meme garde-fou que le front : un overround hors [1,03 ; 1,60] signale des
    // cotes manquantes, pas une opportunite. Sans lui, le script comptait des
    // courses a overround 0,99 — impossible en pari mutuel — que l'interface
    // refusait a juste titre. Les deux doivent designer le MEME jeu de paris,
    // sinon la statistique ne mesure pas ce qu'on joue.
    const ov = ps.reduce((t,p)=>t+1/p.c, 0);
    if (ov < 1.03 || ov > 1.60) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    // La condition « cote >= 4 » a ete RETIREE de la regle jouee sur
    // recommandation de la revue : elle a ete trouvee apres coup, elle inverse
    // le biais favori/outsider national (-17,8 % sur ce segment) et elle
    // n'ajoute que de la variance. Elle reste OBSERVEE ci-dessous : si elle
    // est reelle, elle apparaitra ; sinon elle n'aura rien coute.
    const sg = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!sg) continue;
    // le favori misé : celui du relevé T-2 s'il existe, sinon celui de la clôture (signalé)
    const lv = live.get(`${d.date}|${h}|${d.r}|${d.c}`);
    const mise = lv ? { n: lv.n, nom: lv.nom, cote: lv.cote, cr: lv.cr, source: lv.minutes == null ? 'T-? min' : `T${lv.minutes < 0 ? '+' : '-'}${Math.abs(lv.minutes)} min` }
                    : { n: fav.n, nom: fav.nom, cote: fav.c, cr: fav.cr, source: 'clôture' };
    const m = sg.find(x=>String(x.comb) === String(mise.n));
    const finalDuMise = ps.find(p=>String(p.n) === String(mise.n));
    // derive du favori misé : sa cote a-t-elle baisse depuis le matin ?
    const der = (mise.cr > 1) ? (mise.cr - mise.cote) / mise.cr : null;
    L.push({ date: d.date, hip: d.hip, r: d.r, c: d.c, n: mise.n, nom: mise.nom, cote: mise.cote, source: mise.source,
             cote_finale: finalDuMise ? finalDuMise.c : null, favori_final_identique: String(fav.n) === String(mise.n),
             der, gagne: !!(m && m.div > 0), dividende: m ? m.div : 0 });
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
    journal();
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
  // seconde sous-hypothese, observee depuis le 11/09/2026 : sur avril-septembre
  // 2026, le favori dont la cote a BAISSE depuis le matin rendait +16,4 % contre
  // -31,4 % pour celui qui a monte. Ecart de 48 points, mais t = 1,18 sur
  // 95 courses et six filtres essayes : rien a en tirer aujourd'hui.
  sousH(x => x.der !== null && x.der >  0, 'dont favori qui a baissé');
  sousH(x => x.der !== null && x.der <= 0, 'dont favori qui a monté');
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
// journal des paris prospectifs : un enregistrement par pari réel, avec le cheval
// misé, sa cote au moment de la mise, la source du relevé, le dividende et la
// statistique cumulée. C'est ce journal que le verdict engage.
function journal() {
  let Sj = 0;
  const lignes = jeu.map(x => {
    const p0 = pSous(E0, x.cote), p1 = pSous(E1, x.cote);
    Sj += x.gagne ? Math.log(p1 / p0) : Math.log((1 - p1) / (1 - p0));
    return { date: x.date, hippodrome: x.hip, R: x.r, C: x.c, cheval: x.nom, numero: x.n, cote_misee: x.cote, releve: x.source,
             cote_finale: x.cote_finale, favori_final_identique: x.favori_final_identique, derive: x.der === null ? null : Math.round(x.der * 1000) / 1000,
             gagne: x.gagne, dividende: x.dividende, gain_20e: Math.round((x.gagne ? x.dividende * 20 - 20 : -20) * 100) / 100, S: Math.round(Sj * 1000) / 1000 };
  });
  fs.writeFileSync('data/sprt_journal.json', JSON.stringify({
    _doc: "Journal des paris réels du test séquentiel. cote_misee = cote du favori au relevé T-2 (releve = 'T-n min') ou, à défaut, à la clôture (releve = 'clôture', à éviter : le test doit mesurer le pari fait). Écrit par bench/sprt_regle.mjs.",
    debut: DEBUT, paris: lignes.length, sans_releve_live: lignes.filter(l => l.releve === 'clôture').length, favori_change_avant_cloture: lignes.filter(l => l.favori_final_identique === false).length,
    lignes }, null, 2));
  console.log(`  journal écrit dans data/sprt_journal.json (${lignes.length} paris, ${lignes.filter(l => l.releve === 'clôture').length} sans relevé live)`);
}
if (prospectif) { ecrire(jeu.length, S, verdict); journal(); }
else console.log('\n  (mode historique : l\'état prospectif n\'est pas modifié)');

console.log('\n  À relancer après chaque série de paris réels. Les bornes ne se déplacent pas.');
