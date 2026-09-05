/**
 * Reporte de métricas de la build. Mide, no estima.
 *   node scripts/metrics.mjs [--phase N] [--json]
 * Escribe metrics/phase-N.json y lo compara con la fase anterior si existe.
 */
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const METRICS = join(ROOT, 'metrics');

const argv = process.argv.slice(2);
const phase = Number(argv[argv.indexOf('--phase') + 1] ?? NaN);
const asJson = argv.includes('--json');

if (!existsSync(DIST)) { console.error('No hay dist/. Corré `npm run build` primero.'); process.exit(1); }

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const kb = (n) => (n / 1024).toFixed(2);

// ------------------------------------------------------------------ tamaños
const files = walk(DIST).map((p) => {
  const buf = readFileSync(p);
  return {
    file: relative(DIST, p).split(sep).join('/'),
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}).sort((a, b) => b.gzip - a.gzip);

// Lo que el navegador debe bajar para jugar: todo lo precacheado.
const shipped = files.filter((f) => !/\.map$/.test(f.file));
const total = shipped.reduce((a, f) => ({
  raw: a.raw + f.raw, gzip: a.gzip + f.gzip, brotli: a.brotli + f.brotli,
}), { raw: 0, gzip: 0, brotli: 0 });

// ----------------------------------------------------------------- precache
let precache = { entries: 0, files: [] };
const swFiles = readdirSync(DIST).filter((f) => /^workbox-.*\.js$/.test(f) || f === 'sw.js');
for (const f of swFiles) {
  const src = readFileSync(join(DIST, f), 'utf8');
  const urls = [...src.matchAll(/url\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (urls.length) precache = { entries: urls.length, files: urls };
}

// ------------------------------------------------------------------ chequeos
const html = existsSync(join(DIST, 'index.html')) ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';
const mfPath = join(DIST, 'manifest.webmanifest');
const mf = existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, 'utf8')) : {};
const swSrc = existsSync(join(DIST, 'sw.js')) ? readFileSync(join(DIST, 'sw.js'), 'utf8') : '';
// ---------------------------------------------- cero red: hosts en el bundle
// Se listan TODOS los hosts que aparecen en cualquier archivo servido. Los tres
// permitidos son texto muerto (un aviso de consola de Workbox, la cita de un
// paper en un comentario de three y el namespace XML del SVG): ninguno se
// descarga. Si aparece cualquier otro, CI falla y alguien lo mira.
const HOST_ALLOWLIST = new Set(['bit.ly', 'jcgt.org', 'www.w3.org']);
const hosts = new Set();
for (const f of shipped) {
  if (!/\.(js|html|css|webmanifest)$/.test(f.file)) continue;
  const src = readFileSync(join(DIST, f.file), 'utf8');
  for (const m of src.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) hosts.add(m[1]);
}
const strangers = [...hosts].filter((h) => !HOST_ALLOWLIST.has(h) && h !== 'localhost');


const checks = [
  ['rutas relativas (base: ./)', !/(src|href)="\/(?!\/)/.test(html)],
  ['sin CDN ni dominios externos', !/https?:\/\/(?!www\.w3\.org)/.test(html)],
  ['viewport-fit=cover', /viewport-fit=cover/.test(html)],
  ['user-scalable=no', /user-scalable=no/.test(html)],
  ['touch-action:none', /touch-action:\s*none/.test(html)],
  ['overscroll-behavior:none', /overscroll-behavior:\s*none/.test(html)],
  ['manifest display=fullscreen', mf.display === 'fullscreen'],
  ['manifest orientation=landscape', mf.orientation === 'landscape'],
  ['theme_color == background_color == cielo', mf.theme_color === mf.background_color && mf.theme_color === '#7fc7ea'],
  ['icono maskable 192 y 512', (mf.icons ?? []).filter((i) => i.purpose === 'maskable').length >= 2],
  ['service worker generado', existsSync(join(DIST, 'sw.js'))],
  // El plugin compila navigateFallback a una NavigationRoute atada a index.html.
  ['navigateFallback a index.html', /NavigationRoute/.test(swSrc) && /createHandlerBoundToURL\("index\.html"\)/.test(swSrc)],
  ['sin entradas de precache duplicadas', new Set(precache.files).size === precache.files.length],
  ['presupuesto bundle < 1.5 MB gzip', total.gzip < 1.5 * 1024 * 1024],
  ['ningun host externo en TODO el bundle', strangers.length === 0, strangers.join(', ')],
];

// Presupuestos del motor, verificados con la medición fresca de bench-cpu.
const cpuChecksFor = (c) => c ? [
  ['re-mallado tras editar < 4 ms (p95)', c.editRemeshMs.p95 < 4],
  ['mallar 1 chunk < 4 ms (p95)', c.meshMsPerChunk.p95 < 4],
  ['voxels en RAM < 8 MB', c.voxelMB < 8],
  ['geometría en GPU < 8 MB', c.geometryMB < 8],
] : [];

// --------------------------------------------------------- métricas de motor
// cpu.json lo escribe scripts/bench-cpu.mjs (Node, corre en CI).
// runtime.json es opcional: se pega ahí el JSON de window.__BENCH__ medido en
// el teléfono con ?bench=1, que es el único frametime que significa algo.
const cpuPath = join(METRICS, 'cpu.json');
const cpu = existsSync(cpuPath) ? JSON.parse(readFileSync(cpuPath, 'utf8')) : null;
const runtimePath = join(METRICS, 'runtime.json');
const runtime = existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, 'utf8')) : null;

const report = { phase: Number.isFinite(phase) ? phase : null, at: new Date().toISOString(), total, files: shipped, precache: { entries: precache.entries }, checks: [...checks, ...cpuChecksFor(cpu)], cpu, runtime };

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

// ------------------------------------------------------------------ salida
const prevPath = Number.isFinite(phase) ? join(METRICS, `phase-${phase - 1}.json`) : null;
const prev = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : null;
const delta = (now, before) => before == null ? '' :
  ` (${now - before >= 0 ? '+' : ''}${kb(now - before)} KB)`;

const W = 46;
console.log('');
console.log(`REPORTE DE MÉTRICAS${Number.isFinite(phase) ? ` — FASE ${phase}` : ''}`);
console.log('='.repeat(64));
console.log('\nTAMAÑO DE ARTEFACTOS');
console.log('  ' + 'archivo'.padEnd(W) + 'raw'.padStart(9) + 'gzip'.padStart(9));
for (const f of shipped.slice(0, 14)) {
  console.log('  ' + f.file.padEnd(W) + kb(f.raw).padStart(9) + kb(f.gzip).padStart(9));
}
if (shipped.length > 14) console.log(`  … y ${shipped.length - 14} archivos más`);
console.log('  ' + '─'.repeat(W + 18));
console.log('  ' + 'TOTAL DESCARGABLE'.padEnd(W) + kb(total.raw).padStart(9) + kb(total.gzip).padStart(9));
console.log(`  presupuesto: 1536.00 KB gzip → usado ${(total.gzip / (1.5 * 1024 * 1024) * 100).toFixed(1)}%${delta(total.gzip, prev?.total.gzip)}`);
console.log(`  brotli (lo que sirve GitHub Pages): ${kb(total.brotli)} KB`);

console.log(`\nSERVICE WORKER\n  entradas precacheadas: ${precache.entries}`);
console.log(`  hosts que aparecen en el bundle: ${[...hosts].join(', ') || 'ninguno'}`);

if (cpu) {
  console.log(`\nMOTOR DE MUNDO (CPU, medido en Node ${cpu.node})`);
  const t = (k, s) => console.log('  ' + k.padEnd(W) + `avg ${s.avg}  p95 ${s.p95}  max ${s.max} ms`);
  t('generar 1 chunk', cpu.generateMsPerChunk);
  t('mallar 1 chunk', cpu.meshMsPerChunk);
  t('re-mallar tras editar 1 bloque', cpu.editRemeshMs);
  const l = (k, v) => console.log('  ' + String(k).padEnd(W) + String(v));
  l(`carga completa del mundo (R=${cpu.renderDistance})`, cpu.totalLoadMs + ' ms');
  l('triángulos en el anillo visible', cpu.triangles.toLocaleString('es'));
  l('reducción por greedy meshing', (cpu.greedyReduction * 100).toFixed(1) + ' %');
  l('voxels en RAM', cpu.voxelMB + ' MB');
  l('geometría en GPU', cpu.geometryMB + ' MB');
}

if (runtime) {
  console.log('\nRUNTIME EN EL TELÉFONO (?bench=1)');
  for (const [k, v] of Object.entries(runtime)) {
    if (typeof v === 'object' && v !== null) continue;
    console.log('  ' + String(k).padEnd(W) + String(v));
  }
} else {
  console.log('\nRUNTIME EN EL TELÉFONO: sin datos.');
  console.log('  Abrí la PWA con ?bench=1 en el teléfono y pegá window.__BENCH__');
  console.log('  en metrics/runtime.json para que aparezca acá.');
}

console.log('\nCHEQUEOS');
let failed = 0;
for (const [name, ok, detail] of [...checks, ...cpuChecksFor(cpu)]) {
  if (!ok) failed++;
  console.log(`  ${ok ? '[OK]  ' : '[FALLA]'} ${name}${detail ? '  ' + detail : ''}`);
}
console.log('='.repeat(64));
console.log(failed ? `${failed} chequeo(s) fallando` : 'todos los chequeos en verde');

mkdirSync(METRICS, { recursive: true });
if (Number.isFinite(phase)) writeFileSync(join(METRICS, `phase-${phase}.json`), JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
