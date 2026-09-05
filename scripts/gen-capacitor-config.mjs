/**
 * Genera capacitor.config.json desde src/theme.ts.
 *
 * No se usa capacitor.config.ts porque el cargador de TypeScript del CLI de
 * Capacitor 6 no es compatible con TypeScript 7 (usa ts.ModuleKind, que ya no
 * existe). Generando el JSON, el color del cielo sigue teniendo un único sitio
 * donde vive y el CLI no tiene que compilar nada.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKY_HEX, APP_NAME } from '../src/theme.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const config = {
  appId: 'cl.nmunoz.cubitos',
  appName: APP_NAME,
  webDir: 'dist',
  // Sin bloque `server`: el WebView carga los archivos empaquetados. El juego
  // no toca la red, ni siquiera localhost.
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: SKY_HEX,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: SKY_HEX,
      showSpinner: false,
    },
  },
};

const out = join(ROOT, 'capacitor.config.json');
writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
console.log('capacitor.config.json generado (fondo ' + SKY_HEX + ')');
