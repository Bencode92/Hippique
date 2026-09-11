/* La question : quand le gagnant N'EST PAS dans le top 2 du marché — une
 * course sur deux — qu'est-ce qui le distingue des autres outsiders ?
 *
 * Ce n'est pas « battre la cote » en général, c'est autre chose : à l'intérieur
 * du sous-univers des chevaux hors top 2, un levier sépare-t-il les gagnants ?
 * Si oui, il y a un edge exploitable là où le marché est le moins précis.
 *
 * POINT-IN-TIME RÉEL : les classements viennent de data/rankings/, dix
 * snapshots datés. Pour une course donnée on prend le snapshot le plus récent
 * ANTÉRIEUR à sa date — jamais celui d'après.
 *
 * PROTOCOLE, écrit avant de regarder :
 *   univers  : plat FR, 5 partants et plus, courses courues, avril→sept 2026
 *   cible    : les partants classés 3e ou au-delà par la cote
 *   train    : avril → juin        test : juillet → septembre
 *   critère  : taux de victoire du décile haut d'un levier, contre la moyenne
 *              du sous-univers, mesuré sur le TEST
 *   verdict  : capte si l'écart dépasse 2 erreurs-types
 *
 *     node bench/outsiders_gagnants.mjs
 */
import fs from 'fs';

const num = v => { const x = parseFloat(String(v ?? '').replace(/\s/g,'').replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : null; };
const clean = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const nomCheval = s => clean(String(s||'').replace(/\s+[HFM]\.\s*(?:AQPS|PU|PS|TR|AR|AN)\s*\.?.*$/i,'').replace(/\s+\d+\s*a\.?.*$/i,''));

// ── snapshots datés ─────────────────────────────────────────────────────
const lireCsv = f => {
  if (!fs.existsSync(f)) return [];
  const [tete, ...lignes] = fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim());
  const cols = tete.split('\t');
  return lignes.map(l => { const v = l.split('\t'); const o = {}; cols.forEach((c, i) => o[c] = v[i]); return o; });
};
const SNAPS = fs.readdirSync('data/rankings').filter(x => /^\d{4}-\d{2}-\d{2}_/.test(x)).sort()
  .map(d => ({ date: d.slice(0, 10), dir: 'data/rankings/' + d }));
const cache = new Map();
const snapPour = date => {
  let choisi = null;
  for (const s of SNAPS) if (s.date <= date) choisi = s;   // le plus récent AVANT
  if (!choisi) return null;
  if (cache.has(choisi.dir)) return cache.get(choisi.dir);
  const idx = { ch: new Map(), jk: new Map(), en: new Map() };
  for (const r of lireCsv(choisi.dir + '/chevaux.csv')) {
    const n = nomCheval(r['Cheval']); if (!n) continue;
    const co = num(r['Courses']) || 0;
    idx.ch.set(n, { val: num(r['Valeur']) || 0, gm: num(r['Gain moyen']) || 0,
                    tv: co >= 2 ? (num(r['Victoires']) || 0) / co : null, co });
  }
  for (const [f, k] of [['jockeys.csv','jk'], ['entraineurs.csv','en']])
    for (const r of lireCsv(choisi.dir + '/' + f)) {
      const n = clean(r['Nom']); if (!n) continue;
      const pa = num(r['Partants']) || 0;
      idx[k].set(n, { tv: pa >= 20 ? (num(r['Victoires']) || 0) / pa : null,
                      tp: pa >= 20 ? (num(r['Places']) || 0) / pa : null,
                      gp: num(r['Gain/Part.']) || 0, pa });
    }
  cache.set(choisi.dir, idx);
  return idx;
};

// ── partants hors top 2 du marché ───────────────────────────────────────
const posMus = m => { const v = String(m || '').match(/\d+/g); return v ? v.map(Number).filter(x => x > 0 && x < 25) : null; };
const moy = a => a.reduce((s, x) => s + x, 0) / a.length;
const L = [];
for (const f of fs.readdirSync('data/courses').filter(x => /^2026-\d\d-\d\d_/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync('data/courses/' + f, 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat') continue;
  const date = f.slice(0, 10);
  const S = snapPour(date); if (!S) continue;
  for (const c of d.courses || []) {
    const ps = (c.participants || []).filter(p => (num(p.cote) || 0) > 1);
    if (ps.length < 5 || !ps.some(p => parseInt(p.arrivee) === 1)) continue;
    const ordre = ps.map((_, i) => i).sort((a, b) => num(ps[a].cote) - num(ps[b].cote));
    const dist = num(c.distance) || 0;
    ordre.forEach((idx, rang) => {
      if (rang < 2) return;                     // on ne garde QUE les hors top 2
      const p = ps[idx];
      const ch = S.ch.get(nomCheval(p.cheval)) || {};
      const jk = S.jk.get(clean(p.jockey)) || {};
      const en = S.en.get(clean(p.entraineur)) || {};
      const cote = num(p.cote), cr = num(p.cote_reference);
      const mus = posMus(p.musique);
      L.push({
        date, dist, np: ps.length, rang, cote, gagne: parseInt(p.arrivee) === 1,
        lev: {
          'cote':          -cote,
          'dérive':        cr > 1 ? (cr - cote) / cr : 0,
          'valeur FG':     ch.val || 0,
          'gain moyen ch': ch.gm || 0,
          'tauxV cheval':  ch.tv,
          'tauxV jockey':  jk.tv,
          'tauxP jockey':  jk.tp,
          'gain/part jk':  jk.gp || 0,
          'tauxV entraîn': en.tv,
          'gain/part ent': en.gp || 0,
          'musique':       mus ? -moy(mus) : null,
          'forme récente': mus ? -moy(mus.slice(0, 3)) : null,
          'poids':         num(p.poids),
          'nb victoires':  num(p.nb_victoires) || 0,
        },
      });
    });
  }
}

const tr = L.filter(x => x.date < '2026-07-01'), te = L.filter(x => x.date >= '2026-07-01');
const base = a => a.filter(x => x.gagne).length / a.length;
console.log(`${L.length} partants hors top 2 du marché · train ${tr.length} · test ${te.length}`);
console.log(`taux de victoire du sous-univers : train ${(100*base(tr)).toFixed(2)} % · test ${(100*base(te)).toFixed(2)} %\n`);

const NOMS = Object.keys(L[0].lev);
console.log('DÉCILE HAUT DE CHAQUE LEVIER — taux de victoire, hors top 2 du marché\n');
console.log('  levier            train (décile haut)   test (décile haut)    base test    écart test');
const res = [];
for (const n of NOMS) {
  const avec = a => a.filter(x => x.lev[n] !== null && x.lev[n] !== undefined);
  const dec = a => { const s = avec(a).slice().sort((x, y) => y.lev[n] - x.lev[n]); return s.slice(0, Math.max(1, Math.floor(s.length / 10))); };
  const dtr = dec(tr), dte = dec(te);
  if (dte.length < 150) { console.log(`  ${n.padEnd(17)}— trop peu`); continue; }
  const b = base(avec(te)), v = base(dte);
  const se = Math.sqrt(v * (1 - v) / dte.length);
  const ec = 100 * (v - b);
  res.push({ n, ec, se: 100 * se, v, b, ntest: dte.length, dte });
  console.log(`  ${n.padEnd(17)}${(100*base(dtr)).toFixed(2).padStart(8)} %           ${(100*v).toFixed(2).padStart(8)} %        ${(100*b).toFixed(2)} %     ${(ec>=0?'+':'')}${ec.toFixed(2)} ± ${(100*se).toFixed(2)}` +
    (Math.abs(ec) > 2 * 100 * se ? (ec > 0 ? '  ← taux' : '  ← inverse') : ''));
}

// ── LE TEST QUI COMPTE : le ROI ────────────────────────────────────────
// Gagner plus souvent ne rapporte rien si l'on paie le privilège. Un cheval
// qui derive voit sa cote BAISSER : il gagne plus souvent ET paie moins. Seul
// le ROI tranche.
const roi = a => {
  if (!a.length) return null;
  const g = a.map(x => x.gagne ? Math.max(1.10, x.cote) : 0);
  const m = g.reduce((s, x) => s + x, 0) / g.length;
  const se = 100 * Math.sqrt(g.reduce((s, x) => s + (x - m) ** 2, 0) / g.length / g.length);
  return { roi: 100 * (m - 1), se, n: g.length };
};
const bTe = roi(te);
console.log(`\nROI DU SOUS-UNIVERS (tous les hors top 2, mise plate) : ${bTe.roi.toFixed(1)} % ± ${bTe.se.toFixed(1)} (n=${bTe.n})`);
const bTr = roi(tr);
console.log(`ROI du sous-univers sur le TRAIN : ${bTr.roi.toFixed(1)} % ± ${bTr.se.toFixed(1)}`);
console.log('\nROI DU DÉCILE HAUT — le TRAIN doit confirmer, sinon c\'est un décile chanceux\n');
console.log('  levier            ROI train           ROI test            répliqué ?');
const declev = (a, n) => { const s = a.filter(x => x.lev[n] != null).sort((x, y) => y.lev[n] - x.lev[n]);
                           return s.slice(0, Math.max(1, Math.floor(s.length / 10))); };
const sorties = [];
for (const r of res.sort((a, b) => b.ec - a.ec)) {
  const Rtr = roi(declev(tr, r.n)), Rte = roi(r.dte);
  const gainTr = Rtr.roi - bTr.roi, gainTe = Rte.roi - bTe.roi;
  const ok = gainTr > 0 && gainTe > 0 && gainTe > 1.96 * Math.sqrt(Rte.se ** 2 + bTe.se ** 2);
  sorties.push({ n: r.n, gainTr, gainTe, Rte, ok });
  console.log(`  ${r.n.padEnd(17)}${(Rtr.roi>=0?'+':'')}${Rtr.roi.toFixed(1)} % ± ${Rtr.se.toFixed(1)}`.padEnd(37) +
    `${(Rte.roi>=0?'+':'')}${Rte.roi.toFixed(1)} % ± ${Rte.se.toFixed(1)}`.padEnd(20) +
    (ok ? 'OUI — gain démontré' : gainTr > 0 && gainTe > 0 ? 'les deux positifs, écart non démontré' : 'non'));
}
console.log(`\n  Rappel : 14 leviers testés. À ce nombre d'essais, un écart à t = 2 sur un seul`);
console.log(`  d'entre eux est attendu par le hasard une fois sur deux environ.`);

// ── SEGMENTATION, sur le meilleur candidat ─────────────────────────────
// EXPLORATOIRE et rien d'autre : le levier a été choisi APRÈS avoir vu les
// résultats, et chaque segment est un test de plus. Un segment flatteur ici
// ne vaut pas preuve — il vaut hypothèse à tester sur des données futures.
const SEGS = {
  'sprint  <1400m':   x => x.dist < 1400,
  'mile 1400-1700':   x => x.dist >= 1400 && x.dist < 1700,
  'middle 1700-2200': x => x.dist >= 1700 && x.dist < 2200,
  'staying >=2200':   x => x.dist >= 2200,
  'petit champ <9':   x => x.np < 9,
  'moyen 9-13':       x => x.np >= 9 && x.np < 14,
  'grand champ >=14': x => x.np >= 14,
  'rang marché 3-4':  x => x.rang <= 3,
  'rang marché 5+':   x => x.rang >= 4,
};
console.log('\nSEGMENTATION DU DÉCILE DE DÉRIVE — exploratoire\n');
console.log('  segment              base train    décile train     base test     décile test');
for (const [nom, f] of Object.entries(SEGS)) {
  const str = tr.filter(f), ste = te.filter(f);
  if (ste.length < 400) { console.log(`  ${nom.padEnd(20)}— trop peu (${ste.length})`); continue; }
  const dtr = declev(str, 'dérive'), dte2 = declev(ste, 'dérive');
  const b1 = roi(str), d1 = roi(dtr), b2 = roi(ste), d2 = roi(dte2);
  if (!d2 || d2.n < 60) { console.log(`  ${nom.padEnd(20)}— décile trop mince`); continue; }
  const fmt = r => `${(r.roi>=0?'+':'')}${r.roi.toFixed(1)}`;
  console.log(`  ${nom.padEnd(20)}${fmt(b1).padStart(7)} %   ${fmt(d1).padStart(7)} % ±${d1.se.toFixed(0)}` +
    `   ${fmt(b2).padStart(8)} %   ${fmt(d2).padStart(7)} % ±${d2.se.toFixed(0)}  (n=${d2.n})` +
    (d1.roi > b1.roi && d2.roi > b2.roi ? '  ↑ les deux' : ''));
}
