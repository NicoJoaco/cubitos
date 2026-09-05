# Cubitos

Un juego de construir con cubos para un niño de 4 años. Funciona **en modo avión**,
se instala como icono en el celular y no pide ni una sola conexión a internet
después de instalarse.

Se distribuye de dos maneras desde el mismo código:

| | Cómo llega al teléfono | Cuándo conviene |
|---|---|---|
| **PWA** | Chrome Android → "Instalar app" | Actualiza sola. La forma normal. |
| **APK** | Se descarga un archivo y se instala | Si no querés depender del navegador, o el teléfono no ofrece instalar la PWA. |

Las dos quedan como un icono en la pantalla de inicio y abren a pantalla completa,
en horizontal, sin barra de direcciones.

---

## 1. Instalar la PWA desde Chrome en Android

**La URL es:** `https://<TU-USUARIO>.github.io/<TU-REPO>/`

> Sale sola en cuanto subas el repo a GitHub: el workflow activa Pages por API
> la primera vez (`enablement: true`), así que no hay que tocar nada en Settings.
> Si la organización lo prohíbe, se activa a mano en
> **Settings → Pages → Source: GitHub Actions** y se relanza el workflow.
> La URL exacta aparece en **Settings → Pages** y al final del job *deploy*.

Con la URL en la mano, en el teléfono del niño:

1. Abrí la URL **en Chrome** (no en el navegador de Samsung ni dentro de otra app).
2. Esperá a que aparezca `¡Toca para jugar!`. Eso significa que ya se descargó todo.
3. Menú **⋮** → **Añadir a pantalla de inicio** (en algunas versiones aparece como
   **Instalar app**). Confirmá.
4. Cerrá Chrome y abrí el juego **desde el icono nuevo**. Tiene que abrirse sin
   barra de direcciones y en horizontal.
5. **Comprobá que funciona sin red**: activá el modo avión y abrí el icono otra
   vez. Debe entrar igual. Si entra, ya está: el niño puede jugar en el auto, en
   el avión o donde no haya señal.

El primer toque en la pantalla es el que activa la pantalla completa, el bloqueo
horizontal y el sonido: Android sólo concede esas tres cosas dentro de un gesto
del usuario. Por eso hay un `¡Toca para jugar!` y no se salta.

---

## 2. Instalar el APK

El APK lo construye GitHub Actions; no hace falta tener Android Studio ni el SDK.

### Descargarlo

1. En el repo, pestaña **Actions** → workflow **APK de Android** → la ejecución
   más reciente que esté en verde.
2. Abajo del todo, en **Artifacts**, descargá `cubitos-debug-apk`. Es un `.zip`.
3. Descomprimilo: adentro está `app-debug.apk`. Pasalo al teléfono (cable, correo,
   Drive, lo que sea).

> Los artifacts de GitHub caducan a los 90 días. Si querés uno permanente,
> etiquetá una versión (`git tag v1.0 && git push --tags`) y el APK queda colgado
> de la Release.

### Instalarlo

Android bloquea por defecto la instalación de apps que no vienen de Play. Hay que
permitirlo **para la app desde la que vas a abrir el APK** (normalmente Archivos o
Chrome):

1. Tocá el `app-debug.apk` en el teléfono.
2. Android va a decir algo como *"Por seguridad, tu teléfono no puede instalar
   apps desconocidas de esta fuente"*. Tocá **Configuración**.
3. Activá **Permitir desde esta fuente** (Android 8 o superior).
   Si el teléfono es más viejo: **Ajustes → Seguridad → Orígenes desconocidos**.
4. Volvé atrás y tocá **Instalar**.
5. Cuando termine, **desactivá otra vez** ese permiso. Ya no hace falta y es una
   puerta menos abierta en el teléfono de un niño.

Puede aparecer un aviso de Play Protect (*"App no segura"* o *"Enviar para
analizar"*). Es porque el APK está firmado con la **clave de depuración**, no con
una de Play. Tocá **Instalar de todos modos**. Esta firma sirve para instalar de
costado; **no** sirve para publicar en Google Play.

---

## 3. Fijar la pantalla (esto es lo que evita que el niño se salga)

El botón Atrás ya está capturado por el juego: pulsarlo abre el menú de pausa y
**nunca cierra la app**. Pero el botón de Inicio y el de apps recientes son del
sistema operativo y ningún juego puede bloquearlos. Para eso Android trae
**Fijado de pantalla**, que deja el teléfono atrapado en una sola app.

**Activarlo una vez:**

- **Ajustes → Seguridad → Avanzado → Fijado de pantalla** → activar.
  En algunos teléfonos está en **Ajustes → Seguridad y privacidad → Más ajustes**,
  o en **Ajustes → Biometría y seguridad → Otros ajustes de seguridad**.
- Activá también **Pedir PIN antes de dejar de fijar**. Sin esto, el niño puede
  soltar la pantalla por accidente.

**Fijar el juego, cada vez que se lo prestás:**

1. Abrí Cubitos.
2. Entrá a la vista de apps recientes (el botón cuadrado, o deslizar hacia arriba
   y mantener).
3. Tocá el **icono** de Cubitos arriba de su tarjeta → **Fijar**.

**Soltarlo:** mantené pulsados **Atrás + Inicio** a la vez (o deslizá hacia arriba
y mantené, según el teléfono) y poné el PIN.

Esto es del sistema operativo, no del juego: no hay forma de hacerlo desde el
código, y es la única barrera real a esta edad.

---

## 4. Problemas

### El juego quedó con una versión vieja (el Service Worker sirve caché viejo)

El Service Worker está en modo `autoUpdate`: cuando hay versión nueva se descarga
sola en segundo plano y toma el control en la siguiente apertura. O sea que
**normalmente basta con cerrar el juego del todo y volver a abrirlo dos veces**.

Si aun así sigue apareciendo lo viejo, en orden de menos a más agresivo:

1. **Cerrar de verdad.** No basta con el botón Inicio: hay que sacar la tarjeta
   de la lista de apps recientes. Con la app en segundo plano el Service Worker
   viejo puede seguir controlando la página.

2. **Recargar desde Chrome.** Abrí la URL en Chrome (no desde el icono),
   menú **⋮** → **Recargar**. Si no alcanza, mantené pulsado el botón de recargar
   y elegí **Vaciar caché y recargar de forma forzada**.

3. **Ver qué versión hay instalada.** Abrí la URL con `?debug=1` al final. Arriba
   a la izquierda aparecen los contadores del juego; si el panel no aparece, lo
   que se está ejecutando es una versión anterior a esta.

4. **Borrar sólo el Service Worker.** En Chrome Android:
   **⋮ → Configuración → Configuración de sitios → Todos los sitios** → buscá el
   sitio → **Borrar y restablecer**.
   ⚠️ **Esto borra también el mundo construido**, que vive en IndexedDB en ese
   mismo sitio. Ver más abajo cómo se pierde y cómo no.

5. **Desinstalar y reinstalar la PWA.** Mantené pulsado el icono → Desinstalar,
   y repetí la instalación. También borra el mundo.

6. **Si sos quien publica:** un despliegue con el mismo hash de archivos no
   invalida nada. Comprobá en **Actions** que el workflow terminó en verde y que
   el paso *Reporte de métricas* muestra un `index-XXXX.js` con hash distinto al
   anterior. Si el hash no cambió, no hay nada nuevo que servir.

**Con el APK esto no pasa igual:** los archivos van dentro del paquete. Para
actualizar el APK hay que instalar el APK nuevo encima (se conserva el mundo,
porque la firma de depuración es la misma).

### El juego no arranca y dice que falta WebGL2

El teléfono es demasiado viejo o su WebView está desactualizado. Actualizá
**Android System WebView** y **Chrome** desde Play. El juego necesita OpenGL ES 3.0.

### Va lento

No hay que tocar nada: el juego mide su propio frametime y baja la calidad solo.
Primero reduce la resolución de render, después la distancia de visión. Si querés
ver qué está haciendo, abrí con `?debug=1` y mirá `qualityLevel`, `renderDistance`
y `renderScale`.

Para medir de verdad en el teléfono del niño, abrí con `?bench=1`: hace un
recorrido fijo de unos 7 segundos y deja los números en pantalla (frametime medio,
p95, draw calls, memoria). Ese JSON también queda en `window.__BENCH__`; si lo
pegás en `metrics/runtime.json` del repo, aparece en el reporte de métricas.

### El niño apoya la mano y pasan cosas raras

No debería: los toques con huella ancha (`radiusX > 40 px`) se descartan, igual
que los de las franjas laterales del 8 % que caen fuera de las zonas de control.
Si aun así pasa, abrí con `?debug=1` y mirá `touchesRejected`: si sube mientras
juega, el rechazo está funcionando.

### Se perdió el mundo construido

El mundo vive en IndexedDB, dentro del sitio (PWA) o de la app (APK). Se pierde si:

- se borran los datos del sitio o se desinstala;
- el navegador está en modo incógnito (ahí no hay dónde guardar: el juego avisa
  por consola y se juega igual, pero sin guardar);
- Android libera espacio y limpia datos de apps poco usadas.

Se guarda solo cada 12 segundos, al minimizar y al abrir el menú de pausa. No hay
botón de "borrar mundo" en la interfaz **a propósito**: un niño de 4 años lo
encontraría. Para empezar de cero, borrá los datos del sitio (paso 4 de arriba).

---

## 5. Cómo se juega

- **Joystick**: aparece donde apoyes el dedo, en el tercio inferior izquierdo.
- **Mirar**: arrastrar en el resto de la pantalla.
- **Botones**, abajo a la derecha: ✕ romper, ✚ poner, ↑ saltar.
- **Paleta**, arriba: 10 cubos, se desliza de lado, un toque para elegir.
- **Atrás**: pausa (no cierra el juego).

En una computadora (para probarlo antes de instalarlo):

- **W A S D** o las flechas para caminar, **espacio** para saltar.
- **Arrastrar con el mouse** para mirar alrededor.
- **Clic izquierdo** rompe, **clic derecho** pone, apuntando con el retículo del
  centro. Los tres botones redondos también funcionan con el mouse.

Hay escalón automático: caminar contra un desnivel de un bloque lo sube solo, sin
tener que saltar. Y en el agua se flota, no se queda atrapado en el fondo.

---

## 6. Desarrollo

```bash
npm install
npm run dev          # servidor de desarrollo
npm run build        # genera iconos, comprueba tipos y compila a dist/
npm run preview      # sirve dist/ (aquí sí funciona el Service Worker)
npm test             # controles, guardado, escalador y Service Worker offline
npm run bench:cpu    # benchmark del motor de mundo, sin navegador
npm run report       # build + pruebas + benchmark + reporte de métricas
npm run cap:sync     # build + iconos nativos + sincroniza el proyecto Android
```

Parámetros de URL útiles: `?debug=1` (panel de contadores y `window.__GAME__`),
`?bench=1` (benchmark), `?seed=1234` (mundo distinto, no toca el guardado).

### Estructura

```
src/
  theme.ts             color del cielo: única fuente de verdad (HTML, manifest,
                       iconos, niebla y fondo nativo salen de aquí)
  core/    screen.ts   pantalla completa, giro, wake lock, botón Atrás, pausa
           loop.ts     bucle de render con pausa al minimizar
           perf.ts     media móvil de frametime
           quality.ts  escalador dinámico de calidad
           storage.ts  IndexedDB + compresión RLE
           session.ts  cargar y guardar la partida
  world/   noise.ts    ruido determinista, sin dependencias
           chunk.ts    voxels y generación de terreno
           mesher.ts   greedy meshing
           padding.ts  volumen con borde (lo comparten juego y benchmark)
           world.ts    carga, descarga y re-mallado de chunks
           atlas.ts    14 texturas de 16x16 generadas por código
  render/  renderer.ts WebGL2, escala de render
           materials.ts shader de voxels (sampler2DArray + niebla)
           geometryPool.ts pool de BufferGeometry con dispose explícito
  player/  player.ts   física AABB, escalón automático, flotación
           raycast.ts  DDA sobre la rejilla para romper y poner
  ui/      touch.ts    enrutador multitáctil y rechazo de palma
           controls.ts joystick, botones, paleta
           pause.ts, keyboard.ts, debug.ts
  audio/   sfx.ts      6 efectos sintetizados, cero archivos
```

### Presupuestos que CI hace cumplir

`node scripts/metrics.mjs` falla la build si se rompe alguno:

- bundle total < 1.5 MB gzip;
- ningún host externo en ningún archivo servido;
- manifest instalable: `fullscreen`, `landscape`, iconos maskable 192 y 512,
  `theme_color` = `background_color` = color del cielo;
- `viewport-fit=cover`, `user-scalable=no`, `touch-action:none`,
  `overscroll-behavior:none` en el HTML;
- Service Worker con precache sin duplicados y `navigateFallback` a `index.html`;
- re-mallado tras editar un bloque < 4 ms (p95), mallar un chunk < 4 ms (p95).

### Dos rarezas que conviene saber

- **`capacitor.config.json` se genera**, no se edita a mano
  (`npm run cap:config`). El cargador de TypeScript del CLI de Capacitor 6 no es
  compatible con TypeScript 7, así que un `capacitor.config.ts` no se puede
  leer. Generando el JSON, el color del cielo sigue viviendo en un solo sitio.
- **`@capacitor/cli@6` arrastra un `tar` con avisos de seguridad críticos.** Es
  una dependencia de *build*: no viaja ni al APK ni a la PWA. Subir a Capacitor 8
  los resolvería, pero cambia la versión de Capacitor.
