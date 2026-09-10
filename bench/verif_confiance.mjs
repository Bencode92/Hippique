/* Décompose l'indice de confiance affiché dans le tableau des partants.
 * Formule servie (ranking-loader.js:2845) :
 *   (cheval trouvé + jockey trouvé + cote>1 + musique>3 + valeur>0) / 5
 * Dire lequel des cinq manque quand l'indice tombe à 80 % ou 60 %. */
import fs from 'fs'; import vm from 'vm';
const sb = { window:{}, document:{addEventListener(){},getElementById:()=>null},
  console:{log(){},warn(){},error(){}}, fetch:async()=>({ok:false}), setTimeout, clearTimeout };
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync('js/ranking-loader.js','utf8'), sb);
const RL = sb.window.rankingLoader; RL.data = {};
for (const c of ['chevaux','jockeys','entraineurs'])
  RL.data[c] = JSON.parse(fs.readFileSync(`data/${c}_ponderated_latest.json`,'utf8')).resultats;

// le nettoyage réellement appliqué par la page, pas une règle réécrite
const nomCheval = s => RL.extraireNomBaseCheval(s || '');
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];

const dist = {}, manque = { cheval:0, jockey:0, cote:0, musique:0, valeur:0 };
let n = 0;
for (const f of fs.readdirSync('data/courses').filter(x=>/^2026-0[6-9]/.test(x))) {
  const d = JSON.parse(fs.readFileSync('data/courses/'+f,'utf8'));
  if (!MOI.some(m=>norm(d.hippodrome).includes(m))) continue;
  for (const c of d.courses||[]) for (const p of c.participants||[]) {
    const trouve = (cat,nom)=>{ if(!nom) return false; try{ return !!RL.trouverItemDansClassement(RL.data[cat],nom,cat);}catch(e){return false;} };
    const ok = {
      cheval : trouve('chevaux', nomCheval(p.cheval)),
      jockey : trouve('jockeys', p.jockey),
      cote   : parseFloat(p.cote) > 1,
      musique: (p.musique||'').length > 3,
      valeur : parseFloat(p.valeur) > 0,
    };
    n++;
    const k = Object.values(ok).filter(Boolean).length;
    dist[k] = (dist[k]||0)+1;
    for (const [c2,v] of Object.entries(ok)) if(!v) manque[c2]++;
  }
}
console.log(`${n} partants à Longchamp et Saint-Cloud (juin → septembre 2026)\n`);
console.log("INDICE DE CONFIANCE AFFICHÉ");
for (const k of [5,4,3,2,1,0]) if (dist[k])
  console.log(`  ${20*k} %  ${String(dist[k]).padStart(4)} partants  (${(100*dist[k]/n).toFixed(1)} %)`);
console.log("\nCE QUI MANQUE, composante par composante");
for (const [c,v] of Object.entries(manque))
  console.log(`  ${c.padEnd(8)} absent sur ${String(v).padStart(4)} partants  (${(100*v/n).toFixed(1)} %)`);
