#!/usr/bin/env node
/** Bench du chargement d'un jour : loadCoursesForDate() — séquentiel vs pool borné.
 *  node bench/bench-courses.mjs 2026-07-12 */
const DATE = process.argv[2] || '2026-07-12';
const RAW = 'https://raw.githubusercontent.com/bencode92/Hippique/main/data/courses/';
const cb = () => `?_=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const un = async f => {
  const r = await fetch(RAW + f + cb(), { cache: 'no-store' });
  const t = await r.text(); JSON.parse(t); return t.length;
};
async function pool(files, n) {
  const q = [...files];
  // NB : accumuler dans une variable partagée via `o += await …` perd des écritures
  // (chaque worker lit o avant son await et l'écrase après). Somme par worker.
  const parts = await Promise.all(Array.from({ length: n }, async () => {
    let s = 0; while (q.length) s += await un(q.shift()); return s;
  }));
  return parts.reduce((a, b) => a + b, 0);
}
const run = async () => {
  const idx = await (await fetch(RAW + '_index.json' + cb(), { cache: 'no-store' })).json();
  const files = (idx.files || idx).map(f => f.name || f).filter(n => n.startsWith(DATE));
  console.log(`\n📅 ${DATE} — ${files.length} fichiers\n`);
  for (const [nom, n] of [['séquentiel (actuel)', 1], ['pool 3', 3], ['pool 8 (a cassé 2×)', 8]]) {
    const t0 = performance.now(); const o = await pool(files, n);
    console.log(`  ${String(Math.round(performance.now() - t0)).padStart(6)} ms   ${(o / 1048576).toFixed(2)} Mo   ${nom}`);
  }
  console.log();
};
run().catch(e => { console.error(e); process.exit(1); });
