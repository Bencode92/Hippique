/* Régénère data/ev_compositions.json depuis data/histo + data/rapports.
 *
 * L'ancien fichier n'avait ni documentation ni script de génération. Ses
 * valeurs, elles, étaient justes : la remesure les retrouve à 0,5 point près.
 *
 * Le vrai défaut était ailleurs, et il est corrigé ici. Le panneau affichait
 * des espérances de combinés mesurées TOUTES COURSES CONFONDUES, à côté d'une
 * recommandation calculée CONDITIONNELLEMENT au profil d'ouverture. Le couplé
 * des rangs 1-2 vaut -12,4 % en moyenne générale et -4,5 % en course fermée :
 * les deux chiffres sont exacts, mais juxtaposés ils se contredisent à l'écran,
 * et le simple gagnant paraissait meilleur que le couplé alors que c'est
 * l'inverse sur ce profil. On mesure donc PAR PROFIL, comme la recommandation.
 *
 * Méthode, identique à celle d'ev_profils : plat FR, 8 partants et plus,
 * Σ(1/cote) dans [1,03 ; 1,60], gain réel lu dans les rapports définitifs.
 * Une course où le pari n'est PAS proposé est exclue, jamais comptée perdante
 * — c'est cette erreur qui avait donné -48 % au 2 sur 4.
 *
 *     node bench/gen_ev_compositions.mjs
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const PROFONDEUR = 5;

const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    rap.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, d.paris || {});
  }

const div = (paris, type, nums) => {
  const l = paris[type];
  if (!l || !l.length) return null;                    // pari non proposé → exclu
  const cle = nums.slice().sort((a,b)=>a-b).join('-');
  for (const x of l)
    if (String(x.comb).split('-').map(Number).sort((a,b)=>a-b).join('-') === cle) return x.div/100;
  return 0;                                             // proposé, combinaison perdante
};

const acc = {};
const add = (fam, cle, g) => { if (g === null) return; const k = fam+'|'+cle; (acc[k] = acc[k] || []).push(g); };

let nCourses = 0;
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 8) continue;
    const ov = ps.reduce((s,p)=>s+1/p.c,0);
    if (ov < 1.03 || ov > 1.60) continue;
    const paris = rap.get(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`);
    if (!paris) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    if (tri.length < PROFONDEUR) continue;
    nCourses++;
    // même découpage que ev_profils.json : probabilité implicite du favori
    const pFav = (1/tri[0].c)/ov;
    const profil = pFav >= 0.28 ? 'fermee' : pFav >= 0.22 ? 'moyenne'
                 : pFav >= 0.16 ? 'assez_ouverte' : 'ouverte';
    const n = i => tri[i].n;
    for (const pref of ['*', profil]) {          // '*' = toutes courses, repli
      for (let i = 0; i < PROFONDEUR; i++) {
        add(pref+'/gagnant', `${i}`, div(paris,'E_SIMPLE_GAGNANT',[n(i)]));
        for (let j = i+1; j < PROFONDEUR; j++) {
          add(pref+'/couple', `${i}-${j}`, div(paris,'E_COUPLE_GAGNANT',[n(i),n(j)]));
          add(pref+'/deux_sur_quatre', `${i}-${j}`, div(paris,'E_DEUX_SUR_QUATRE',[n(i),n(j)]));
          for (let k = j+1; k < PROFONDEUR; k++)
            add(pref+'/trio', `${i}-${j}-${k}`, div(paris,'E_TRIO',[n(i),n(j),n(k)]));
        }
      }
    }
  }

const sortie = { _doc:
  "Gain moyen encaissé pour 1 € misé, par COMPOSITION de rangs du marché (0 = favori). "
+ "Mesuré sur data/histo + data/rapports par bench/gen_ev_compositions.mjs : plat FR, 8 partants "
+ "et plus, Σ(1/cote) dans [1,03 ; 1,60]. Une course où le pari n'est pas proposé est exclue, "
+ "jamais comptée perdante. Cohérent par construction avec ev_profils.json.",
  _genere_le: new Date().toISOString().slice(0,10), _courses: nCourses };
const MIN_N = 300;   // sous ce seuil, la composition retombe sur la moyenne générale
for (const pref of ['*','fermee','moyenne','assez_ouverte','ouverte']) {
  const bloc = {};
  for (const fam of ['gagnant','couple','trio','deux_sur_quatre']) {
    bloc[fam] = {};
    for (const [k, a] of Object.entries(acc).filter(([k])=>k.startsWith(pref+'/'+fam+'|'))) {
      if (pref !== '*' && a.length < MIN_N) continue;
      const m = a.reduce((s,x)=>s+x,0)/a.length;
      // Erreur-type indispensable ici : un trio peut payer 500 €, donc une
      // moyenne sur quelques milliers de courses reste très bruitée. Sans elle,
      // une composition flatteuse d'un sous-groupe passe pour un résultat.
      const se = Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length);
      bloc[fam][k.split('|')[1]] = { g: Math.round(m*1e4)/1e4, se: Math.round(se*1e4)/1e4, n: a.length };
    }
  }
  sortie[pref === '*' ? 'global' : pref] = bloc;
}

// RÉTRÉCISSEMENT VERS LE GLOBAL. Une composition n'est conservée dans son
// profil que si son écart à la moyenne générale dépasse son propre intervalle
// de confiance. Sinon elle est retirée, et le panneau retombe sur la valeur
// globale — plus robuste. Sans cette règle, un trio à +1,9 % sur un profil
// (écart +22 pt, IC ±26) passerait pour une espérance positive alors que le
// prélèvement du trio est de 31 %.
let gardees = 0, rejetees = 0;
for (const p of ['fermee','moyenne','assez_ouverte','ouverte'])
  for (const fam of ['gagnant','couple','trio','deux_sur_quatre'])
    for (const [cle, v] of Object.entries(sortie[p][fam] || {})) {
      const g = sortie.global[fam][cle];
      if (!g) { delete sortie[p][fam][cle]; rejetees++; continue; }
      const d = Math.abs(v.g - g.g), ic = 1.96 * Math.sqrt(v.se**2 + g.se**2);
      if (d > ic) gardees++; else { delete sortie[p][fam][cle]; rejetees++; }
    }
sortie._rétrécissement = `${gardees} composition(s) conservées par profil, ${rejetees} ramenées à la moyenne générale`;
fs.writeFileSync('data/ev_compositions.json', JSON.stringify(sortie, null, 2));
console.log(`${nCourses.toLocaleString('fr-FR')} courses retenues\n`);
const pc = (b, fam, cle) => b[fam] && b[fam][cle] ? `${(100*(b[fam][cle].g-1)).toFixed(1)} %` : '—';
console.log('ESPÉRANCE DU MÊME PARI, selon l\'ensemble sur lequel on la mesure\n');
console.log('  composition            global   fermée   moyenne  assez_ouv  ouverte');
for (const [fam, cle] of [['gagnant','0'],['couple','0-1'],['trio','0-1-2'],['deux_sur_quatre','0-1']])
  console.log(`  ${(fam+' '+cle).padEnd(23)}` +
    ['global','fermee','moyenne','assez_ouverte','ouverte'].map(p=>pc(sortie[p],fam,cle).padStart(8)).join(' '));
console.log('\n  C\'est l\'écart entre la 1re et la 2e colonne qui faisait paraître le');
console.log('  couplé pire que le simple sur une course fermée.');

// Une composition dont l'intervalle couvre la moyenne générale n'apprend rien
console.log('\nCOMPOSITIONS QUI SEMBLENT SORTIR DU LOT — tiennent-elles ?\n');
console.log('  profil         famille  comp      valeur          global    écart / IC');
for (const p of ['fermee','moyenne','assez_ouverte','ouverte'])
  for (const fam of ['gagnant','couple','trio','deux_sur_quatre'])
    for (const [cle, v] of Object.entries(sortie[p][fam] || {})) {
      const g = sortie.global[fam][cle]; if (!g) continue;
      const d = v.g - g.g, ic = 1.96 * Math.sqrt(v.se**2 + g.se**2);
      if (d > 0.05 && d > ic * 0.5)
        console.log(`  ${p.padEnd(15)}${fam.slice(0,7).padEnd(9)}${cle.padEnd(9)}` +
          `${(100*(v.g-1)).toFixed(1).padStart(6)} % ± ${(100*v.se).toFixed(1).padStart(4)}` +
          `${(100*(g.g-1)).toFixed(1).padStart(9)} %   +${(100*d).toFixed(1)} pt, IC ±${(100*ic).toFixed(1)}` +
          (d > ic ? '  ← tient' : '  ← dans le bruit'));
    }
