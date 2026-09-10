import fs from 'fs'; import vm from 'vm';
const sandbox = { window:{}, document:{addEventListener(){},getElementById:()=>null},
  console:{log(){},warn(){},error(){}}, fetch:async()=>({ok:false}), setTimeout, clearTimeout };
sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/ranking-loader.js','utf8'), sandbox);
const RL = sandbox.window.rankingLoader; RL.data = {};
for (const c of ['chevaux','jockeys','entraineurs'])
  RL.data[c] = JSON.parse(fs.readFileSync(`data/${c}_ponderated_latest.json`,'utf8')).resultats;

// le nettoyage réellement appliqué par la page, pas une règle réécrite
const nomCheval = s => RL.extraireNomBaseCheval(s || '');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
// hippodromes français = ceux qui apparaissent dans l'historique PMU
const fr = new Set();
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) { if(l.trim()) fr.add(norm(JSON.parse(l).hip)); }

const seg = {};
const rate = [];
for (const f of fs.readdirSync('data/courses').filter(x=>/^2026-09-0\d/.test(x))) {
  const d = JSON.parse(fs.readFileSync('data/courses/'+f,'utf8'));
  const h = norm(d.hippodrome);
  const cle = MOI.some(m=>h.includes(m)) ? 'tes hippodromes' : fr.has(h) ? 'France (autres)' : 'étranger';
  for (const c of d.courses||[]) for (const p of c.participants||[]) {
    const s = seg[cle] = seg[cle] || {n:0, ch:0, jk:0, en:0};
    s.n++;
    for (const [cat,nom,k] of [['chevaux',nomCheval(p.cheval),'ch'],['jockeys',p.jockey,'jk'],['entraineurs',p.entraineur,'en']]) {
      if (!nom) continue;
      let r=null; try{ r=RL.trouverItemDansClassement(RL.data[cat],nom,cat); }catch(e){}
      if (r) s[k]++;
      else if (cle!=='étranger' && rate.length<4000) rate.push({cat,nom,hip:d.hippodrome});
    }
  }
}
console.log('RATTACHEMENT AU CLASSEMENT, par segment\n');
console.log('  segment            partants   cheval   jockey   entraîneur');
for (const [k,s] of Object.entries(seg))
  console.log(`  ${k.padEnd(18)} ${String(s.n).padStart(6)}   ${(100*s.ch/s.n).toFixed(1).padStart(5)} %  ${(100*s.jk/s.n).toFixed(1).padStart(5)} %  ${(100*s.en/s.n).toFixed(1).padStart(6)} %`);

console.log('\nÉCHANTILLON DE NON-MATCHS EN FRANCE (le nettoyage du libellé est-il en cause ?)');
for (const cat of ['chevaux','jockeys','entraineurs']) {
  const ex = rate.filter(r=>r.cat===cat).slice(0,6);
  console.log(`  ${cat} :`);
  ex.forEach(r=>console.log(`     « ${r.nom} »  (${r.hip})`));
}
console.log('\nÀ QUOI RESSEMBLENT LES CLÉS DU CLASSEMENT');
console.log('  chevaux     :', RL.data.chevaux.slice(0,4).map(x=>x.Nom).join(' | '));
console.log('  jockeys     :', RL.data.jockeys.slice(0,4).map(x=>x.NomPostal).join(' | '));
console.log('  entraineurs :', RL.data.entraineurs.slice(0,4).map(x=>x.NomPostal).join(' | '));
