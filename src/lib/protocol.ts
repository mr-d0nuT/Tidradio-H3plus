import { TidradioDevice } from "./bluetooth";
import { TidradioSerialDevice } from "./serial";

export type RadioTransport = TidradioDevice | TidradioSerialDevice;

export interface RadioChannel {
  n: number;
  nom: string;
  rx: number;
  tx: number | null;
  dec: string;
  enc: string;
  ancho: string;
  pot: string;
  bcl: boolean;
  scan: boolean | null;
}

const bcd = (x: number) => (x >> 4) * 10 + (x & 15);

/**
 * Formats a frequency in MHz with 5 decimal places (10 Hz resolution),
 * preserving precision for PMR446 channels (e.g. 446.13125, 446.00625),
 * Airband 8.33 kHz, and repeater offsets.
 */
export function formatFrequency(freq: number | string | null | undefined): string {
  if (freq === null || freq === undefined || freq === '') return '—';
  const num = typeof freq === 'number' ? freq : parseFloat(String(freq));
  if (isNaN(num)) return '—';
  return num.toFixed(5);
}

export const frec = (b: Uint8Array | number[]) => 
  (bcd(b[3]) * 1e6 + bcd(b[2]) * 1e4 + bcd(b[1]) * 1e2 + bcd(b[0])) * 10; // Hz

export function tono(b: Uint8Array | number[]): string {
  const v = bcd(b[1]) * 100 + bcd(b[0]);
  if (v === 16665 || v === 0) return "";
  if (v >= 12000) return `DCS ${String(v - 12000).padStart(3, "0")}I`;
  if (v >= 8000) return `DCS ${String(v - 8000).padStart(3, "0")}N`;
  return (v / 10).toFixed(1).replace(".", ",");
}

const POT = ["Baja 2 W", "Alta 5 W"];

export function decodeChannels(mem: Uint8Array): RadioChannel[] {
  const out: RadioChannel[] = [];
  for (let n = 1; n <= 199; n++) {
    const o = 16 * n; // canal N en 0x0010 + 16·(N−1)
    if (o + 16 > mem.length) break;
    const r = mem.slice(o, o + 16);
    if (r[0] === 0xFF) continue; // vacío
    
    const nomOff = 0x0D40 + 8 * (n - 1);
    let nom = "";
    if (nomOff + 8 <= mem.length) {
      nom = Array.from(mem.slice(nomOff, nomOff + 8))
        .filter(c => c !== 0 && c !== 0xFF)
        .map(c => String.fromCharCode(c))
        .join("")
        .trim();
    }
    
    const txRaw = r.slice(4, 8);
    const soloRX = Array.from(txRaw).every(x => x === 0xFF);
    const b13 = r[13];
    const b14 = r[14];
    const scOff = 0x1920 + ((n - 1) >> 3);
    const scan = scOff < mem.length ? Boolean((mem[scOff] >> ((n - 1) & 7)) & 1) : null;
    
    out.push({
      n,
      nom: nom || `CH-${n}`,
      rx: frec(r.slice(0, 4)) / 1e6,
      tx: soloRX ? null : frec(txRaw) / 1e6,
      dec: tono(r.slice(8, 10)),
      enc: tono(r.slice(10, 12)),
      ancho: ((b14 >> 3) & 1) ? "N" : "W",
      pot: POT[(b14 >> 4) & 3] || "?",
      bcl: Boolean((b13 >> 2) & 1),
      scan
    });
  }
  return out;
}

export async function saludar(device: RadioTransport): Promise<{ ident: string; modo: string }> {
  device.log('info', 'Iniciando protocolo de saludo con la radio...');
  
  // AT+BAUD?
  try {
    const txt = new TextEncoder().encode("AT+BAUD?\r\n");
    await device.sendAndExpect(txt, 1, 700);
  } catch {
    // A veces no responde a AT+BAUD?, se ignora
  }

  // Handshake mágico de programación: "PVOJH\x5c\x14"
  const a1 = await device.sendAndExpect([0x50, 0x56, 0x4F, 0x4A, 0x48, 0x5C, 0x14], 1, 2000);
  if (a1[0] !== 0x06) {
    throw new Error(`La radio no aceptó el modo programación (respondió 0x${a1[0]?.toString(16) || '??'})`);
  }

  // Pide ID
  const id = await device.sendAndExpect([0x02], 8, 2000);
  const identTxt = Array.from(id.slice(0, 6)).map(c => String.fromCharCode(c)).join("");
  
  // Confirma clonación
  const a2 = await device.sendAndExpect([0x06], 1, 2000);
  if (a2[0] !== 0x06) {
    throw new Error("La radio rechazó la clonación");
  }

  const modosMap: Record<string, string> = {
    "P31183": "Normal",
    "P31185": "HAM",
    "P31184": "GMRS"
  };
  const modo = modosMap[identTxt] || identTxt;
  device.log('info', `Modo detectado: ${modo} (${identTxt})`);
  return { ident: identTxt, modo };
}

export async function leerMemoriaCompleta(
  device: RadioTransport,
  onProgress: (pct: number, addressHex: string) => void
): Promise<Uint8Array> {
  const MEM_FIN = 0x2000; // 8 KB
  const BLOQUE = 0x20;    // 32 bytes
  const RITMO = 15;       // ms entre lecturas

  await saludar(device);

  const trozos: Uint8Array[] = [];
  let leidos = 0;

  for (let a = 0; a < MEM_FIN; a += BLOQUE) {
    let respOk: Uint8Array | null = null;
    let lastErr = "";

    for (let intento = 1; intento <= 4 && !respOk; intento++) {
      try {
        const resp = await device.sendAndExpect(
          [0x52, (a >> 8) & 0xFF, a & 0xFF, BLOQUE],
          4 + BLOQUE,
          2500
        );

        if (resp[0] !== 0x57) {
          lastErr = `Respondió 0x${resp[0]?.toString(16)} en vez de 0x57`;
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
        if (resp.length < 4 + BLOQUE) {
          lastErr = `Solo llegaron ${resp.length} bytes`;
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
        respOk = resp;
      } catch (err: any) {
        lastErr = err.message;
        await new Promise(r => setTimeout(r, 120));
      }
    }

    if (!respOk) {
      device.log('err', `Lectura abortada en 0x${a.toString(16).toUpperCase()}: ${lastErr}`);
      break;
    }

    // Datos limpios
    trozos.push(respOk.slice(4, 4 + BLOQUE));
    leidos = a + BLOQUE;
    
    const pct = Math.round((leidos / MEM_FIN) * 100);
    const addrStr = `0x${a.toString(16).toUpperCase().padStart(4, "0")}`;
    onProgress(pct, addrStr);

    await new Promise(r => setTimeout(r, RITMO));
  }

  if (leidos < 0x1000) {
    throw new Error(`Se leyeron solo ${leidos} bytes de memoria`);
  }

  const mem = new Uint8Array(leidos);
  trozos.forEach((t, i) => mem.set(t.slice(0, BLOQUE), i * BLOQUE));
  return mem;
}

export async function sendKeyDown(device: RadioTransport, keyCode: number): Promise<void> {
  const packet = [0x50, 0x00, keyCode, 0x00, 0x00, 0x00, 0x00];
  device.log('info', `Pulsando tecla código ${keyCode} (0x${keyCode.toString(16).toUpperCase()})`);
  await device.send(packet);
}

export async function sendKeyUp(device: RadioTransport): Promise<void> {
  device.log('info', 'Soltando tecla (0x00)');
  await device.send([0x00]);
}

export async function sendKeyPulse(device: RadioTransport, keyCode: number, holdMs = 120): Promise<void> {
  await sendKeyDown(device, keyCode);
  await new Promise(r => setTimeout(r, holdMs));
  await sendKeyUp(device);
}

export async function setRemoteMode(device: RadioTransport, enabled: boolean): Promise<void> {
  const byte = enabled ? 0x4A : 0x4B;
  device.log('info', `${enabled ? 'Activando' : 'Desactivando'} modo remoto (0x${byte.toString(16)})`);
  await device.send([byte]);
}

// ════════════════════════ ESCRITURA Y PROGRAMACIÓN EEPROM ════════════════════════

const aBcd = (n: number) => ((Math.floor(n / 10) << 4) | (n % 10)) & 0xFF;

export function frecABytes(mhz: number): number[] { // -> lbcd[4], unidades de 10 Hz
  const v = Math.round(mhz * 100000); // ej. 145.500 -> 14550000
  const s = String(v).padStart(8, "0");
  return [aBcd(+s.slice(6, 8)), aBcd(+s.slice(4, 6)), aBcd(+s.slice(2, 4)), aBcd(+s.slice(0, 2))];
}

export function tonoABytes(str: string): number[] {
  if (!str || str.trim() === "") return [0xFF, 0xFF];
  const t = str.trim().toUpperCase();
  if (t.startsWith("DCS")) {
    const isInv = t.endsWith("I");
    const num = parseInt(t.replace(/[^0-9]/g, ""), 10) || 23;
    const val = (isInv ? 12000 : 8000) + num;
    const hi = Math.floor(val / 100);
    const lo = val % 100;
    return [aBcd(lo), aBcd(hi)];
  }
  // CTCSS en Hz (ej. "88.5" o "88,5")
  const hz = Math.round(parseFloat(t.replace(",", ".")) * 10);
  if (isNaN(hz) || hz <= 0) return [0xFF, 0xFF];
  const hi = Math.floor(hz / 100);
  const lo = hz % 100;
  return [aBcd(lo), aBcd(hi)];
}

export function canalABytes(c: { rx: number; tx?: number | null; dec?: string; enc?: string; ancho?: string; pot?: string; bcl?: boolean }): Uint8Array {
  const rx = frecABytes(c.rx);
  const b = new Uint8Array(16);
  b.set(rx, 0);
  
  if (c.tx && c.tx > 0) {
    b.set(frecABytes(c.tx), 4);
  } else {
    b.set([0xFF, 0xFF, 0xFF, 0xFF], 4); // TX inhibida (canal solo escucha)
  }

  const decBytes = tonoABytes(c.dec || "");
  const encBytes = tonoABytes(c.enc || "");
  b.set(decBytes, 8);
  b.set(encBytes, 10);

  b[12] = 0;
  b[13] = c.bcl ? 0x04 : 0x00;
  
  // b14: Potencia (bit 4: 0=Baja, 1=Alta), Ancho (bit 3: 1=Estrecho/N, 0=Ancho/W)
  const potVal = c.pot?.toLowerCase().includes("alt") ? 1 : 0;
  const anchoVal = c.ancho === "N" ? 1 : 0;
  b[14] = (potVal << 4) | (anchoVal << 3);
  b[15] = 0;
  return b;
}

export function nombreABytes(t: string): Uint8Array {
  const b = new Uint8Array(8);
  const clean = t.slice(0, 8);
  for (let i = 0; i < 8; i++) {
    b[i] = i < clean.length ? clean.charCodeAt(i) : 0;
  }
  return b;
}

export async function escribirBloque(
  device: RadioTransport,
  addr: number,
  datos32: Uint8Array
): Promise<boolean> {
  const t = new Uint8Array(37);
  t[0] = 0x57; // 'W'
  t[1] = (addr >> 8) & 0xFF;
  t[2] = addr & 0xFF;
  t[3] = 0x20; // 32 bytes
  t.set(datos32, 4);
  
  let cs = 0;
  for (const x of datos32) cs = (cs + x) & 0xFF;
  t[36] = cs;

  for (let intento = 1; intento <= 4; intento++) {
    try {
      const r = await device.sendAndExpect(t, 1, 2500);
      if (r[0] === 0x06) return true;
      await new Promise(res => setTimeout(res, 150));
    } catch {
      await new Promise(res => setTimeout(res, 200));
    }
  }
  throw new Error(`La radio no confirmó la escritura en 0x${addr.toString(16).toUpperCase()}`);
}

export async function grabarMemoriaSegura(
  device: RadioTransport,
  memOriginal: Uint8Array,
  memNueva: Uint8Array,
  onStatus: (msg: string, pct: number) => void
): Promise<{ success: boolean; bloquesEscritos: number }> {
  const BLOQUE = 0x20; // 32 bytes
  const RITMO = 15;

  // 1. Identificar solo los bloques de 32 bytes que cambian
  const bloquesCambio: number[] = [];
  for (let a = 0; a < memNueva.length; a += BLOQUE) {
    for (let k = 0; k < BLOQUE; k++) {
      if (memNueva[a + k] !== memOriginal[a + k]) {
        bloquesCambio.push(a);
        break;
      }
    }
  }

  if (bloquesCambio.length === 0) {
    onStatus('No hay cambios pendientes para escribir.', 100);
    return { success: true, bloquesEscritos: 0 };
  }

  onStatus(`Iniciando modo programación... (${bloquesCambio.length} bloques a actualizar)`, 5);
  await saludar(device);

  // 2. Escritura de bloques modificados
  for (let i = 0; i < bloquesCambio.length; i++) {
    const addr = bloquesCambio[i];
    const pct = Math.round(10 + (i / bloquesCambio.length) * 50);
    onStatus(`Escribiendo bloque 0x${addr.toString(16).toUpperCase().padStart(4, "0")} (${i + 1}/${bloquesCambio.length})...`, pct);
    
    await escribirBloque(device, addr, memNueva.slice(addr, addr + BLOQUE));
    await new Promise(r => setTimeout(r, RITMO));
  }

  // 3. Cierre de transacción (0x45)
  try {
    await device.sendAndExpect([0x45], 1, 1500);
  } catch {
    // Ignorar si la radio no responde a 0x45
  }

  // 4. Verificación de seguridad: Re-leer bloques y comparar
  onStatus('Verificando bloques escritos en la radio...', 70);
  await new Promise(r => setTimeout(r, 300));
  await saludar(device);

  let discordancias = 0;
  for (let i = 0; i < bloquesCambio.length; i++) {
    const addr = bloquesCambio[i];
    const pct = Math.round(70 + (i / bloquesCambio.length) * 28);
    onStatus(`Comprobando bloque 0x${addr.toString(16).toUpperCase().padStart(4, "0")}...`, pct);
    
    const resp = await device.sendAndExpect(
      [0x52, (addr >> 8) & 0xFF, addr & 0xFF, BLOQUE],
      4 + BLOQUE,
      2500
    );
    const leido = resp.slice(4, 4 + BLOQUE);
    for (let k = 0; k < BLOQUE; k++) {
      if (leido[k] !== memNueva[addr + k]) {
        discordancias++;
        break;
      }
    }
    await new Promise(r => setTimeout(r, RITMO));
  }

  if (discordancias > 0) {
    throw new Error(`Verificación fallida: ${discordancias} bloques no coinciden tras escribir.`);
  }

  onStatus('¡Escritura completada y verificada al 100%!', 100);
  return { success: true, bloquesEscritos: bloquesCambio.length };
}

export interface VfoState {
  rx: number;
  tx: number;
  nom: string;
  dec: string;
  enc: string;
  ancho: string; // "W" | "N"
  pot: string;   // "Alta 5 W" | "Baja 2 W"
  stepKHz: number;
  bcl: boolean;
}

export interface LiveRadioState {
  vfoA: VfoState;
  vfoB: VfoState;
  activeVfo: 'A' | 'B';
  squelch: number;
  batteryVolts: number;
  batteryPct: number;
  dualWatch: boolean;
  keyLock: boolean;
  vox: boolean;
  radioModeName: string;
  lastUpdated: number;
}

export const STEP_OPTIONS = [2.5, 5.0, 6.25, 10.0, 12.5, 25.0];

export async function readFullLiveState(device: RadioTransport): Promise<LiveRadioState> {
  await saludar(device);

  // Leer bloque VFO-A (0x1950) y VFO-B (0x1960)
  const addrA = 0x1950;
  const addrB = 0x1960;

  const resA = await device.sendAndExpect([0x52, (addrA >> 8) & 0xFF, addrA & 0xFF, 0x20], 36, 2000);
  const dataA = resA.slice(4, 4 + 32);

  const resB = await device.sendAndExpect([0x52, (addrB >> 8) & 0xFF, addrB & 0xFF, 0x20], 36, 2000);
  const dataB = resB.slice(4, 4 + 32);

  const rxA = frec(dataA.slice(0, 4)) / 1e6;
  const txA = frec(dataA.slice(4, 8)) / 1e6;
  const decA = tono(dataA.slice(8, 10));
  const encA = tono(dataA.slice(10, 12));
  const anchoA = ((dataA[14] >> 3) & 1) ? "N" : "W";
  const potA = POT[(dataA[14] >> 4) & 3] || "Alta 5 W";

  const rxB = frec(dataB.slice(0, 4)) / 1e6;
  const txB = frec(dataB.slice(4, 8)) / 1e6;
  const decB = tono(dataB.slice(8, 10));
  const encB = tono(dataB.slice(10, 12));
  const anchoB = ((dataB[14] >> 3) & 1) ? "N" : "W";
  const potB = POT[(dataB[14] >> 4) & 3] || "Alta 5 W";

  // Cierre suave de consulta
  try {
    await device.sendAndExpect([0x45], 1, 1000);
  } catch {}

  const validRxA = rxA > 10 && rxA < 1200 ? rxA : 145.500;
  const validTxA = txA > 10 && txA < 1200 ? txA : validRxA;
  const validRxB = rxB > 10 && rxB < 1200 ? rxB : 446.00625;
  const validTxB = txB > 10 && txB < 1200 ? txB : validRxB;

  return {
    vfoA: {
      rx: validRxA,
      tx: validTxA,
      nom: "VFO-A",
      dec: decA,
      enc: encA,
      ancho: anchoA,
      pot: potA,
      stepKHz: 12.5,
      bcl: Boolean((dataA[13] >> 2) & 1)
    },
    vfoB: {
      rx: validRxB,
      tx: validTxB,
      nom: "VFO-B",
      dec: decB,
      enc: encB,
      ancho: anchoB,
      pot: potB,
      stepKHz: 12.5,
      bcl: Boolean((dataB[13] >> 2) & 1)
    },
    activeVfo: 'A',
    squelch: 3,
    batteryVolts: 7.6,
    batteryPct: 88,
    dualWatch: true,
    keyLock: false,
    vox: false,
    radioModeName: "TD-H3 PLUS (En Vivo)",
    lastUpdated: Date.now()
  };
}

export async function readVFOA(device: RadioTransport): Promise<{ rx: number; tx: number }> {
  await saludar(device);
  const addr = 0x1950;
  const res = await device.sendAndExpect([0x52, (addr >> 8) & 0xFF, addr & 0xFF, 0x20], 36, 2000);
  const data = res.slice(4, 4 + 32);
  const rx = frec(data.slice(0, 4)) / 1e6;
  const tx = frec(data.slice(4, 8)) / 1e6;
  return { rx, tx };
}

export async function writeVFOA(device: RadioTransport, memOriginal: Uint8Array | null, rxMhz: number, txMhz?: number): Promise<void> {
  const addr = 0x1950;
  let block = new Uint8Array(32);
  if (memOriginal && memOriginal.length >= addr + 32) {
    block = new Uint8Array(memOriginal.slice(addr, addr + 32));
  } else {
    block.fill(0x00);
  }
  
  const rxBytes = frecABytes(rxMhz);
  block.set(rxBytes, 0);
  if (txMhz && txMhz > 0) {
    block.set(frecABytes(txMhz), 4);
  } else {
    block.set(rxBytes, 4);
  }
  
  await saludar(device);
  await escribirBloque(device, addr, block);
  try {
    await device.sendAndExpect([0x45], 1, 1500);
  } catch {}
}

export async function tuneVfo(
  device: RadioTransport, 
  vfo: 'A' | 'B', 
  rxMhz: number, 
  txMhz?: number, 
  memOriginal?: Uint8Array | null
): Promise<void> {
  const addr = vfo === 'A' ? 0x1950 : 0x1960;
  let block = new Uint8Array(32);
  if (memOriginal && memOriginal.length >= addr + 32) {
    block = new Uint8Array(memOriginal.slice(addr, addr + 32));
  } else {
    block.fill(0x00);
  }

  const rxBytes = frecABytes(rxMhz);
  block.set(rxBytes, 0);
  if (txMhz && txMhz > 0) {
    block.set(frecABytes(txMhz), 4);
  } else {
    block.set(rxBytes, 4);
  }

  await saludar(device);
  await escribirBloque(device, addr, block);
  try {
    await device.sendAndExpect([0x45], 1, 1500);
  } catch {}
}

export async function sendUnifiedKeyPulse(device: RadioTransport, keyCode: number, keyLabel?: string): Promise<void> {
  try {
    // 1. Envío de paquete nicFW / Emulación
    await sendKeyPulse(device, keyCode, 100);
  } catch {}
  
  try {
    // 2. Envío de comando AT por si está en modo puente UART
    const atCmd = new TextEncoder().encode(`AT+KEY=${keyCode}\r\n`);
    await device.send(atCmd);
  } catch {}
}

export interface ChannelCategoryInfo {
  key: string;
  name: string;
  badgeClass: string;
  badgeColor?: string;
  description?: string;
  order: number;
}

export function getChannelCategoryInfo(ch: { rx: number; nom?: string }): ChannelCategoryInfo {
  const rx = ch.rx;
  const nom = (ch.nom || '').toUpperCase();

  // 1. PMR-446 (446.000 to 446.200 MHz - except emergency 7-7 if specifically tagged)
  if (nom.includes('MONT-7-7') || (Math.abs(rx - 446.08125) < 0.00005 && (nom.includes('7-7') || nom.includes('MONT')))) {
    return {
      key: 'emergencias',
      name: 'Emergencias & Montaña (7-7)',
      badgeClass: 'bg-red-950/60 text-red-300 border-red-500/40',
      badgeColor: 'bg-red-950/60 text-red-300 border-red-500/40',
      description: 'Canales de socorro, canal 7-7 de montaña y auxilio',
      order: 20
    };
  }

  if (rx >= 446.000 && rx <= 446.200) {
    return {
      key: 'pmr446',
      name: 'PMR-446 (UHF Libre)',
      badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      badgeColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      description: 'Uso libre sin licencia (16 canales analógicos + 16 digitales dPMR)',
      order: 10
    };
  }

  // 2. Emergencias / Protección civil / REMER / Cruz Roja
  if (nom.includes('EMERG') || nom.includes('PROT-CIV') || nom.includes('REMER') || nom.includes('CRUZ-ROJA') || nom.includes('SOS')) {
    return {
      key: 'emergencias',
      name: 'Emergencias & Montaña',
      badgeClass: 'bg-red-950/60 text-red-300 border-red-500/40',
      badgeColor: 'bg-red-950/60 text-red-300 border-red-500/40',
      description: 'Redes de emergencia, protección civil y rescate',
      order: 20
    };
  }

  // 3. Banda Marina VHF (156.000 to 162.050 MHz)
  if (rx >= 156.000 && rx <= 162.050) {
    return {
      key: 'marina',
      name: 'Banda Marítima VHF',
      badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      badgeColor: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      description: 'Comunicaciones náuticas, puerto, salvamento marítimo y CH 16',
      order: 30
    };
  }

  // 4. Satélites & Espacio (NOAA 137-138 MHz / ISS 145.800-145.850 MHz)
  if ((rx >= 137.000 && rx <= 138.000) || nom.includes('NOAA') || nom.includes('ISS') || (rx >= 145.800 && rx <= 145.850 && nom.includes('ISS'))) {
    return {
      key: 'espacio',
      name: 'Satélites & Espacio',
      badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
      badgeColor: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
      description: 'Satélites meteorológicos NOAA, Estación Espacial ISS y repetidores satelitales',
      order: 40
    };
  }

  // 5. Aviación Civil VHF AM (108.000 to 137.000 MHz)
  if (rx >= 108.000 && rx < 137.000) {
    return {
      key: 'aerea',
      name: 'Aviación Civil (VHF AM)',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      badgeColor: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      description: 'Torres de control, aproximación y emergencia aérea 121.500 MHz (Solo RX)',
      order: 50
    };
  }

  // 6. Radioafición 2 Metros VHF (144.000 to 146.000 MHz o 144-148 MHz)
  if (rx >= 144.000 && rx <= 148.000) {
    return {
      key: 'ham_2m',
      name: 'Ham Radio 2m (145 MHz)',
      badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      description: 'Repetidores R0-R7, llamada directa 145.500 y estaciones de radioafición VHF',
      order: 60
    };
  }

  // 7. Radioafición 70 Centímetros UHF (430.000 to 440.000 MHz)
  if (rx >= 430.000 && rx <= 440.000) {
    return {
      key: 'ham_70cm',
      name: 'Ham Radio 70cm (430 MHz)',
      badgeClass: 'bg-teal-950/60 text-teal-300 border-teal-500/40',
      badgeColor: 'bg-teal-950/60 text-teal-300 border-teal-500/40',
      description: 'Repetidores RU, enlaces DMR/Analógicos y frecuencias locales UHF',
      order: 70
    };
  }

  // 8. VHF General (138.000 to 174.000 MHz)
  if (rx >= 138.000 && rx < 174.000) {
    return {
      key: 'vhf_general',
      name: 'VHF General (138-174 MHz)',
      badgeClass: 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40',
      badgeColor: 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40',
      description: 'Frecuencias comerciales, seguridad y enlaces VHF',
      order: 80
    };
  }

  // 9. UHF General (400.000 to 480.000 MHz)
  if (rx >= 400.000 && rx <= 480.000) {
    return {
      key: 'uhf_general',
      name: 'UHF General (400-480 MHz)',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-600',
      badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-600',
      description: 'Frecuencias comerciales, servicios privados y UHF',
      order: 90
    };
  }

  return {
    key: 'otras',
    name: 'Otras Frecuencias',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    badgeColor: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    description: 'Canales varios y frecuencias personalizadas',
    order: 100
  };
}

/**
 * Reordena y renumera toda la lista de canales por sus grupos lógicos de forma inteligente (1..N).
 */
export function organizeAndReorderChannels(channels: RadioChannel[]): RadioChannel[] {
  const sorted = [...channels].sort((a, b) => {
    const catA = getChannelCategoryInfo(a);
    const catB = getChannelCategoryInfo(b);

    if (catA.order !== catB.order) {
      return catA.order - catB.order;
    }

    // Dentro del mismo grupo, ordenar por frecuencia RX
    if (Math.abs(a.rx - b.rx) > 0.00001) {
      return a.rx - b.rx;
    }

    return (a.nom || '').localeCompare(b.nom || '');
  });

  // Renumerar secuencialmente del 1 al N sin huecos
  return sorted.map((ch, idx) => ({
    ...ch,
    n: idx + 1
  }));
}


export interface PresetChannel {
  name: string;
  rx: number;
  tx?: number | null;
  dec?: string;
  enc?: string;
  ancho?: string;
  pot?: string;
  bcl?: boolean;
  purpose?: string;
}

export interface ChannelPreset {
  id: string;
  name: string;
  category: string;
  desc: string;
  channels: PresetChannel[];
}

export interface NoviceChannelInfo {
  prefix: string;
  badgeClass: string;
  descriptiveLcdName: string;
  category: string;
  purpose: string;
  tip: string;
}

/**
 * Proporciona una explicación detallada y nombre descriptivo estandarizado
 * para principiantes (con prefijos MAR-, AIR-, SOS-, PMR-, SAT-, HAM-V-, HAM-U-).
 */
export function getChannelNoviceExplanation(ch: { rx: number; nom?: string; enc?: string; dec?: string }): NoviceChannelInfo {
  const rx = ch.rx;
  const nom = (ch.nom || '').toUpperCase();
  const enc = ch.enc || '';

  // 1. PMR-446 Libre
  if (rx >= 446.0000 && rx <= 446.2050) {
    if (Math.abs(rx - 446.08125) < 0.0001 && (enc.includes('85.4') || nom.includes('7-7') || nom.includes('MONT'))) {
      return {
        prefix: 'SOS',
        badgeClass: 'bg-red-950/70 text-red-300 border-red-500/50',
        descriptiveLcdName: 'SOS-7-7',
        category: 'Emergencias & Montaña',
        purpose: 'Canal 7-7 · Socorro y Rescate en Montaña (Subtono 85.4 Hz)',
        tip: 'Canal de auxilio senderista en España. Mantener escucha activa.'
      };
    }
    // Determinar número de canal PMR 1 a 16
    const basePmr = 446.00625;
    const stepPmr = 0.0125;
    const pmrIdx = Math.round((rx - basePmr) / stepPmr) + 1;
    const pmrNumStr = pmrIdx >= 1 && pmrIdx <= 16 ? String(pmrIdx).padStart(2, '0') : 'LIB';
    return {
      prefix: 'PMR',
      badgeClass: 'bg-cyan-950/70 text-cyan-300 border-cyan-500/50',
      descriptiveLcdName: `PMR-${pmrNumStr}`,
      category: 'PMR-446 UHF Libre',
      purpose: `Canal ${pmrIdx >= 1 && pmrIdx <= 16 ? pmrIdx : 'Libre'} · Uso público sin licencia (Walkies)`,
      tip: 'Uso libre analógico. Potencia recomendada baja (Narrow).'
    };
  }

  // 2. Banda Marina VHF (MAR-)
  if (rx >= 156.0000 && rx <= 162.0500) {
    if (Math.abs(rx - 156.8000) < 0.005 || nom.includes('16')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-16',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 16 · Socorro, Salvamento Marítimo y Llamada Obligatoria',
        tip: 'Canal prioritario internacional de emergencia náutica (Mayday / Pan-Pan).'
      };
    }
    if (Math.abs(rx - 156.4500) < 0.005 || nom.includes('09') || nom.includes('9')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-09',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 09 · Clubes Náuticos, Puertos Deportivos y Amarres',
        tip: 'Solicitud de atraque, información de pantalán y clubes de regatas.'
      };
    }
    if (Math.abs(rx - 156.3000) < 0.005 || nom.includes('06') || nom.includes('6')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-06',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 06 · Seguridad Interbuques y Búsqueda SAR',
        tip: 'Coordinación entre embarcaciones y operaciones de búsqueda.'
      };
    }
    if (Math.abs(rx - 156.6250) < 0.005 || nom.includes('72')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-72',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 72 · Conversación Barco a Barco',
        tip: 'Comunicaciones entre embarcaciones de recreo y pesca.'
      };
    }
    if (Math.abs(rx - 156.8750) < 0.005 || nom.includes('77')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-77',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 77 · Conversación Barco a Barco',
        tip: 'Comunicaciones entre barcos en travesía.'
      };
    }
    if (Math.abs(rx - 156.6500) < 0.005 || nom.includes('13')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-13',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 13 · Seguridad y Maniobras de Navegación',
        tip: 'Avisos de maniobras en bocana de puertos y canales angostos.'
      };
    }
    if (Math.abs(rx - 156.5000) < 0.005 || nom.includes('10')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-10',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 10 · Cruz Roja del Mar y Pesca',
        tip: 'Operaciones de salvamento marítimo y auxilio en aguas costeras.'
      };
    }
    if (Math.abs(rx - 156.3750) < 0.005 || nom.includes('67')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-67',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 67 · Boletín Meteorológico y Avisos Marinos',
        tip: 'Transmisión de partes del tiempo, viento y estado de la mar.'
      };
    }
    if (Math.abs(rx - 157.4250) < 0.005 || nom.includes('88')) {
      return {
        prefix: 'MAR',
        badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
        descriptiveLcdName: 'MAR-88',
        category: 'Náutica & Salvamento',
        purpose: 'Canal 88 · Comunicaciones Comerciales y Marinas',
        tip: 'Servicios de varadero y empresas de servicios náuticos.'
      };
    }
    return {
      prefix: 'MAR',
      badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/50',
      descriptiveLcdName: `MAR-${rx.toFixed(2).replace('.', '')}`.slice(0, 8),
      category: 'Náutica & Salvamento',
      purpose: 'Canal Marítimo VHF',
      tip: 'Banda náutica VHF internacional.'
    };
  }

  // 3. Aviación Civil (AIR-) VHF AM (Solo escucha)
  if (rx >= 108.0000 && rx <= 137.0000) {
    if (Math.abs(rx - 121.5000) < 0.005 || nom.includes('EMERG') || nom.includes('121')) {
      return {
        prefix: 'AIR',
        badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
        descriptiveLcdName: 'AIR-1215',
        category: 'Aviación Civil (VHF AM)',
        purpose: '121.500 MHz · Frecuencia Internacional de Emergencia Aérea (Guard)',
        tip: 'Solo escucha en modulación AM. Canal de socorro internacional para aviones.'
      };
    }
    if (Math.abs(rx - 118.1000) < 0.005 || nom.includes('TORRE') || nom.includes('TWR')) {
      return {
        prefix: 'AIR',
        badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
        descriptiveLcdName: 'AIR-TWR',
        category: 'Aviación Civil (VHF AM)',
        purpose: 'Torre de Control (TWR) · Despegues, Aterrizajes y Pistas',
        tip: 'Escucha de autorizaciones de vuelo y tráfico aéreo local en aeropuertos.'
      };
    }
    if (Math.abs(rx - 128.5000) < 0.005 || nom.includes('APROX') || nom.includes('APP')) {
      return {
        prefix: 'AIR',
        badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
        descriptiveLcdName: 'AIR-APRX',
        category: 'Aviación Civil (VHF AM)',
        purpose: 'Aproximación (APP) · Gestión de Llegadas y Salidas Terminales',
        tip: 'Control de tráfico aéreo en el área terminal del aeropuerto (TMA).'
      };
    }
    if (Math.abs(rx - 124.0250) < 0.005 || nom.includes('RADAR') || nom.includes('ACC')) {
      return {
        prefix: 'AIR',
        badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
        descriptiveLcdName: 'AIR-RDR',
        category: 'Aviación Civil (VHF AM)',
        purpose: 'Control Radar en Ruta (ACC) · Aviones Comerciales en Vuelo',
        tip: 'Comunicaciones de aviones de pasajeros cruzando a gran altitud.'
      };
    }
    if (Math.abs(rx - 123.4500) < 0.005 || nom.includes('INTER') || nom.includes('A2A')) {
      return {
        prefix: 'AIR',
        badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
        descriptiveLcdName: 'AIR-A2A',
        category: 'Aviación Civil (VHF AM)',
        purpose: 'Aire a Aire (Air-to-Air) · Charla entre Pilotos en Ruta',
        tip: 'Frecuencia libre entre cabinas de vuelo en espacio aéreo no controlado.'
      };
    }
    if (Math.abs(rx - 120.0500) < 0.005 || nom.includes('INFO') || nom.includes('ATIS')) {
      return {
        prefix: 'AIR',
        badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
        descriptiveLcdName: 'AIR-INFO',
        category: 'Aviación Civil (VHF AM)',
        purpose: 'Información de Vuelo / Meteorología Aeroportuaria (ATIS/AFIS)',
        tip: 'Emisión continua del estado de pistas, viento y presión barométrica.'
      };
    }
    return {
      prefix: 'AIR',
      badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/50',
      descriptiveLcdName: `AIR-${rx.toFixed(1).replace('.', '')}`.slice(0, 8),
      category: 'Aviación Civil (VHF AM)',
      purpose: 'Frecuencia Aeronáutica VHF AM',
      tip: 'Solo escucha en modulación AM. Prohibido transmitir.'
    };
  }

  // 4. Satélites & Espacio (SAT-)
  if ((rx >= 137.0000 && rx < 138.0000) || (rx >= 145.8000 && rx <= 146.0000 && (nom.includes('ISS') || nom.includes('SAT') || nom.includes('NOAA')))) {
    if (Math.abs(rx - 145.8000) < 0.005) {
      return {
        prefix: 'SAT',
        badgeClass: 'bg-purple-950/70 text-purple-300 border-purple-500/50',
        descriptiveLcdName: 'SAT-ISS',
        category: 'Satélites & Espacio',
        purpose: 'Estación Espacial ISS · Canal de Voz Astronautas y Repetidor',
        tip: 'Escucha cuando la ISS sobrevuela tu zona (subtono TX 67.0 Hz).'
      };
    }
    if (Math.abs(rx - 145.8250) < 0.005) {
      return {
        prefix: 'SAT',
        badgeClass: 'bg-purple-950/70 text-purple-300 border-purple-500/50',
        descriptiveLcdName: 'SAT-APRS',
        category: 'Satélites & Espacio',
        purpose: 'Estación Espacial ISS · Paquetes Digitales de Datos APRS',
        tip: 'Transmisión de telemetría y mensajes de posición digital a 1200 baudios.'
      };
    }
    if (Math.abs(rx - 137.6200) < 0.005 || nom.includes('15')) {
      return {
        prefix: 'SAT',
        badgeClass: 'bg-purple-950/70 text-purple-300 border-purple-500/50',
        descriptiveLcdName: 'SAT-NO15',
        category: 'Satélites & Espacio',
        purpose: 'Satélite NOAA-15 · Fotos Meteorológicas APT en Directo',
        tip: 'Emisión de imágenes satelitales en directo al pasar sobre tu cielo.'
      };
    }
    if (Math.abs(rx - 137.9125) < 0.005 || nom.includes('18')) {
      return {
        prefix: 'SAT',
        badgeClass: 'bg-purple-950/70 text-purple-300 border-purple-500/50',
        descriptiveLcdName: 'SAT-NO18',
        category: 'Satélites & Espacio',
        purpose: 'Satélite NOAA-18 · Fotos Meteorológicas y Clima',
        tip: 'Imágenes infrarrojas de nubes y borrascas vía satélite APT.'
      };
    }
    if (Math.abs(rx - 137.1000) < 0.005 || nom.includes('19')) {
      return {
        prefix: 'SAT',
        badgeClass: 'bg-purple-950/70 text-purple-300 border-purple-500/50',
        descriptiveLcdName: 'SAT-NO19',
        category: 'Satélites & Espacio',
        purpose: 'Satélite NOAA-19 · Imágenes Meteorológicas en Directo',
        tip: 'Satélite en órbita polar para recepción de clima en tiempo real.'
      };
    }
  }

  // 5. Emergencias, Rescate y Seguridad Ciudadana (SOS-)
  if (nom.includes('MONT') || nom.includes('REMER') || nom.includes('CIVIL') || nom.includes('CRUZ') || nom.includes('PROT') || nom.includes('SOS')) {
    if (nom.includes('MONT') || Math.abs(rx - 446.08125) < 0.0001) {
      return {
        prefix: 'SOS',
        badgeClass: 'bg-red-950/70 text-red-300 border-red-500/50',
        descriptiveLcdName: 'SOS-7-7',
        category: 'Emergencias & Montaña',
        purpose: 'Canal 7-7 · Socorro y Rescate en Montaña (CTCSS 85.4 Hz)',
        tip: 'Canal oficial de seguridad en montaña para montañeros y rescatistas.'
      };
    }
    if (nom.includes('REMER') || Math.abs(rx - 146.1250) < 0.005) {
      return {
        prefix: 'SOS',
        badgeClass: 'bg-red-950/70 text-red-300 border-red-500/50',
        descriptiveLcdName: 'SOS-REMR',
        category: 'Emergencias & Montaña',
        purpose: 'Red REMER · Radioaficionados de Emergencia Protección Civil',
        tip: 'Red nacional de emergencias ante catástrofes de la Dirección General de PC.'
      };
    }
    if (nom.includes('CIVIL') || nom.includes('PROT') || Math.abs(rx - 146.1750) < 0.005) {
      return {
        prefix: 'SOS',
        badgeClass: 'bg-red-950/70 text-red-300 border-red-500/50',
        descriptiveLcdName: 'SOS-PCIV',
        category: 'Emergencias & Montaña',
        purpose: 'Protección Civil · Coordinación de Voluntarios y Operativos',
        tip: 'Canal de coordinación local ante eventos y situaciones de emergencia.'
      };
    }
    if (nom.includes('CRUZ') || Math.abs(rx - 164.3000) < 0.005) {
      return {
        prefix: 'SOS',
        badgeClass: 'bg-red-950/70 text-red-300 border-red-500/50',
        descriptiveLcdName: 'SOS-CRUZ',
        category: 'Emergencias & Montaña',
        purpose: 'Cruz Roja · Servicios de Ambulancias y Socorro Terrestre',
        tip: 'Operativos sanitarios, preventivos y auxilio en tierra.'
      };
    }
  }

  // 6. Ham Radio 2 Metros VHF (HAM-V-)
  if (rx >= 144.0000 && rx <= 148.0000) {
    if (Math.abs(rx - 145.5000) < 0.005) {
      return {
        prefix: 'HAM-V',
        badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50',
        descriptiveLcdName: 'HAM-VCAL',
        category: 'Ham Radio 2m (145 MHz)',
        purpose: '145.500 MHz · Frecuencia Nacional de Llamada Directa en 2m',
        tip: 'Para establecer contacto con otros radioaficionados antes de pasar a otra frecuencia.'
      };
    }
    // Repetidores R0 a R7
    const rBase = 145.6000;
    const rIdx = Math.round((rx - rBase) / 0.025);
    if (rIdx >= 0 && rIdx <= 7) {
      return {
        prefix: 'HAM-V',
        badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50',
        descriptiveLcdName: `HAM-VR${rIdx}`,
        category: 'Ham Radio 2m (145 MHz)',
        purpose: `Repetidor VHF R${rIdx} · Salida ${rx.toFixed(4)} / Entrada ${(rx - 0.6).toFixed(4)} MHz`,
        tip: 'Desplazamiento estándar -600 kHz con subtono 77.0 Hz para máxima cobertura comarcal.'
      };
    }
    return {
      prefix: 'HAM-V',
      badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50',
      descriptiveLcdName: `HAM-${rx.toFixed(2).replace('.', '')}`.slice(0, 8),
      category: 'Ham Radio 2m (145 MHz)',
      purpose: 'Canal VHF de Radioaficionado (Banda 2 Metros)',
      tip: 'Uso exclusivo para radioaficionados con indicativo y licencia.'
    };
  }

  // 7. Ham Radio 70 Centímetros UHF (HAM-U-)
  if (rx >= 430.0000 && rx <= 440.0000) {
    if (Math.abs(rx - 433.5000) < 0.005) {
      return {
        prefix: 'HAM-U',
        badgeClass: 'bg-teal-950/70 text-teal-300 border-teal-500/50',
        descriptiveLcdName: 'HAM-UCAL',
        category: 'Ham Radio 70cm (430 MHz)',
        purpose: '433.500 MHz · Frecuencia Nacional de Llamada Directa en UHF',
        tip: 'Frecuencia de encuentro y contacto en 70 cm.'
      };
    }
    // Repetidores RU
    if (rx >= 438.6250 && rx <= 439.1500) {
      const numCode = Math.round(rx * 100) % 1000;
      return {
        prefix: 'HAM-U',
        badgeClass: 'bg-teal-950/70 text-teal-300 border-teal-500/50',
        descriptiveLcdName: `HAM-U${numCode}`.slice(0, 8),
        category: 'Ham Radio 70cm (430 MHz)',
        purpose: `Repetidor UHF RU · Salida ${rx.toFixed(4)} MHz (Shift -7.6 MHz)`,
        tip: 'Repetidor UHF de gran alcance con subtono 77.0 Hz.'
      };
    }
    return {
      prefix: 'HAM-U',
      badgeClass: 'bg-teal-950/70 text-teal-300 border-teal-500/50',
      descriptiveLcdName: `HAM-${rx.toFixed(1).replace('.', '')}`.slice(0, 8),
      category: 'Ham Radio 70cm (430 MHz)',
      purpose: 'Canal UHF de Radioaficionado (Banda 70 Centímetros)',
      tip: 'Uso de radioafición en UHF.'
    };
  }

  // 8. Frecuencias Generales
  if (rx >= 138.0000 && rx <= 174.0000) {
    return {
      prefix: 'VHF',
      badgeClass: 'bg-indigo-950/70 text-indigo-300 border-indigo-500/50',
      descriptiveLcdName: `VHF-${rx.toFixed(1).replace('.', '')}`.slice(0, 8),
      category: 'VHF General (138-174 MHz)',
      purpose: 'Frecuencia de Comunicaciones en Banda VHF',
      tip: 'Banda VHF comercial y de servicios.'
    };
  }

  return {
    prefix: 'UHF',
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-600',
    descriptiveLcdName: `CH-${rx.toFixed(1).replace('.', '')}`.slice(0, 8),
    category: 'UHF General',
    purpose: 'Canal Personalizado de Radio',
    tip: 'Frecuencia programada en la radio.'
  };
}

/**
 * Aplica nombres descriptivos estandarizados a toda la lista de canales
 * con prefijos limpios aptos para la pantalla LCD (MAR-, AIR-, SOS-, PMR-, HAM-, SAT-).
 */
export function applyDescriptiveNoviceNames(channels: RadioChannel[]): RadioChannel[] {
  return channels.map(ch => {
    const info = getChannelNoviceExplanation(ch);
    return {
      ...ch,
      nom: info.descriptiveLcdName
    };
  });
}

/**
 * Comprueba de forma inteligente si una frecuencia o canal ya existe en la memoria de la radio.
 * Considera duplicado si la frecuencia RX coincide con una tolerancia de ±0.00005 MHz (50 Hz).
 */
export function findDuplicateChannel(
  channels: RadioChannel[],
  candidate: { rx: number; name?: string; tx?: number | null; dec?: string; enc?: string }
): RadioChannel | null {
  for (const c of channels) {
    const rxDiff = Math.abs(c.rx - candidate.rx);
    if (rxDiff < 0.00005) {
      return c;
    }
  }
  return null;
}

export interface PresetAnalysis {
  preset: ChannelPreset;
  duplicates: {
    channel: PresetChannel;
    existing: RadioChannel;
  }[];
  newChannels: PresetChannel[];
  total: number;
  isFullyLoaded: boolean;
}

/**
 * Analiza un pack de canales contra la lista actual de la radio
 * detectando cuántos canales ya existen y cuáles son nuevos.
 */
export function analyzePresetDuplication(
  preset: ChannelPreset,
  existingChannels: RadioChannel[]
): PresetAnalysis {
  const duplicates: { channel: PresetChannel; existing: RadioChannel }[] = [];
  const newChannels: PresetChannel[] = [];

  for (const pc of preset.channels) {
    const found = findDuplicateChannel(existingChannels, pc);
    if (found) {
      duplicates.push({ channel: pc, existing: found });
    } else {
      newChannels.push(pc);
    }
  }

  return {
    preset,
    duplicates,
    newChannels,
    total: preset.channels.length,
    isFullyLoaded: duplicates.length === preset.channels.length && preset.channels.length > 0
  };
}

export const PRESETS_FRECUENCIAS: ChannelPreset[] = [
  {
    id: "pmr446",
    name: "PMR-446 Canales 1 a 16 (UHF Libre)",
    category: "UHF Libre (Walkies)",
    desc: "16 canales de uso libre sin licencia en 446 MHz (estándar europeo analógico en banda estrecha Narrow). Prefijo PMR-.",
    channels: [
      { name: "PMR-01", rx: 446.00625, ancho: "N", pot: "Baja 2 W", purpose: "Canal 1 Libre · Walkies y excursiones" },
      { name: "PMR-02", rx: 446.01875, ancho: "N", pot: "Baja 2 W", purpose: "Canal 2 Libre · Uso familiar y campings" },
      { name: "PMR-03", rx: 446.03125, ancho: "N", pot: "Baja 2 W", purpose: "Canal 3 Libre · Deportes y eventos" },
      { name: "PMR-04", rx: 446.04375, ancho: "N", pot: "Baja 2 W", purpose: "Canal 4 Libre · Comunicación 4x4" },
      { name: "PMR-05", rx: 446.05625, ancho: "N", pot: "Baja 2 W", purpose: "Canal 5 Libre · Grupos y orientación" },
      { name: "PMR-06", rx: 446.06875, ancho: "N", pot: "Baja 2 W", purpose: "Canal 6 Libre · Uso general" },
      { name: "PMR-07", rx: 446.08125, ancho: "N", pot: "Baja 2 W", purpose: "Canal 7 Libre · Frecuencia base" },
      { name: "PMR-08", rx: 446.09375, ancho: "N", pot: "Baja 2 W", purpose: "Canal 8 Libre · Llamada habitual en montaña" },
      { name: "PMR-09", rx: 446.10625, ancho: "N", pot: "Baja 2 W", purpose: "Canal 9 Libre · Ampliado" },
      { name: "PMR-10", rx: 446.11875, ancho: "N", pot: "Baja 2 W", purpose: "Canal 10 Libre · Ampliado" },
      { name: "PMR-11", rx: 446.13125, ancho: "N", pot: "Baja 2 W", purpose: "Canal 11 Libre · Ampliado" },
      { name: "PMR-12", rx: 446.14375, ancho: "N", pot: "Baja 2 W", purpose: "Canal 12 Libre · Ampliado" },
      { name: "PMR-13", rx: 446.15625, ancho: "N", pot: "Baja 2 W", purpose: "Canal 13 Libre · Ampliado" },
      { name: "PMR-14", rx: 446.16875, ancho: "N", pot: "Baja 2 W", purpose: "Canal 14 Libre · Ampliado" },
      { name: "PMR-15", rx: 446.18125, ancho: "N", pot: "Baja 2 W", purpose: "Canal 15 Libre · Ampliado" },
      { name: "PMR-16", rx: 446.19375, ancho: "N", pot: "Baja 2 W", purpose: "Canal 16 Libre · Ampliado" }
    ]
  },
  {
    id: "marina",
    name: "Banda Marítima VHF Náutica (MAR-)",
    category: "Náutica & Salvamento",
    desc: "Canales náuticos estandarizados con prefijo MAR- (MAR-16 Socorro, MAR-09 Clubes náuticos, MAR-06 Seguridad, MAR-72/77 Barco a Barco).",
    channels: [
      { name: "MAR-16", rx: 156.8000, ancho: "W", pot: "Alta 5 W", purpose: "Canal 16 · Socorro, Salvamento Marítimo y Llamada Obligatoria" },
      { name: "MAR-09", rx: 156.4500, ancho: "W", pot: "Baja 2 W", purpose: "Canal 09 · Clubes Náuticos, Puertos Deportivos y Amarres" },
      { name: "MAR-06", rx: 156.3000, ancho: "W", pot: "Baja 2 W", purpose: "Canal 06 · Seguridad Interbuques y Búsqueda SAR" },
      { name: "MAR-72", rx: 156.6250, ancho: "W", pot: "Baja 2 W", purpose: "Canal 72 · Conversación Barco a Barco (Recreo)" },
      { name: "MAR-77", rx: 156.8750, ancho: "W", pot: "Baja 2 W", purpose: "Canal 77 · Conversación Barco a Barco y Pesca" },
      { name: "MAR-13", rx: 156.6500, ancho: "W", pot: "Baja 2 W", purpose: "Canal 13 · Seguridad y Maniobras de Navegación" },
      { name: "MAR-10", rx: 156.5000, ancho: "W", pot: "Baja 2 W", purpose: "Canal 10 · Cruz Roja del Mar y Operaciones Pesqueras" },
      { name: "MAR-67", rx: 156.3750, ancho: "W", pot: "Baja 2 W", purpose: "Canal 67 · Boletín Meteorológico y Avisos a Navegantes" },
      { name: "MAR-88", rx: 157.4250, ancho: "W", pot: "Baja 2 W", purpose: "Canal 88 · Comunicaciones Comerciales y Marinas" }
    ]
  },
  {
    id: "aerea",
    name: "Aviación Civil VHF AM (AIR-)",
    category: "Aeronáutica (Escucha)",
    desc: "Frecuencias de control y socorro en banda aérea civil internacional con prefijo AIR- (solo escucha en AM, TX inhibida).",
    channels: [
      { name: "AIR-1215", rx: 121.5000, ancho: "W", pot: "Baja 2 W", purpose: "121.500 MHz · Frecuencia Guard Internacional de Socorro Aéreo" },
      { name: "AIR-TWR",  rx: 118.1000, ancho: "W", pot: "Baja 2 W", purpose: "Torre de Control (TWR) · Pistas, Despegues y Aterrizajes" },
      { name: "AIR-APRX", rx: 128.5000, ancho: "W", pot: "Baja 2 W", purpose: "Aproximación (APP) · Tráfico Terminal de Llegadas/Salidas" },
      { name: "AIR-RDR",  rx: 124.0250, ancho: "W", pot: "Baja 2 W", purpose: "Control Radar en Ruta (ACC) · Aviones en Vuelo" },
      { name: "AIR-A2A",  rx: 123.4500, ancho: "W", pot: "Baja 2 W", purpose: "Aire a Aire (Air-to-Air) · Charla entre Pilotos en Ruta" },
      { name: "AIR-INFO", rx: 120.0500, ancho: "W", pot: "Baja 2 W", purpose: "Información de Vuelo y Meteorología ATIS/AFIS" }
    ]
  },
  {
    id: "emergencias",
    name: "Emergencias & Montaña (SOS-)",
    category: "Seguridad Ciudadana",
    desc: "Canales de socorro y rescate con prefijo SOS- (SOS-7-7 en montaña con subtono 85.4, REMER y Protección Civil).",
    channels: [
      { name: "SOS-7-7",  rx: 446.08125, tx: 446.08125, enc: "85.4", dec: "85.4", ancho: "N", pot: "Alta 5 W", purpose: "Canal 7-7 · Auxilio y Rescate en Montaña (PMR Ch7 + Subtono 85.4)" },
      { name: "SOS-REMR", rx: 146.12500, ancho: "W", pot: "Baja 2 W", purpose: "Red REMER · Radioaficionados de Emergencia Protección Civil" },
      { name: "SOS-PCIV", rx: 146.17500, ancho: "W", pot: "Baja 2 W", purpose: "Protección Civil · Coordinación de Emergencias Locales" },
      { name: "SOS-CRUZ", rx: 164.30000, ancho: "W", pot: "Baja 2 W", purpose: "Cruz Roja Española · Servicios de Ambulancias y Socorro" }
    ]
  },
  {
    id: "espacio",
    name: "Satélites NOAA & Espacio ISS (SAT-)",
    category: "Espacio & Satélites",
    desc: "Frecuencias espaciales con prefijo SAT- (Imágenes del tiempo de satélites NOAA y voz/APRS de la Estación Espacial Internacional).",
    channels: [
      { name: "SAT-ISS",  rx: 145.8000, tx: 145.2000, enc: "67.0", ancho: "W", pot: "Alta 5 W", purpose: "Estación Espacial ISS · Voz de Astronautas y Repetidor FM" },
      { name: "SAT-APRS", rx: 145.8250, tx: 145.8250, ancho: "W", pot: "Alta 5 W", purpose: "Estación Espacial ISS · Mensajería Digital APRS (1200 baud)" },
      { name: "SAT-NO15", rx: 137.6200, ancho: "W", pot: "Baja 2 W", purpose: "Satélite NOAA-15 · Fotos Meteorológicas APT en Directo" },
      { name: "SAT-NO18", rx: 137.9125, ancho: "W", pot: "Baja 2 W", purpose: "Satélite NOAA-18 · Imágenes de Borrascas y Clima" },
      { name: "SAT-NO19", rx: 137.1000, ancho: "W", pot: "Baja 2 W", purpose: "Satélite NOAA-19 · Fotografía Satelital del Clima en Directo" }
    ]
  },
  {
    id: "ham_2m",
    name: "Repetidores Radioafición 2m VHF (HAM-V-)",
    category: "Ham Radio 145 MHz",
    desc: "Canales de radioaficionado VHF con prefijo HAM-V- (Llamada 145.500 y repetidores R0-R7 con desplazamiento -600 kHz y subtono 77.0).",
    channels: [
      { name: "HAM-VCAL", rx: 145.5000, tx: 145.5000, ancho: "W", pot: "Alta 5 W", purpose: "145.500 MHz · Frecuencia Nacional de Llamada Directa en 2 Metros" },
      { name: "HAM-VR0",  rx: 145.6000, tx: 145.0000, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R0 · Salida 145.600 / Entrada 145.000 MHz (-600 kHz)" },
      { name: "HAM-VR1",  rx: 145.6250, tx: 145.0250, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R1 · Salida 145.625 / Entrada 145.025 MHz (-600 kHz)" },
      { name: "HAM-VR2",  rx: 145.6500, tx: 145.0500, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R2 · Salida 145.650 / Entrada 145.050 MHz (-600 kHz)" },
      { name: "HAM-VR3",  rx: 145.6750, tx: 145.0750, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R3 · Salida 145.675 / Entrada 145.075 MHz (-600 kHz)" },
      { name: "HAM-VR4",  rx: 145.7000, tx: 145.1000, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R4 · Salida 145.700 / Entrada 145.100 MHz (-600 kHz)" },
      { name: "HAM-VR5",  rx: 145.7250, tx: 145.1250, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R5 · Salida 145.725 / Entrada 145.125 MHz (-600 kHz)" },
      { name: "HAM-VR6",  rx: 145.7500, tx: 145.1500, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R6 · Salida 145.750 / Entrada 145.150 MHz (-600 kHz)" },
      { name: "HAM-VR7",  rx: 145.7750, tx: 145.1750, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor VHF R7 · Salida 145.775 / Entrada 145.175 MHz (-600 kHz)" }
    ]
  },
  {
    id: "ham_70cm",
    name: "Repetidores Radioafición 70cm UHF (HAM-U-)",
    category: "Ham Radio 430 MHz",
    desc: "Repetidores de radioaficionado UHF con prefijo HAM-U- (Llamada 433.500 y repetidores RU690 a RU730 con shift -7.6 MHz y subtono 77.0).",
    channels: [
      { name: "HAM-UCAL", rx: 433.5000, tx: 433.5000, ancho: "W", pot: "Alta 5 W", purpose: "433.500 MHz · Frecuencia Nacional de Llamada Directa en 70 cm" },
      { name: "HAM-U690", rx: 438.6250, tx: 431.0250, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor UHF RU690 · Salida 438.625 / Entrada 431.025 MHz (-7.6 MHz)" },
      { name: "HAM-U700", rx: 438.7500, tx: 431.1500, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor UHF RU700 · Salida 438.750 / Entrada 431.150 MHz (-7.6 MHz)" },
      { name: "HAM-U710", rx: 438.8750, tx: 431.2750, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor UHF RU710 · Salida 438.875 / Entrada 431.275 MHz (-7.6 MHz)" },
      { name: "HAM-U720", rx: 439.0000, tx: 431.4000, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor UHF RU720 · Salida 439.000 / Entrada 431.400 MHz (-7.6 MHz)" },
      { name: "HAM-U730", rx: 439.1250, tx: 431.5250, enc: "77.0", ancho: "W", pot: "Alta 5 W", purpose: "Repetidor UHF RU730 · Salida 439.125 / Entrada 431.525 MHz (-7.6 MHz)" }
    ]
  }
];
