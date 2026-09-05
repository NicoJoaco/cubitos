/**
 * Genera los iconos PWA por código. Sin descargas, sin canvas nativo, sin deps:
 * rasterizador propio + codificador PNG sobre zlib de Node.
 * Salida: public/icons/{icon,maskable}-{192,512}.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/icons');

// --- paleta (espejo de src/theme.ts; este script corre antes del bundler) ---
const SKY_HEX = '#7fc7ea'; // espejo de src/theme.ts
const SKY = [0x7f, 0xc7, 0xea];
const GRASS_TOP = [0x74, 0xd0, 0x52];
const DIRT_L = [0x8a, 0x5c, 0x35];
const DIRT_R = [0xa9, 0x74, 0x46];
const OUTLINE = [0x2c, 0x3a, 0x1e];
const GROUND = [0x4f, 0xa0, 0x3c];

// ---------------------------------------------------------------- rasterizer
function canvas(w, h) {
  return { w, h, px: new Uint8Array(w * h * 4) };
}
function fill(c, rgb, a = 255) {
  for (let i = 0; i < c.px.length; i += 4) {
    c.px[i] = rgb[0]; c.px[i + 1] = rgb[1]; c.px[i + 2] = rgb[2]; c.px[i + 3] = a;
  }
}
function rect(c, x0, y0, x1, y1, rgb) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(c.h, y1 | 0); y++) {
    for (let x = Math.max(0, x0 | 0); x < Math.min(c.w, x1 | 0); x++) {
      const i = (y * c.w + x) * 4;
      c.px[i] = rgb[0]; c.px[i + 1] = rgb[1]; c.px[i + 2] = rgb[2]; c.px[i + 3] = 255;
    }
  }
}
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Relleno de polígono con 3x3 supersampling para bordes limpios. */
function poly(c, pts, rgb) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(c.w, Math.ceil(maxX) + 1);
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(c.h, Math.ceil(maxY) + 1);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let hits = 0;
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 3; sx++)
          if (inPoly(pts, x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
      if (!hits) continue;
      const a = hits / 9;
      const i = (y * c.w + x) * 4;
      // Source-over de verdad: sobre fondo transparente (icono adaptativo de
      // Android) un blend ingenuo dejaria un halo negro en los bordes.
      const da = c.px[i + 3] / 255;
      const outA = a + da * (1 - a);
      const mix = (s, d) => (s * a + d * da * (1 - a)) / outA;
      c.px[i] = mix(rgb[0], c.px[i]);
      c.px[i + 1] = mix(rgb[1], c.px[i + 1]);
      c.px[i + 2] = mix(rgb[2], c.px[i + 2]);
      c.px[i + 3] = Math.round(outA * 255);
    }
  }
}
function scale(pts, cx, cy, k) {
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/** Cubo isométrico centrado en (cx,cy) con semi-ancho s. */
function cube(c, cx, cy, s) {
  const kx = 0.866 * s, ky = 0.5 * s;
  const top = [[cx, cy - s], [cx + kx, cy - ky], [cx, cy], [cx - kx, cy - ky]];
  const left = [[cx - kx, cy - ky], [cx, cy], [cx, cy + s], [cx - kx, cy + ky]];
  const right = [[cx + kx, cy - ky], [cx, cy], [cx, cy + s], [cx + kx, cy + ky]];
  // contorno: mismas caras infladas, dibujadas debajo
  for (const f of [top, left, right]) poly(c, scale(f, cx, cy, 1.06), OUTLINE);
  poly(c, top, GRASS_TOP);
  poly(c, left, DIRT_L);
  poly(c, right, DIRT_R);
}

/** @param maskable si true, el arte se mantiene dentro del 80% seguro. */
function draw(size, maskable) {
  const c = canvas(size, size);
  fill(c, SKY);
  rect(c, 0, size * 0.78, size, size, GROUND);
  const s = size * (maskable ? 0.19 : 0.26);
  cube(c, size / 2, size * (maskable ? 0.5 : 0.5), s);
  return c;
}

/** Box filter: se rasteriza a 512 y se reduce, así 192 hereda el antialiasing. */
function downscale(src, size) {
  const dst = canvas(size, size);
  const k = src.w / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(y * k); sy < Math.floor((y + 1) * k); sy++) {
        for (let sx = Math.floor(x * k); sx < Math.floor((x + 1) * k); sx++) {
          const i = (sy * src.w + sx) * 4;
          const sa = src.px[i + 3] / 255;
          // Se promedia en premultiplicado: si no, los pixeles transparentes
          // arrastran su color hacia el borde visible.
          r += src.px[i] * sa; g += src.px[i + 1] * sa; b += src.px[i + 2] * sa;
          a += sa; n++;
        }
      }
      const i = (y * size + x) * 4;
      const outA = a / n;
      dst.px[i] = outA > 0 ? r / a : 0;
      dst.px[i + 1] = outA > 0 ? g / a : 0;
      dst.px[i + 2] = outA > 0 ? b / a : 0;
      dst.px[i + 3] = Math.round(outA * 255);
    }
  }
  return dst;
}

// -------------------------------------------------------------- PNG encoder
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  const raw = Buffer.alloc(c.h * (c.w * 4 + 1));
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0; // filtro None
    Buffer.from(c.px.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const out = [];
for (const maskable of [false, true]) {
  const big = draw(512, maskable);
  const name = maskable ? 'maskable' : 'icon';
  for (const size of [512, 192]) {
    const img = size === 512 ? big : downscale(big, size);
    const file = `${OUT}/${name}-${size}.png`;
    const buf = png(img);
    writeFileSync(file, buf);
    out.push(`${name}-${size}.png  ${(buf.length / 1024).toFixed(1)} KB`);
  }
}
console.log('iconos generados:\n  ' + out.join('\n  '));

// -------------------------------------------------------------- Android
/**
 * Iconos del APK, con el mismo dibujo. Se llama con `--android`.
 * Los adaptativos separan fondo (color liso del cielo) y primer plano (el cubo
 * dentro de la zona segura de 72dp sobre 108dp), que es lo que exige Android
 * para poder recortarlos en circulo, cuadrado o lo que use el launcher.
 */
function drawForeground(size) {
  const c = canvas(size, size);
  // Fondo transparente: el color lo pone la capa de background del adaptativo.
  // La zona segura es el 66.6% central de los 108dp.
  cube(c, size / 2, size / 2, size * 0.20);
  return c;
}

if (process.argv.includes('--android')) {
  const RES = resolve(ROOT, 'android/app/src/main/res');
  if (!existsSync(RES)) {
    console.log('sin proyecto android/: se omiten los iconos nativos');
  } else {
    const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    const bigLauncher = draw(512, true);
    const bigForeground = drawForeground(864); // 216 * 4
    const written = [];
    for (const [dpi, k] of Object.entries(DENSITIES)) {
      const dir = resolve(RES, `mipmap-${dpi}`);
      mkdirSync(dir, { recursive: true });
      const launcher = png(downscale(bigLauncher, Math.round(48 * k)));
      writeFileSync(`${dir}/ic_launcher.png`, launcher);
      writeFileSync(`${dir}/ic_launcher_round.png`, launcher);
      const fg = png(downscale(bigForeground, Math.round(108 * k)));
      writeFileSync(`${dir}/ic_launcher_foreground.png`, fg);
      written.push(`${dpi}: ${Math.round(48 * k)}px + foreground ${Math.round(108 * k)}px`);
    }

    // Fondo del icono adaptativo y color de la pantalla de arranque: el mismo
    // cielo que el manifest y que el render, para que no haya destello blanco.
    mkdirSync(resolve(RES, 'values'), { recursive: true });
    writeFileSync(resolve(RES, 'values/ic_launcher_background.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${SKY_HEX}</color>\n</resources>\n`);
    writeFileSync(resolve(RES, 'values/colors.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- Generado por scripts/gen-icons.mjs desde src/theme.ts -->\n    <color name="sky">${SKY_HEX}</color>\n    <color name="colorPrimary">${SKY_HEX}</color>\n    <color name="colorPrimaryDark">${SKY_HEX}</color>\n    <color name="colorAccent">#4FA03C</color>\n</resources>\n`);

    // La pantalla de arranque pasa a ser un color liso: se borran los PNG que
    // genera Capacitor (11 archivos, ~200 KB) para que no queden dos recursos
    // con el mismo nombre.
    let removed = 0;
    for (const d of readdirSync(RES)) {
      if (!d.startsWith('drawable')) continue;
      const f = resolve(RES, d, 'splash.png');
      if (existsSync(f)) { rmSync(f); removed++; }
    }
    writeFileSync(resolve(RES, 'drawable/splash.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<!-- Color liso igual al cielo del juego: sin destello blanco al abrir. -->\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n    <item android:drawable="@color/sky" />\n</layer-list>\n`);

    console.log('iconos android generados:\n  ' + written.join('\n  ')
      + `\n  splash.png eliminados: ${removed} (reemplazados por un color liso)`);
  }
}
