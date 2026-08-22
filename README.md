# TIDRADIO TD-H3 Plus · Studio Commander

Aplicación web para leer, programar y manejar el walkie **TIDRADIO TD-H3 Plus**
directamente desde el navegador, por **Bluetooth LE** o por **cable USB-C**.
Sin instalar nada.

## ▶ Abrir la aplicación

### **https://mr-d0nut.github.io/Tidradio-H3plus/**

## Antes de empezar

**Navegadores compatibles.** La aplicación usa Web Bluetooth y Web Serial, que
solo existen en **Chrome y Edge** sobre **Android, Windows, macOS y Linux**.

> **En iPhone y iPad no funciona, y no va a funcionar.** iOS obliga a todos los
> navegadores a usar el motor de Safari, que no implementa ninguna de las dos
> tecnologías. No es una limitación de esta aplicación.

**Cómo conectar la radio.**

1. Enciende el Bluetooth de la radio con una **pulsación larga de MENU**.
2. **No la emparejes desde los ajustes Bluetooth del sistema operativo**: si lo
   haces puede dejar de aparecer en el selector del navegador.
3. **Cierra la app oficial de TIDRADIO.** Un equipo BLE solo admite una conexión
   a la vez; si la tiene cogida, aquí no aparecerá.

## ⚠ Haz una copia de seguridad antes de escribir

La memoria de la radio son 8 KB de EEPROM. **Un byte mal puesto puede dejar el
equipo inservible, y sin copia no hay marcha atrás.** Lee la radio y descarga el
fichero de respaldo antes de modificar nada.

Dos cautelas más que conviene conocer:

- **El mapa de memoria está verificado en firmware 1.0.45 a 1.0.50.** La radio no
  sabe decir su versión por Bluetooth, así que compruébala en su propio menú.
  Leer es inocuo en cualquier versión; escribir, no.
- **Escritura por bloques de 32 bytes.** Un canal ocupa 16, así que en cada bloque
  conviven dos: hay que leer el bloque entero, cambiar solo lo que toca y
  devolverlo completo. La aplicación ya lo hace, pero tenlo presente si tocas el
  código.

## Qué hace

- **Lectura y copia de seguridad** de los 8 KB de memoria
- **Editor de canales**: frecuencia, subtonos CTCSS y DCS, ancho de banda,
  potencia, nombre, lista de escaneo y bloqueo por canal ocupado
- **Importación desde CSV** y colecciones de canales predefinidas
- **Escritura del VFO**, para cambiar la frecuencia sintonizada desde el ordenador
- **Sondeo de comandos** del protocolo, con registro hexadecimal del diálogo
- **Flasher de firmware** por USB-C
- **Cascada SDR** y visor de planes de banda

## Protocolo

El TD-H3 Plus con firmware de fábrica expone un puente serie transparente sobre BLE:

| | |
|---|---|
| Servicio GATT | `0xFF00` |
| Notificación | `0xFF01` |
| Escritura | `0xFF02` |
| Saludo | `AT+BAUD?` · `50 56 4F 4A 48 5C 14` · `02` · `06` |
| Leer bloque | `52` + dirección de 16 bits big-endian + `20` |
| Escribir bloque | `57` + dirección + `20` + 32 bytes + suma de comprobación |
| Memoria | 8 KB · `0x0000`–`0x1FFF` |

Zonas principales: canales en `0x0010` (16 bytes cada uno), nombres en `0x0D40`
(8 bytes), marcas de canal válido en `0x1900`, lista de escaneo en `0x1920`,
VFO-A en `0x1950` y VFO-B en `0x1960`.

**Ojo:** sobre el mismo transporte BLE conviven **dos protocolos incompatibles**.
El de fábrica del Plus (8 KB, comandos `0x52`/`0x57`) y el del firmware
alternativo **nicFW**, que es para el TD-H3 *normal* y usa otros comandos.
Aplicar el segundo a un Plus corrompe su memoria.

## Desarrollo

```bash
npm install
npm run dev      # servidor local en el puerto 3000
npm run build    # compila a dist/
npm run lint     # comprobación de tipos
```

Cada envío a `main` despliega automáticamente en GitHub Pages mediante el flujo
de `.github/workflows/pages.yml`.

## Créditos

Protocolo y mapa de memoria reconstruidos a partir del trabajo de la comunidad:

- [`jamarju/tid-h3-plus-cps`](https://github.com/jamarju/tid-h3-plus-cps) — programador por Web Bluetooth para este modelo exacto (MIT)
- [`kk7ds/chirp`](https://github.com/kk7ds/chirp) — driver `tdh8.py` y mapa de memoria de la familia
- [`nicsure/TD-H3-Engineering`](https://github.com/nicsure/TD-H3-Engineering) — ingeniería inversa del firmware y del protocolo serie

## Aviso

Herramienta no oficial, sin relación con TIDRADIO. Se ofrece sin garantía de
ningún tipo: **la usas bajo tu responsabilidad**. Y recuerda que estar en la
frecuencia correcta no basta — respeta las bandas, las potencias y las
habilitaciones que exija la normativa de tu país.
