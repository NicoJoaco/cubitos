/**
 * Prueba funcional del Service Worker generado, sin navegador.
 *
 * Ejecuta dist/sw.js dentro de un ServiceWorkerGlobalScope sintético (vm) con
 * una Cache API en memoria y un fetch que sirve desde dist/. Instala, activa,
 * CORTA LA RED y comprueba que una navegación y los assets siguen resolviendo.
 * Es la evidencia de que "abre sin red al primer intento".
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ORIGIN = 'http://localhost/';

let offline = false;
const served = new Set();

function fileFor(url) {
  const p = decodeURIComponent(new URL(url, ORIGIN).pathname).slice(1) || 'index.html';
  const f = join(DIST, p);
  return existsSync(f) ? f : null;
}
function mime(f) {
  if (f.endsWith('.js')) return 'text/javascript';
  if (f.endsWith('.html')) return 'text/html';
  if (f.endsWith('.png')) return 'image/png';
  if (f.endsWith('.webmanifest')) return 'application/manifest+json';
  return 'application/octet-stream';
}
async function netFetch(input) {
  const url = typeof input === 'string' ? input : input.url;
  if (offline) throw new TypeError('Failed to fetch (sin red): ' + url);
  const f = fileFor(url);
  served.add(new URL(url, ORIGIN).pathname);
  if (!f) return new Response('not found', { status: 404 });
  return new Response(readFileSync(f), { status: 200, headers: { 'content-type': mime(f) } });
}

// ---------------------------------------------------- Cache API en memoria
const keyOf = (r, ignoreSearch) => {
  const u = new URL(typeof r === 'string' ? r : r.url, ORIGIN);
  if (ignoreSearch) u.search = '';
  return u.href;
};
class MemCache {
  constructor() { this.map = new Map(); }
  async put(req, res) {
    // Se bufferiza para poder devolver una Response nueva en cada match.
    const buf = Buffer.from(await res.arrayBuffer());
    this.map.set(keyOf(req), { buf, status: res.status, headers: [...res.headers] });
  }
  async match(req, opts = {}) {
    let e = this.map.get(keyOf(req));
    if (!e && opts.ignoreSearch) {
      for (const [k, v] of this.map) if (keyOf(k, true) === keyOf(req, true)) { e = v; break; }
    }
    return e ? new Response(e.buf, { status: e.status, headers: e.headers }) : undefined;
  }
  async matchAll(req, opts) { const r = await this.match(req, opts); return r ? [r] : []; }
  async keys() { return [...this.map.keys()].map((u) => new Request(u)); }
  async delete(req) { return this.map.delete(keyOf(req)); }
  async add(req) { await this.put(req, await netFetch(req)); }
  async addAll(reqs) { for (const r of reqs) await this.add(r); }
}
const storage = new Map();
const caches = {
  async open(name) { if (!storage.has(name)) storage.set(name, new MemCache()); return storage.get(name); },
  async keys() { return [...storage.keys()]; },
  async delete(name) { return storage.delete(name); },
  async has(name) { return storage.has(name); },
  async match(req) { for (const c of storage.values()) { const r = await c.match(req); if (r) return r; } return undefined; },
};

// ------------------------------------------- ServiceWorkerGlobalScope falso
const listeners = new Map();
const addEventListener = (t, fn) => {
  if (!listeners.has(t)) listeners.set(t, []);
  listeners.get(t).push(fn);
};
// Workbox usa `instanceof FetchEvent` para distinguir install de fetch.
class ExtendableEvent {
  constructor(type) { this.type = type; this._waits = []; }
  waitUntil(p) { this._waits.push(p); }
}
class FetchEvent extends ExtendableEvent {}

// El Request de undici exige URL absoluta; el del navegador resuelve relativas
// contra la base. Workbox construye `new Request("index.html")`.
class SwRequest extends Request {
  constructor(input, init) {
    super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init);
  }
}

// En un SW real `self === globalThis`; el shim AMD de workbox depende de eso
// (asigna self.define y luego lo invoca como global). El sandbox debe ser su
// propio `self`.
const sandbox = {
  caches, fetch: netFetch,
  Request: SwRequest, Response, Headers, URL, URLSearchParams, Blob, AbortController,
  console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  crypto, TextEncoder, TextDecoder, structuredClone, ExtendableEvent, FetchEvent,
  location: new URL('sw.js', ORIGIN),
  registration: { scope: ORIGIN, waiting: null, active: null, installing: null },
  clients: { claim: async () => {}, matchAll: async () => [] },
  skipWaiting: async () => {},
  addEventListener,
  removeEventListener: () => {},
  __WB_DISABLE_DEV_LOGS: true,
  importScripts(...urls) {
    for (const u of urls) {
      const f = fileFor(u);
      if (!f) throw new Error('importScripts 404: ' + u);
      vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: u });
    }
  },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

// --------------------------------------------------------------- ejecución
const fail = (m) => { console.error('  [FALLA] ' + m); process.exitCode = 1; };
const ok = (m) => console.log('  [OK]   ' + m);

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error('No hay dist/sw.js. Corré `npm run build`.');
  process.exit(1);
}
vm.runInContext(readFileSync(join(DIST, 'sw.js'), 'utf8'), ctx, { filename: 'sw.js' });
await new Promise((r) => setTimeout(r, 50)); // el shim AMD resuelve en microtareas

async function dispatch(type, extra = {}) {
  const waits = [];
  const ev = { type, waitUntil: (p) => waits.push(p), ...extra };
  for (const fn of listeners.get(type) ?? []) fn(ev);
  await Promise.all(waits);
  return ev;
}

console.log('');
console.log('PRUEBA OFFLINE DEL SERVICE WORKER');
await dispatch('install');
const cacheName = (await caches.keys())[0];
const cached = cacheName ? (await (await caches.open(cacheName)).keys()).length : 0;
if (cached > 0) ok('install precacheó ' + cached + ' recursos (' + served.size + ' descargas de red)');
else fail('install no precacheó nada');

await dispatch('activate');
ok('activate sin errores');

// ------------------------------------------------------- SE CORTA LA RED
offline = true;
served.clear();

async function request(url, mode) {
  const req = new Request(new URL(url, ORIGIN).href);
  Object.defineProperty(req, 'mode', { value: mode, configurable: true });
  let responded;
  await dispatch('fetch', {
    request: req,
    respondWith: (p) => { responded = p; },
    preloadResponse: Promise.resolve(undefined),
    clientId: '',
  });
  return responded ? await responded : undefined;
}

const nav = await request('/', 'navigate');
if (nav && nav.ok) {
  const body = await nav.text();
  if (body.includes('id="boot"') && body.includes('Cubitos')) {
    ok('navegación a "/" sin red devuelve index.html desde caché');
  } else fail('la navegación devolvió algo que no es index.html');
} else fail('la navegación sin red no fue respondida por el SW');

const deep = await request('/ruta/que/no/existe', 'navigate');
if (deep && deep.ok) ok('navigateFallback cubre rutas profundas sin red');
else fail('navigateFallback no cubre rutas profundas');

const assets = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
let assetOk = 0;
for (const a of assets) {
  const r = await request('/assets/' + a, 'cors');
  if (r && r.ok) assetOk++;
}
if (assetOk === assets.length) ok(assetOk + '/' + assets.length + ' chunks JS servidos desde caché sin red');
else fail('sólo ' + assetOk + '/' + assets.length + ' chunks JS disponibles sin red');

const icon = await request('/icons/icon-192.png', 'no-cors');
if (icon && icon.ok) ok('iconos disponibles sin red'); else fail('iconos no cacheados');

const mfst = await request('/manifest.webmanifest', 'cors');
if (mfst && mfst.ok) ok('manifest.webmanifest disponible sin red'); else fail('manifest no cacheado');

if (served.size === 0) ok('CERO peticiones a la red tras el corte');
else fail('hubo ' + served.size + ' petición(es) de red: ' + [...served].join(', '));

console.log(process.exitCode ? '\nOFFLINE: FALLA\n' : '\nOFFLINE: OK - la app arranca sin red\n');
