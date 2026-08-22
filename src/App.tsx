import React, { useState, useRef, useEffect } from 'react';
import { 
  Radio, 
  Terminal, 
  Download, 
  Upload,
  RefreshCw, 
  Zap, 
  Layers, 
  Wifi, 
  WifiOff, 
  AlertCircle, 
  Trash2, 
  Volume2, 
  Activity,
  ArrowUp,
  ArrowDown,
  Edit3,
  PlusCircle,
  Sparkles,
  CheckCircle2,
  Info,
  ShieldCheck,
  RadioTower,
  Sliders,
  Cpu,
  Usb,
  ExternalLink,
  FolderTree,
  ArrowUpDown,
  Wand2,
  ListFilter,
  Check,
  Copy,
  CheckSquare,
  Square,
  Filter,
  ChevronDown
} from 'lucide-react';
import { TidradioDevice, BleLogEntry } from './lib/bluetooth';
import { TidradioSerialDevice } from './lib/serial';
import { 
  decodeChannels, 
  leerMemoriaCompleta, 
  readVFOA, 
  writeVFOA,
  saludar, 
  sendKeyDown, 
  sendKeyUp, 
  sendKeyPulse, 
  setRemoteMode,
  grabarMemoriaSegura,
  canalABytes,
  nombreABytes,
  PRESETS_FRECUENCIAS,
  RadioChannel,
  ChannelPreset,
  PresetChannel,
  findDuplicateChannel,
  analyzePresetDuplication,
  getChannelCategoryInfo,
  organizeAndReorderChannels,
  getChannelNoviceExplanation,
  applyDescriptiveNoviceNames,
  NoviceChannelInfo,
  ChannelCategoryInfo,
  LiveRadioState,
  readFullLiveState,
  RadioTransport,
  formatFrequency
} from './lib/protocol';
import { LiveScreenMirror } from './components/LiveScreenMirror';
import { FirmwareHub } from './components/FirmwareHub';
import { CollapsibleSection } from './components/CollapsibleSection';
import { BandPlanViewer } from './components/BandPlanViewer';
import { TacticalCockpitHeader } from './components/TacticalCockpitHeader';
import { radioAudio } from './lib/audio';

interface Probe {
  id: string;
  name: string;
  bytes?: number[];
  readAddr?: number;
  expectLen?: number;
  desc: string;
  fwType: 'Oficial' | 'nicFW';
}

const SONDEOS: Probe[] = [
  { id: "vfoa", name: "Leer VFO-A (0x52 0x19 0x50)", readAddr: 0x1950, fwType: 'Oficial', desc: "Protocolo oficial de fábrica: Lee el bloque donde reside la frecuencia sintonizada activa." },
  { id: "ping", name: "Ping (0x01)", bytes: [0x01], expectLen: 1, fwType: 'nicFW', desc: "Byte eco. Solo presente en firmware alternativo nicFW (devuelve 0x01)." },
  { id: "estado", name: "Estado en vivo (0xAA 0x60)", bytes: [0xAA, 0x60], expectLen: 37, fwType: 'nicFW', desc: "Comando experimental para telemetría en tiempo real (frecuencia, RSSI, squelch)." },
  { id: "remoto_on", name: "Activar remoto (0x4A)", bytes: [0x4A], expectLen: 1, fwType: 'nicFW', desc: "En firmware alternativo nicFW activa el teclado remoto y el volcado de pantalla." },
  { id: "remoto_off", name: "Desactivar remoto (0x4B)", bytes: [0x4B], expectLen: 1, fwType: 'nicFW', desc: "Desactiva el modo de control remoto." },
  { id: "tecla_menu_0a", name: "Simular MENU (0x50 0x00 0x0A...)", bytes: [0x50, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x00], expectLen: 1, fwType: 'nicFW', desc: "Paquete de pulsación remota (ignorado por el firmware oficial de fábrica)." },
  { id: "tecla_ptt", name: "Simular PTT (0x50 0x00 0x15...)", bytes: [0x50, 0x00, 0x15, 0x00, 0x00, 0x00, 0x00], expectLen: 1, fwType: 'nicFW', desc: "Paquete de transmisión PTT remoto." }
];

export default function App() {
  const [device, setDevice] = useState<RadioTransport | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<'ble' | 'usb' | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [activeTab, setActiveTab] = useState<'panel' | 'channels' | 'presets' | 'vfo' | 'firmware' | 'lab' | 'log'>('panel');
  
  // Tactical Theme state ('cyan', 'phosphor', 'amber', 'amethyst')
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('radio_tactical_theme') || 'cyan';
    }
    return 'cyan';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('radio_tactical_theme', currentTheme);
  }, [currentTheme]);
  
  // Real-time synced live state
  const [liveState, setLiveState] = useState<LiveRadioState>({
    vfoA: {
      rx: 145.5000,
      tx: 145.5000,
      nom: "VFO-A",
      dec: "",
      enc: "88.5",
      ancho: "W",
      pot: "Alta 5 W",
      stepKHz: 12.5,
      bcl: false
    },
    vfoB: {
      rx: 446.00625,
      tx: 446.00625,
      nom: "PMR-01",
      dec: "",
      enc: "",
      ancho: "N",
      pot: "Baja 2 W",
      stepKHz: 12.5,
      bcl: false
    },
    activeVfo: 'A',
    squelch: 3,
    batteryVolts: 7.6,
    batteryPct: 88,
    dualWatch: true,
    keyLock: false,
    vox: false,
    radioModeName: "TD-H3 PLUS",
    lastUpdated: Date.now()
  });

  // VFO & Radio status
  const [rxFreq, setRxFreq] = useState("145.50000");
  const [txFreq, setTxFreq] = useState("145.50000");
  const [vfoWriteRx, setVfoWriteRx] = useState("145.50000");
  const [vfoWriteTx, setVfoWriteTx] = useState("145.50000");
  const [radioMode, setRadioMode] = useState<string>("TD-H3 PLUS (Fábrica)");
  const [isReadingVFO, setIsReadingVFO] = useState(false);
  const [isWritingVFO, setIsWritingVFO] = useState(false);
  const [vfoStatusMsg, setVfoStatusMsg] = useState("");

  // Live log
  const [logs, setLogs] = useState<BleLogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Laboratory probe responses
  const [probeResults, setProbeResults] = useState<Record<string, string>>({});
  const [customHex, setCustomHex] = useState("50 00 0A 00 00 00 00");
  const [customHexRes, setCustomHexRes] = useState("");

  // Memory & Channels
  const [memProgress, setMemProgress] = useState<{ pct: number; addr: string; status: string } | null>(null);
  const [writeProgress, setWriteProgress] = useState<{ pct: number; msg: string } | null>(null);
  const [memoryBuffer, setMemoryBuffer] = useState<Uint8Array | null>(null);
  const [channels, setChannels] = useState<RadioChannel[]>([]);
  const [backupUrl, setBackupUrl] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("");
  const [autoReorderGroups, setAutoReorderGroups] = useState(true);
  const [channelViewLayout, setChannelViewLayout] = useState<'grouped' | 'flat'>('grouped');

  // Detección automática de duplicados existentes en la lista
  const duplicateChannelCount = React.useMemo(() => {
    const seen = new Set<string>();
    let dups = 0;
    for (const c of channels) {
      const k = c.rx.toFixed(4);
      if (seen.has(k)) dups++;
      else seen.add(k);
    }
    return dups;
  }, [channels]);

  // Channel Editing Modal / State
  const [editingChannel, setEditingChannel] = useState<RadioChannel | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");

  // Active key pressed animation
  const [activeKey, setActiveKey] = useState<number | string | null>(null);
  const [errorBanner, setErrorBanner] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const deviceRef = useRef<RadioTransport | null>(null);

  // Key map definitions (Quansheng / Beken TD-H3 matrix)
  const KEY_MENU = 10; // 0x0A
  const KEY_UP = 11;   // 0x0B
  const KEY_DOWN = 12; // 0x0C
  const KEY_EXIT = 13; // 0x0D
  const KEY_STAR = 14; // 0x0E
  const KEY_HASH = 15; // 0x0F
  const KEY_PTT = 21;  // 0x15
  const KEY_SIDE1 = 22; // 0x16
  const KEY_SIDE2 = 23; // 0x17

  const appendLog = (entry: BleLogEntry) => {
    setLogs(prev => [...prev.slice(-200), entry]);
  };

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleConnectBle = async () => {
    try {
      setErrorBanner("");
      if (!navigator.bluetooth) {
        setErrorBanner("Web Bluetooth no está disponible en este navegador. Abre la app en Chrome o Edge (Android, Windows, Mac). Si estás en el preview iframe, haz clic en el botón de abrir en pestaña nueva (↗️ arriba a la derecha).");
        return;
      }

      const dev = new TidradioDevice();
      dev.onLog = appendLog;
      dev.onStateChange = (state) => {
        setConnected(state.connected);
        if (state.name) setDeviceName(state.name);
      };

      await dev.connect();
      deviceRef.current = dev;
      setDevice(dev);
      setConnected(true);
      setConnectionType('ble');

      // Auto-read channels on first connection if not already read
      setTimeout(() => {
        handleReadFullMemory();
      }, 600);

    } catch (err: any) {
      setErrorBanner(err.message || "Error al conectar por Bluetooth");
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'err',
        hex: 'ERROR',
        text: err.message
      });
    }
  };

  const handleConnectUsb = async () => {
    try {
      setErrorBanner("");
      if (!TidradioSerialDevice.isSupported()) {
        setErrorBanner("Web Serial API no está disponible en este navegador. Abre la app en Google Chrome, Microsoft Edge u Opera en tu Mac / PC. (En Safari no está disponible Web Serial).");
        return;
      }

      const dev = new TidradioSerialDevice();
      dev.onLog = appendLog;
      dev.onStateChange = (state) => {
        setConnected(state.connected);
        if (state.name) setDeviceName(state.name);
      };

      // 38400 baud standard for TD-H3 serial communication
      await dev.connect(38400);
      deviceRef.current = dev;
      setDevice(dev);
      setConnected(true);
      setConnectionType('usb');

      // Auto-read channels on first connection
      setTimeout(() => {
        handleReadFullMemory();
      }, 600);

    } catch (err: any) {
      if (err.message && (err.message.includes('permissions policy') || err.message.includes('disallowed') || err.message.includes('SecurityError'))) {
        setErrorBanner("EL NAVEGADOR BLOQUEA EL CABLE USB DENTRO DEL MARCO EMBEBIDO (IFRAME). Haz clic en el botón de la derecha 'Abrir en Pestaña Nueva' para conectar directamente.");
      } else {
        setErrorBanner(err.message || "Error al conectar por Cable USB-C");
      }
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'err',
        hex: 'ERROR USB',
        text: err.message
      });
    }
  };

  const handleDisconnect = () => {
    if (deviceRef.current) {
      deviceRef.current.disconnect();
      setConnected(false);
      setConnectionType(null);
      deviceRef.current = null;
      setDevice(null);
    }
  };

  // Botón presionado (Mouse/Touch)
  const handleButtonPress = async (code: number, keyLabel: string) => {
    setActiveKey(keyLabel);
    if (!deviceRef.current || !connected) {
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'info',
        hex: `TECLA [${keyLabel}]`,
        text: 'Radio no conectada. Pulsa CONECTAR arriba.'
      });
      setTimeout(() => setActiveKey(null), 150);
      return;
    }

    try {
      await sendKeyPulse(deviceRef.current, code, 120);
    } catch (err: any) {
      console.warn("Error enviando tecla", err);
    } finally {
      setTimeout(() => setActiveKey(null), 120);
    }
  };

  // Para mantener pulsado el PTT u otros botones
  const handleHoldStart = async (code: number, keyLabel: string) => {
    setActiveKey(keyLabel);
    if (!deviceRef.current || !connected) return;
    try {
      await sendKeyDown(deviceRef.current, code);
    } catch (e) {
      console.warn("Hold start error", e);
    }
  };

  const handleHoldEnd = async () => {
    setActiveKey(null);
    if (!deviceRef.current || !connected) return;
    try {
      await sendKeyUp(deviceRef.current);
    } catch (e) {
      console.warn("Hold end error", e);
    }
  };

  // Sincronizar VFO
  const handleSyncVFO = async () => {
    if (!deviceRef.current || !connected) return;
    setIsReadingVFO(true);
    try {
      const { rx, tx } = await readVFOA(deviceRef.current);
      setRxFreq(formatFrequency(rx));
      setTxFreq(formatFrequency(tx));
      setVfoWriteRx(formatFrequency(rx));
      setVfoWriteTx(formatFrequency(tx));
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'info',
        hex: `RX: ${formatFrequency(rx)} MHz · TX: ${formatFrequency(tx)} MHz`,
        text: 'Lectura VFO-A completada con éxito'
      });
    } catch (err: any) {
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'err',
        hex: 'ERR VFO',
        text: err.message
      });
    } finally {
      setIsReadingVFO(false);
    }
  };

  // Escribir nueva frecuencia en VFO
  const handleWriteVFO = async () => {
    if (!deviceRef.current || !connected) return;
    if (!memoryBuffer) {
      setErrorBanner("Primero debes leer la memoria de la radio para tener la imagen base.");
      return;
    }
    const rx = parseFloat(vfoWriteRx);
    const tx = parseFloat(vfoWriteTx);
    if (isNaN(rx) || rx < 18 || rx > 1000) {
      setVfoStatusMsg("Frecuencia RX inválida (ejemplo: 446.13125)");
      return;
    }

    setIsWritingVFO(true);
    setVfoStatusMsg("Escribiendo VFO en la memoria de la radio...");
    try {
      await writeVFOA(deviceRef.current, memoryBuffer, rx, isNaN(tx) ? rx : tx);
      setRxFreq(formatFrequency(rx));
      setTxFreq(formatFrequency(isNaN(tx) ? rx : tx));
      setVfoStatusMsg("¡Frecuencia escrita en el VFO de la radio correctamente!");
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'info',
        hex: `VFO WRITE -> ${formatFrequency(rx)} MHz`,
        text: 'VFO actualizado en la radio'
      });
    } catch (err: any) {
      setVfoStatusMsg(`Error escribiendo VFO: ${err.message}`);
    } finally {
      setIsWritingVFO(false);
    }
  };

  // Leer memoria completa (Copia de seguridad 8 KB)
  const handleReadFullMemory = async () => {
    if (!deviceRef.current || !connected) return;
    setMemProgress({ pct: 0, addr: '0x0000', status: 'Iniciando saludo con la radio...' });
    
    try {
      const mem = await leerMemoriaCompleta(deviceRef.current, (pct, addr) => {
        setMemProgress({ pct, addr, status: `Leyendo memoria... ${pct}% (${addr})` });
      });

      setMemoryBuffer(mem);
      const decoded = decodeChannels(mem);
      setChannels(decoded);

      const blob = new Blob([mem], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      setBackupUrl(url);

      setMemProgress({
        pct: 100,
        addr: '0x2000',
        status: `¡Lectura completa finalizada! Se leyeron 8 KB de memoria y ${decoded.length} canales decodificados.`
      });

      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'info',
        hex: 'MEM READ OK',
        text: `Memoria 8 KB leída. ${decoded.length} canales detectados.`
      });

    } catch (err: any) {
      setMemProgress(null);
      setErrorBanner(`Fallo al leer la memoria: ${err.message}`);
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'err',
        hex: 'MEM ERR',
        text: err.message
      });
    }
  };

  // Grabar canales a la radio física
  const handleWriteChannelsToRadio = async () => {
    if (!deviceRef.current || !connected) {
      setErrorBanner("La radio no está conectada por Bluetooth.");
      return;
    }
    if (!memoryBuffer) {
      setErrorBanner("Primero debes leer la memoria de la radio para crear la copia de seguridad.");
      return;
    }

    setWriteProgress({ pct: 0, msg: "Construyendo imagen de memoria segura..." });

    try {
      const img = new Uint8Array(memoryBuffer);

      // Limpiar todos los canales de 1 a 199 en la imagen
      for (let n = 1; n <= 199; n++) {
        const o = 16 * n;
        img.fill(0xFF, o, o + 16);
        const nomOff = 0x0D40 + 8 * (n - 1);
        img.fill(0x00, nomOff, nomOff + 8);
        
        // Limpiar bits de uso y scan
        const byteUso = 0x1900 + ((n - 1) >> 3);
        const bit = 1 << ((n - 1) & 7);
        img[byteUso] &= ~bit;
        const byteScan = 0x1920 + ((n - 1) >> 3);
        img[byteScan] &= ~bit;
      }

      // Grabar la lista actual de canales
      channels.forEach(c => {
        const n = c.n;
        if (n >= 1 && n <= 199) {
          img.set(canalABytes(c), 16 * n);
          img.set(nombreABytes(c.nom), 0x0D40 + 8 * (n - 1));
          
          // Marcar como canal usado
          img[0x1900 + ((n - 1) >> 3)] |= (1 << ((n - 1) & 7));
          
          // Incluir en scan list si está habilitado
          if (c.scan !== false) {
            img[0x1920 + ((n - 1) >> 3)] |= (1 << ((n - 1) & 7));
          }
        }
      });

      // Escribir y verificar
      const res = await grabarMemoriaSegura(deviceRef.current, memoryBuffer, img, (msg, pct) => {
        setWriteProgress({ pct, msg });
      });

      setMemoryBuffer(img);
      setSuccessNotice(`¡Grabación exitosa! Se actualizaron y verificaron ${res.bloquesEscritos} bloques en la radio.`);
      setTimeout(() => setSuccessNotice(""), 6000);

      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'info',
        hex: `ESCRIBE OK (${res.bloquesEscritos} BLQ)`,
        text: `Canales grabados y verificados en la radio`
      });

    } catch (err: any) {
      setErrorBanner(`Error grabando canales en la radio: ${err.message}`);
      appendLog({
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        dir: 'err',
        hex: 'ERR GRABAR',
        text: err.message
      });
    } finally {
      setTimeout(() => setWriteProgress(null), 2500);
    }
  };

  // Reorganizar y renumerar toda la lista de canales por sus grupos lógicos (1..N)
  const handleReorganizeAllChannels = () => {
    if (channels.length === 0) {
      setErrorBanner("No hay canales cargados para ordenar.");
      return;
    }
    const reordered = organizeAndReorderChannels(channels);
    setChannels(reordered);
    setSuccessNotice(`¡Los ${reordered.length} canales han sido ordenados por sus grupos de servicio/banda y renumerados limpiamente del 1 al ${reordered.length}!`);
  };

  // Renombrar todos los canales existentes con prefijos descriptivos claros (MAR-, AIR-, SOS-, PMR-, SAT-, HAM-)
  const handleApplyDescriptiveNoviceNames = () => {
    if (channels.length === 0) {
      setErrorBanner("No hay canales en memoria para renombrar.");
      return;
    }
    const updated = applyDescriptiveNoviceNames(channels);
    setChannels(updated);
    setSuccessNotice(`¡Nombres actualizados! Los ${updated.length} canales han sido renombrados con prefijos estandarizados (MAR-, AIR-, SOS-, PMR-, SAT-, HAM-V-, HAM-U-) para que sepas siempre para qué sirve cada canal en la pantalla LCD.`);
  };

  // Cargar preset de frecuencias a canales libres con deduplicación inteligente y ordenación por grupos
  const handleApplyPreset = (preset: ChannelPreset, forceAll: boolean = false) => {
    // 1. Análisis inteligente de duplicados contra la memoria actual
    const analysis = analyzePresetDuplication(preset, channels);

    if (!forceAll && analysis.isFullyLoaded) {
      setSuccessNotice(`¡El pack "${preset.name}" ya está 100% presente en la memoria de tu radio! No se han creado canales duplicados.`);
      setActiveTab('channels');
      return;
    }

    const channelsToAdd: PresetChannel[] = forceAll ? preset.channels : analysis.newChannels;

    if (channelsToAdd.length === 0) {
      setSuccessNotice(`Todos los canales del pack "${preset.name}" ya existen en tu radio.`);
      setActiveTab('channels');
      return;
    }

    // 2. Comprobar límite de 199 canales
    if (channels.length + channelsToAdd.length > 199) {
      setErrorBanner(`La radio admite hasta 199 canales. Tienes ${channels.length} y deseas añadir ${channelsToAdd.length}.`);
      return;
    }

    // 3. Crear los nuevos objetos de canal
    const newItems: RadioChannel[] = channelsToAdd.map((pc, idx) => ({
      n: channels.length + idx + 1,
      nom: pc.name,
      rx: pc.rx,
      tx: pc.tx || null,
      dec: pc.dec || "",
      enc: pc.enc || "",
      ancho: pc.ancho || "N",
      pot: pc.pot || "Baja 2 W",
      bcl: pc.bcl || false,
      scan: true
    }));

    let combined = [...channels, ...newItems];

    // 4. Si el auto-reordenado por grupos está activo (por defecto sí), agrupar y renumerar 1..N
    if (autoReorderGroups) {
      combined = organizeAndReorderChannels(combined);
      const skippedTxt = analysis.duplicates.length > 0 && !forceAll 
        ? ` (Omitidos ${analysis.duplicates.length} duplicados)` 
        : '';
      setSuccessNotice(`¡Pack "${preset.name}" añadido! ${channelsToAdd.length} canales incorporados a su grupo correspondiente${skippedTxt} y memoria reordenada del CH 1 al ${combined.length}.`);
    } else {
      // Si el usuario prefiere mantener posiciones, rellenar en huecos libres
      const existingNums = new Set(channels.map(c => c.n));
      const freeSlots: number[] = [];
      for (let i = 1; i <= 199; i++) {
        if (!existingNums.has(i)) freeSlots.push(i);
      }
      const placedList = [...channels];
      channelsToAdd.forEach((pc, idx) => {
        placedList.push({
          n: freeSlots[idx],
          nom: pc.name,
          rx: pc.rx,
          tx: pc.tx || null,
          dec: pc.dec || "",
          enc: pc.enc || "",
          ancho: pc.ancho || "N",
          pot: pc.pot || "Baja 2 W",
          bcl: pc.bcl || false,
          scan: true
        });
      });
      combined = placedList.sort((a, b) => a.n - b.n);
      setSuccessNotice(`¡Se han añadido ${channelsToAdd.length} canales de "${preset.name}" a la lista!`);
    }

    setChannels(combined);
    setActiveTab('channels');
  };

  // Limpiar duplicados existentes en la lista actual de canales
  const handleRemoveExistingDuplicates = () => {
    const seenFreqs = new Map<string, RadioChannel>();
    const uniqueChannels: RadioChannel[] = [];
    let dupCount = 0;

    for (const c of channels) {
      const freqKey = c.rx.toFixed(4);
      if (seenFreqs.has(freqKey)) {
        dupCount++;
      } else {
        seenFreqs.set(freqKey, c);
        uniqueChannels.push(c);
      }
    }

    if (dupCount === 0) {
      setSuccessNotice("¡No se encontraron canales duplicados! Tu memoria de radio está 100% limpia.");
      return;
    }

    const reordered = autoReorderGroups ? organizeAndReorderChannels(uniqueChannels) : uniqueChannels;
    setChannels(reordered);
    setSuccessNotice(`¡Se eliminaron ${dupCount} canales duplicados repetidos! La lista quedó organizada con ${reordered.length} canales únicos.`);
  };

  // Guardar canal editado o nuevo
  const handleSaveChannel = (ch: RadioChannel) => {
    const exists = channels.some(c => c.n === ch.n);
    let updated: RadioChannel[];
    if (exists) {
      updated = channels.map(c => c.n === ch.n ? ch : c);
    } else {
      updated = [...channels, ch];
      if (autoReorderGroups) {
        updated = organizeAndReorderChannels(updated);
      } else {
        updated.sort((a, b) => a.n - b.n);
      }
    }
    setChannels(updated);
    setEditingChannel(null);
    setIsAddingNew(false);
  };

  // Eliminar canal
  const handleDeleteChannel = (num: number) => {
    const remaining = channels.filter(c => c.n !== num);
    if (autoReorderGroups) {
      setChannels(organizeAndReorderChannels(remaining));
    } else {
      setChannels(remaining);
    }
  };

  // Cargar archivo .h3p o .csv con deduplicación inteligente y auto-agrupamiento
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isCsv = file.name.toLowerCase().endsWith('.csv');

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;
        
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setErrorBanner("El archivo CSV no contiene líneas válidas.");
          return;
        }

        const newParsedChannels: RadioChannel[] = [];
        const existingNums = new Set(channels.map(c => c.n));
        let nextFree = 1;
        const getNextFree = () => {
          while (existingNums.has(nextFree) && nextFree <= 199) nextFree++;
          const res = nextFree;
          existingNums.add(res);
          return res;
        };

        let skippedDups = 0;
        const dupNames: string[] = [];

        // Try reading CSV (CHIRP or generic)
        const header = lines[0].toLowerCase().split(',');
        const locIdx = header.findIndex(h => h.includes('loc'));
        const nameIdx = header.findIndex(h => h.includes('name'));
        const freqIdx = header.findIndex(h => h.includes('freq') || h.includes('rx'));
        const txFreqIdx = header.findIndex(h => h.includes('tx'));
        const powerIdx = header.findIndex(h => h.includes('power') || h.includes('pot'));

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length < 2) continue;

          let chName = nameIdx >= 0 ? cols[nameIdx] : cols[1] || `CH-${i}`;
          let rxVal = freqIdx >= 0 ? parseFloat(cols[freqIdx]) : parseFloat(cols[2] || cols[0]);
          if (isNaN(rxVal) || rxVal < 10 || rxVal > 1300) continue;

          // Check duplicate
          const isDup = findDuplicateChannel(channels, { rx: rxVal });
          if (isDup) {
            skippedDups++;
            dupNames.push(`${chName} (CH ${isDup.n})`);
            continue;
          }

          let assignedNum = locIdx >= 0 ? parseInt(cols[locIdx], 10) : NaN;
          if (isNaN(assignedNum) || assignedNum < 1 || assignedNum > 199 || existingNums.has(assignedNum)) {
            assignedNum = getNextFree();
          } else {
            existingNums.add(assignedNum);
          }

          let txVal: number | null = txFreqIdx >= 0 ? parseFloat(cols[txFreqIdx]) : rxVal;
          if (isNaN(txVal as number)) txVal = rxVal;

          newParsedChannels.push({
            n: assignedNum,
            nom: chName.slice(0, 8).toUpperCase(),
            rx: rxVal,
            tx: txVal,
            dec: "",
            enc: "",
            ancho: "N",
            pot: powerIdx >= 0 && cols[powerIdx].toLowerCase().includes('high') ? "Alta 5 W" : "Baja 2 W",
            bcl: false,
            scan: true
          });
        }

        if (newParsedChannels.length === 0 && skippedDups > 0) {
          setSuccessNotice(`Todos los canales del archivo CSV (${skippedDups}) ya existían en la memoria de tu radio. Se evitaron duplicados.`);
          return;
        }

        let merged = [...channels, ...newParsedChannels];
        if (autoReorderGroups) {
          merged = organizeAndReorderChannels(merged);
          const dupTxt = skippedDups > 0 ? ` (Omitidos ${skippedDups} duplicados)` : '';
          setSuccessNotice(`¡Importados ${newParsedChannels.length} canales desde CSV${dupTxt}! Todos los canales se han ordenado en sus grupos correspondientes del CH 1 al ${merged.length}.`);
        } else {
          merged.sort((a, b) => a.n - b.n);
          setSuccessNotice(`¡Importados con éxito ${newParsedChannels.length} canales desde el archivo CSV!`);
        }

        setChannels(merged);
      };
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        const u8 = new Uint8Array(buffer);
        if (u8.length < 0x1000) {
          setErrorBanner("El archivo seleccionado no parece una copia válida de TD-H3 (tamaño inferior a 4 KB).");
          return;
        }
        setMemoryBuffer(u8);
        const decoded = decodeChannels(u8);
        setChannels(decoded);
        const blob = new Blob([u8], { type: "application/octet-stream" });
        setBackupUrl(URL.createObjectURL(blob));
        setSuccessNotice(`Archivo .h3p cargado correctamente con ${decoded.length} canales.`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Ejecutar sondeo del laboratorio
  const handleRunProbe = async (probe: Probe) => {
    if (!deviceRef.current || !connected) {
      setProbeResults(prev => ({ ...prev, [probe.id]: "Error: Radio no conectada" }));
      return;
    }

    setProbeResults(prev => ({ ...prev, [probe.id]: "Enviando comando..." }));
    try {
      if (probe.readAddr !== undefined) {
        const dev = deviceRef.current;
        await saludar(dev);
        const res = await dev.sendAndExpect(
          [0x52, (probe.readAddr >> 8) & 0xFF, probe.readAddr & 0xFF, 0x20],
          36,
          2500
        );
        const data = res.slice(4, 4 + 32);
        const hexStr = Array.from(data).map((x: number) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
        setProbeResults(prev => ({
          ...prev,
          [probe.id]: `¡RESPUESTA DE FÁBRICA OK! (${data.length} bytes):\n${hexStr}`
        }));
        return;
      }

      if (probe.bytes) {
        const dev = deviceRef.current;
        const res = await dev.sendAndExpect(probe.bytes, probe.expectLen || 1, 2000);
        const hexStr = Array.from(res).map((x: number) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
        
        setProbeResults(prev => ({
          ...prev,
          [probe.id]: `Respuesta (${res.length} bytes):\n${hexStr}`
        }));
      }
    } catch (err: any) {
      setProbeResults(prev => ({
        ...prev,
        [probe.id]: `Sin respuesta (${err.message}). ${probe.fwType === 'nicFW' ? 'Normal en firmware de fábrica.' : ''}`
      }));
    }
  };

  // Enviar bytes hexadecimales libres
  const handleSendCustomHex = async () => {
    if (!deviceRef.current || !connected) {
      setCustomHexRes("Error: Radio no conectada");
      return;
    }
    const cleanBytes = customHex.trim().split(/[\s,]+/).filter(Boolean).map(x => parseInt(x, 16));
    if (!cleanBytes.length || cleanBytes.some(isNaN)) {
      setCustomHexRes("Formato inválido. Escribe bytes en hexadecimal separados por espacios (ej: 50 00 0A 00 00 00 00).");
      return;
    }

    setCustomHexRes("Enviando...");
    try {
      const dev = deviceRef.current;
      const res = await dev.sendAndExpect(new Uint8Array(cleanBytes), 1, 2500);
      const hexStr = Array.from(res).map((x: number) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      setCustomHexRes(`Respuesta de la radio (${res.length} bytes):\n${hexStr}`);
    } catch (err: any) {
      setCustomHexRes(`Sin respuesta de la radio (${err.message}).`);
    }
  };

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set());

  const handleTuneChannelToVfo = async (c: RadioChannel) => {
    setLiveState(prev => ({
      ...prev,
      vfoA: {
        ...prev.vfoA,
        rx: c.rx,
        tx: c.tx || c.rx,
        nom: c.nom,
        dec: c.dec || "",
        enc: c.enc || "",
        ancho: c.ancho,
        pot: c.pot
      },
      activeVfo: 'A',
      lastUpdated: Date.now()
    }));
    setRxFreq(c.rx.toFixed(5));
    setTxFreq((c.tx || c.rx).toFixed(5));
    setVfoWriteRx(c.rx.toFixed(5));
    setVfoWriteTx((c.tx || c.rx).toFixed(5));

    if (connected && deviceRef.current) {
      try {
        await writeVFOA(deviceRef.current, memoryBuffer, c.rx, c.tx || c.rx);
        setSuccessNotice(`⚡ Sintonizado en la radio: ${c.nom} (${c.rx.toFixed(4)} MHz)`);
      } catch (err: any) {
        setSuccessNotice(`VFO fijado a ${c.nom} (${c.rx.toFixed(4)} MHz)`);
      }
    } else {
      setSuccessNotice(`VFO fijado a ${c.nom} (${c.rx.toFixed(4)} MHz)`);
    }
  };

  const handleSelectChannel = (num: number) => {
    setSelectedChannelIds(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const handleSelectAllChannels = () => {
    if (selectedChannelIds.size === filteredChannels.length && filteredChannels.length > 0) {
      setSelectedChannelIds(new Set());
    } else {
      setSelectedChannelIds(new Set(filteredChannels.map(c => c.n)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedChannelIds.size === 0) return;
    const count = selectedChannelIds.size;
    setChannels(prev => prev.filter(c => !selectedChannelIds.has(c.n)));
    setSelectedChannelIds(new Set());
    setSuccessNotice(`Se eliminaron ${count} canales seleccionados.`);
  };

  const handleBulkSetPower = (pot: string) => {
    if (selectedChannelIds.size === 0) return;
    setChannels(prev => prev.map(c => selectedChannelIds.has(c.n) ? { ...c, pot } : c));
    setSuccessNotice(`Potencia cambiada a ${pot} en ${selectedChannelIds.size} canales.`);
  };

  const handleBulkSetScan = (scan: boolean) => {
    if (selectedChannelIds.size === 0) return;
    setChannels(prev => prev.map(c => selectedChannelIds.has(c.n) ? { ...c, scan } : c));
    setSuccessNotice(`Scan fijado a ${scan ? 'SÍ' : 'NO'} en ${selectedChannelIds.size} canales.`);
  };

  const handleExportSelectedCsv = () => {
    const list = selectedChannelIds.size > 0 
      ? channels.filter(c => selectedChannelIds.has(c.n)) 
      : channels;
    if (list.length === 0) return;

    let csv = "Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Power\n";
    for (const c of list) {
      const isDuplex = c.tx !== null && c.tx !== c.rx;
      const duplexStr = isDuplex ? (c.tx! > c.rx ? "+" : "-") : "";
      const offset = isDuplex ? Math.abs(c.tx! - c.rx).toFixed(4) : "0.0000";
      csv += `${c.n},"${c.nom}",${c.rx.toFixed(5)},${duplexStr},${offset},${c.enc ? "Tone" : "None"},${c.enc || "88.5"},${c.enc || "88.5"},023,NN,FM,12.50,${c.scan ? "" : "S"},${c.pot === 'Alta 5 W' ? 'High' : 'Low'}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `td-h3-canales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setSuccessNotice(`Exportados ${list.length} canales a CSV correctamente.`);
  };

  const filteredChannels = channels.filter(c => {
    const matchesSearch = 
      c.nom.toLowerCase().includes(channelFilter.toLowerCase()) ||
      c.n.toString().includes(channelFilter) ||
      formatFrequency(c.rx).includes(channelFilter);
    
    if (!matchesSearch) return false;

    if (selectedCategoryFilter === 'ALL') return true;
    const cat = getChannelCategoryInfo(c);
    if (selectedCategoryFilter === 'PMR') return cat.key === 'pmr';
    if (selectedCategoryFilter === 'MARINE') return cat.key === 'marine';
    if (selectedCategoryFilter === 'AIR') return cat.key === 'air';
    if (selectedCategoryFilter === 'SOS') return cat.key === 'sos';
    if (selectedCategoryFilter === 'HAM-VHF') return cat.key === 'ham_vhf';
    if (selectedCategoryFilter === 'HAM-UHF') return cat.key === 'ham_uhf';
    if (selectedCategoryFilter === 'SPACE') return cat.key === 'space';
    if (selectedCategoryFilter === 'REPEATER') return cat.key === 'repeater';
    return true;
  });

  // Agrupación de canales por su categoría/banda correspondiente
  const groupedChannels = React.useMemo(() => {
    const map = new Map<string, { info: ChannelCategoryInfo; list: RadioChannel[] }>();

    for (const c of filteredChannels) {
      const info = getChannelCategoryInfo(c);
      if (!map.has(info.key)) {
        map.set(info.key, { info, list: [] });
      }
      map.get(info.key)!.list.push(c);
    }

    return Array.from(map.values()).sort((a, b) => a.info.order - b.info.order);
  }, [filteredChannels]);

  return (
    <div className="min-h-screen bg-[#0d0f12] text-zinc-200 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Hidden file input for .h3p / .csv restore */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".h3p,.bin,.dat,.csv" 
        className="hidden" 
      />

      {/* Tactical Cockpit Telemetry Avionics Header */}
      <TacticalCockpitHeader
        connected={connected}
        connectionType={connectionType}
        deviceName={deviceName}
        batteryPct={liveState.batteryPct}
        batteryVolts={liveState.batteryVolts}
        currentTheme={currentTheme}
        onThemeChange={setCurrentTheme}
        activeVfo={liveState.activeVfo}
        dualWatch={liveState.dualWatch}
        onConnectUsb={handleConnectUsb}
        onConnectBle={handleConnectBle}
        onDisconnect={handleDisconnect}
      />

      {/* Clarification Box: Protocol Reality Banner */}
      <div className="bg-[#111622] border-b border-cyan-500/20 px-4 md:px-8 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-zinc-300">
            <b className="text-white">Motor Dual de Protocolo:</b> Soporte 100% para Firmware Oficial (199 canales EEPROM) y modo Live Remote para <b>nicFW V2</b>.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('firmware')}
            className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Guía nicFW & Flasher Web</span>
          </button>
          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800 font-mono shrink-0 hidden lg:inline">
            Servicio 0xFF00 · 0xFF01 (RX) / 0xFF02 (TX)
          </span>
        </div>
      </div>

      {/* Error / Alert banner */}
      {errorBanner && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-center">
            {errorBanner.includes('IFRAME') && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex items-center gap-1.5 transition shadow cursor-pointer shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir en Pestaña Nueva</span>
              </a>
            )}
            <button 
              onClick={() => setErrorBanner("")} 
              className="text-amber-400 hover:text-white font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Success banner */}
      {successNotice && (
        <div className="bg-emerald-950/70 border-b border-emerald-500/40 px-4 py-2.5 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button 
            onClick={() => setSuccessNotice("")} 
            className="text-emerald-400 hover:text-white font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-zinc-800 bg-[#15171d] px-4 md:px-8 flex space-x-1 overflow-x-auto">
        {[
          { id: 'panel', label: 'Pantalla y Control en Vivo (LCD Mirror)', icon: Radio },
          { id: 'channels', label: 'Gestor de Canales (CPS)', icon: Layers, count: channels.length },
          { id: 'presets', label: 'Packs de Frecuencias (1 Clic)', icon: Sparkles },
          { id: 'vfo', label: 'Sintonizador VFO', icon: RadioTower },
          { id: 'firmware', label: 'Firmware nicFW & Flasher', icon: Cpu },
          { id: 'lab', label: 'Laboratorio de Sondeos', icon: Zap },
          { id: 'log', label: 'Tráfico BLE en Vivo', icon: Terminal, count: logs.length }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive 
                  ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' 
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-zinc-800 text-[10px] rounded-full text-zinc-300 font-mono">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
        
        {/* TAB 1: GESTOR DE CANALES (CPS) */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            
            {/* Top Toolbar */}
            <div className="bg-[#15171d] border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  Canales Programados en la Radio
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Edita, organiza por grupos de bandas y grábalos directamente a la EEPROM de tu TIDRADIO TD-H3 Plus.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <button
                  onClick={handleReadFullMemory}
                  disabled={!connected || (memProgress !== null && memProgress.pct < 100)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
                >
                  <RefreshCw className={`w-4 h-4 ${memProgress && memProgress.pct < 100 ? 'animate-spin' : ''}`} />
                  {memProgress && memProgress.pct < 100 ? 'Leyendo...' : 'Releer Radio'}
                </button>

                <button
                  onClick={handleWriteChannelsToRadio}
                  disabled={!connected || !memoryBuffer || (writeProgress !== null)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20"
                >
                  <Radio className="w-4 h-4" />
                  GRABAR EN LA RADIO
                </button>

                <button
                  onClick={handleReorganizeAllChannels}
                  disabled={channels.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-900/60 to-purple-900/60 hover:from-indigo-800/80 hover:to-purple-800/80 text-indigo-200 text-xs font-bold rounded-xl transition cursor-pointer border border-indigo-500/40 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Agrupar todos los canales por su servicio/banda correspondiente y renumerar 1..N"
                >
                  <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
                  Reordenar por Grupos (1..{channels.length})
                </button>

                <button
                  onClick={handleApplyDescriptiveNoviceNames}
                  disabled={channels.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-950/80 via-blue-950/80 to-purple-950/80 hover:from-cyan-900 hover:to-purple-900 text-cyan-200 text-xs font-bold rounded-xl transition cursor-pointer border border-cyan-500/40 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Renombra automáticamente todos los canales con prefijos claros y descriptivos (MAR- para mar, AIR- para aviones, SOS- para rescate/montaña, PMR- para walkies, SAT- para satélites, HAM- para radioafición)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  Nombres Descriptivos Novato (MAR, AIR, SOS...)
                </button>

                <button
                  onClick={() => setAutoReorderGroups(!autoReorderGroups)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-xl transition border cursor-pointer ${
                    autoReorderGroups 
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' 
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                  title="Al subir presets o CSV, los canales se ubican automáticamente en su grupo y se renumera la lista"
                >
                  <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                  Auto-agrupar: <span className="font-mono font-bold">{autoReorderGroups ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => {
                    const existing = new Set(channels.map(c => c.n));
                    let free = 1;
                    while (existing.has(free) && free <= 199) free++;
                    setEditingChannel({
                      n: free,
                      nom: `CH-${free}`,
                      rx: 145.5000,
                      tx: 145.5000,
                      dec: "",
                      enc: "",
                      ancho: "W",
                      pot: "Alta 5 W",
                      bcl: false,
                      scan: true
                    });
                    setIsAddingNew(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-xs font-bold rounded-xl transition cursor-pointer border border-zinc-700"
                >
                  <PlusCircle className="w-4 h-4 text-cyan-400" />
                  Añadir Canal
                </button>

                {duplicateChannelCount > 0 && (
                  <button
                    onClick={handleRemoveExistingDuplicates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold rounded-xl transition cursor-pointer border border-amber-500/40 animate-pulse"
                    title="Eliminar frecuencias repetidas de la lista"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                    Limpiar {duplicateChannelCount} {duplicateChannelCount === 1 ? 'duplicado' : 'duplicados'}
                  </button>
                )}

                {backupUrl && (
                  <a
                    href={backupUrl}
                    download={`td-h3-backup-${new Date().toISOString().slice(0, 10)}.h3p`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer border border-zinc-700"
                    title="Descargar copia de seguridad intacta"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .h3p
                  </a>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer border border-zinc-700"
                  title="Importar archivo de canales (.csv o .h3p)"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar CSV / H3P
                </button>
              </div>
            </div>

            {/* Read / Write Progress */}
            {memProgress && (
              <div className="p-4 bg-[#0e1014] border border-blue-500/30 rounded-xl space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-300">{memProgress.status}</span>
                  <span className="text-cyan-400 font-bold">{memProgress.pct}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-200"
                    style={{ width: `${memProgress.pct}%` }}
                  />
                </div>
              </div>
            )}

            {writeProgress && (
              <div className="p-4 bg-[#0e1014] border border-emerald-500/30 rounded-xl space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-emerald-300 font-bold">{writeProgress.msg}</span>
                  <span className="text-emerald-400 font-bold">{writeProgress.pct}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-200"
                    style={{ width: `${writeProgress.pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-zinc-500 text-[11px] font-mono mr-1 flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5" />
                Filtrar:
              </span>
              {[
                { id: 'ALL', label: 'Todos', count: channels.length, icon: Layers },
                { id: 'PMR', label: '📻 PMR446 (Libres)', count: channels.filter(c => getChannelCategoryInfo(c).key === 'pmr').length },
                { id: 'MARINE', label: '⚓ Marina / Barcos', count: channels.filter(c => getChannelCategoryInfo(c).key === 'marine').length },
                { id: 'AIR', label: '✈️ Aviación Civil', count: channels.filter(c => getChannelCategoryInfo(c).key === 'air').length },
                { id: 'SOS', label: '🚨 Emergencias / Montaña', count: channels.filter(c => getChannelCategoryInfo(c).key === 'sos').length },
                { id: 'SPACE', label: '🛰️ Satélites / ISS', count: channels.filter(c => getChannelCategoryInfo(c).key === 'space').length },
                { id: 'HAM-VHF', label: '🟢 Ham VHF 2m', count: channels.filter(c => getChannelCategoryInfo(c).key === 'ham_vhf').length },
                { id: 'HAM-UHF', label: '🔵 Ham UHF 70cm', count: channels.filter(c => getChannelCategoryInfo(c).key === 'ham_uhf').length },
                { id: 'REPEATER', label: '📡 Repetidores', count: channels.filter(c => getChannelCategoryInfo(c).key === 'repeater').length },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border text-xs ${
                    selectedCategoryFilter === cat.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                      : 'bg-[#121418] hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    selectedCategoryFilter === cat.id ? 'bg-cyan-500/30 text-cyan-200' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Filter Search, View Mode and Bulk Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <input
                type="text"
                value={channelFilter}
                onChange={e => setChannelFilter(e.target.value)}
                placeholder="Buscar por número, nombre, banda o frecuencia (ej. 145.5, PMR, Marina)..."
                className="max-w-md w-full bg-[#111317] border border-zinc-700 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
              
              <div className="flex items-center gap-3">
                {/* View Switcher */}
                <div className="flex items-center bg-[#121418] p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setChannelViewLayout('grouped')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition cursor-pointer ${
                      channelViewLayout === 'grouped'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Ver canales organizados en grupos de bandas"
                  >
                    <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
                    Vista por Grupos ({groupedChannels.length})
                  </button>
                  <button
                    onClick={() => setChannelViewLayout('flat')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition cursor-pointer ${
                      channelViewLayout === 'flat'
                        ? 'bg-zinc-700 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Ver lista corrida secuencial"
                  >
                    <ListFilter className="w-3.5 h-3.5 text-zinc-400" />
                    Lista Continua
                  </button>
                </div>

                <span className="text-xs text-zinc-400 font-mono">
                  {filteredChannels.length} de {channels.length} canales
                </span>
              </div>
            </div>

            {/* Batch Selection Action Bar (Appears when items are selected) */}
            {selectedChannelIds.size > 0 && (
              <div className="bg-gradient-to-r from-blue-950/90 via-indigo-950/90 to-cyan-950/90 border border-cyan-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-cyan-500 text-black font-bold font-mono rounded-lg">
                    {selectedChannelIds.size} seleccionados
                  </span>
                  <span className="text-zinc-300 font-medium">Acciones por lote:</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={() => handleBulkSetPower('Alta 5 W')}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 rounded-lg font-semibold cursor-pointer transition"
                  >
                    Fijar 5W
                  </button>
                  <button
                    onClick={() => handleBulkSetPower('Baja 2 W')}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 rounded-lg font-semibold cursor-pointer transition"
                  >
                    Fijar 2W
                  </button>
                  <button
                    onClick={() => handleBulkSetScan(true)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 rounded-lg font-semibold cursor-pointer transition"
                  >
                    Scan ON
                  </button>
                  <button
                    onClick={() => handleBulkSetScan(false)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 rounded-lg font-semibold cursor-pointer transition"
                  >
                    Scan OFF
                  </button>
                  <button
                    onClick={handleExportSelectedCsv}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-zinc-700 rounded-lg font-semibold cursor-pointer transition flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Exportar CSV
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-2.5 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/60 rounded-lg font-semibold cursor-pointer transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Eliminar
                  </button>
                  <button
                    onClick={() => setSelectedChannelIds(new Set())}
                    className="px-2 py-1 text-zinc-400 hover:text-white cursor-pointer ml-1"
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible Novice Prefix Reference Guide (Folded by Default) */}
            <CollapsibleSection
              title="Guía de Prefijos Descriptivos para Novatos (MAR, AIR, SOS, PMR, SAT, HAM)"
              subtitle="Consulta el significado de cada prefijo y las bandas legales en España y Europa"
              icon={Sparkles}
              badge="Guía Rápida"
              badgeColor="bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#0b0c10] border border-cyan-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300 font-mono text-xs">⚓ MAR- (Marina Náutica)</span>
                    <span className="text-[10px] text-zinc-500 font-mono">156.000 - 162.025 MHz</span>
                  </div>
                  <p className="text-zinc-300 text-xs">Barcos, puertos y salvamento marítimo. El <b>MAR-16 (156.800 MHz)</b> es el canal internacional de llamada de socorro (Mayday).</p>
                </div>

                <div className="bg-[#0b0c10] border border-sky-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-300 font-mono text-xs">✈️ AIR- (Banda Aérea AM)</span>
                    <span className="text-[10px] text-zinc-500 font-mono">108.000 - 137.000 MHz</span>
                  </div>
                  <p className="text-zinc-300 text-xs">Comunicaciones de aviones con torres de control y aproximación. <b>AIR-EMERG (121.500 MHz)</b> es la frecuencia internacional de emergencia aeronáutica (Solo RX).</p>
                </div>

                <div className="bg-[#0b0c10] border border-red-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-300 font-mono text-xs">🚨 SOS- (Emergencias y Rescate)</span>
                    <span className="text-[10px] text-zinc-500 font-mono">PMR Canal 7-7 / REMER</span>
                  </div>
                  <p className="text-zinc-300 text-xs">Seguridad en montaña y rescate. <b>SOS-MNTN (446.08125 MHz con subtono 85.4 Hz)</b> es la iniciativa Canal 7-7 usada por senderistas y montañeros.</p>
                </div>

                <div className="bg-[#0b0c10] border border-amber-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300 font-mono text-xs">📻 PMR- (Walkies de Uso Libre)</span>
                    <span className="text-[10px] text-zinc-500 font-mono">446.00625 - 446.19375 MHz</span>
                  </div>
                  <p className="text-zinc-300 text-xs">Walkies estándar de 16 canales legales sin necesidad de licencia de radioaficionado. Ideales para uso recreativo, eventos o trabajo.</p>
                </div>

                <div className="bg-[#0b0c10] border border-purple-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300 font-mono text-xs">🛰️ SAT- (Satélites y Estación Espacial)</span>
                    <span className="text-[10px] text-zinc-500 font-mono">137 MHz & 145.800 MHz</span>
                  </div>
                  <p className="text-zinc-300 text-xs">Recepción de imágenes meteorológicas directas de satélites NOAA (137.100, 137.9125) y voz de astronautas de la ISS en 145.800 MHz.</p>
                </div>

                <div className="bg-[#0b0c10] border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300 font-mono text-xs">🟢 HAM- (Radioaficionados VHF/UHF)</span>
                    <span className="text-[10px] text-zinc-500 font-mono">144-146 & 430-440 MHz</span>
                  </div>
                  <p className="text-zinc-300 text-xs">Canales de llamada directa (145.500 / 433.500) y repetidores analógicos con desplazamiento estándar (-0.600 MHz / -7.600 MHz).</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Channels Table / Groups */}
            {channels.length === 0 ? (
              <div className="p-12 text-center bg-[#15171d] border border-zinc-800 rounded-2xl space-y-3">
                <Layers className="w-8 h-8 text-zinc-600 mx-auto" />
                <h3 className="text-sm font-bold text-zinc-300">No hay canales cargados</h3>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  {connected 
                    ? 'Pulsa "Releer Radio" arriba para descargar la memoria actual o ve a "Packs de Frecuencias" para cargar listas automáticas organizadas.' 
                    : 'Conecta tu TD-H3 Plus por Bluetooth para leer sus canales.'}
                </p>
              </div>
            ) : channelViewLayout === 'grouped' ? (
              /* VISTA POR GRUPOS / BANDAS */
              <div className="space-y-6">
                {groupedChannels.map(grp => {
                  const firstNum = Math.min(...grp.list.map(c => c.n));
                  const lastNum = Math.max(...grp.list.map(c => c.n));
                  return (
                    <div key={grp.info.key} className="border border-zinc-800 rounded-2xl bg-[#15171d] overflow-hidden shadow-lg">
                      {/* Group Header */}
                      <div className="bg-[#121418] border-b border-zinc-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border font-sans ${grp.info.badgeColor}`}>
                            {grp.info.name}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {grp.info.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                            CH {firstNum} {firstNum !== lastNum ? `a ${lastNum}` : ''}
                          </span>
                          <span className="text-[11px] text-zinc-400 font-mono">
                            {grp.list.length} {grp.list.length === 1 ? 'canal' : 'canales'}
                          </span>
                        </div>
                      </div>

                      {/* Group Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-[#0e1014] text-zinc-400 border-b border-zinc-800/80">
                            <tr>
                              <th className="py-2.5 px-3 w-8">
                                <input
                                  type="checkbox"
                                  checked={grp.list.length > 0 && grp.list.every(c => selectedChannelIds.has(c.n))}
                                  onChange={() => {
                                    const allSelected = grp.list.every(c => selectedChannelIds.has(c.n));
                                    setSelectedChannelIds(prev => {
                                      const next = new Set(prev);
                                      grp.list.forEach(c => {
                                        if (allSelected) next.delete(c.n);
                                        else next.add(c.n);
                                      });
                                      return next;
                                    });
                                  }}
                                  className="rounded bg-zinc-800 border-zinc-700 text-cyan-500"
                                />
                              </th>
                              <th className="py-2.5 px-3 w-10">CH</th>
                              <th className="py-2.5 px-4">Nombre LCD</th>
                              <th className="py-2.5 px-4 min-w-[200px]">¿Para qué sirve? (Guía Novato)</th>
                              <th className="py-2.5 px-4">RX Frec (MHz)</th>
                              <th className="py-2.5 px-4">TX Frec (MHz)</th>
                              <th className="py-2.5 px-4">Subtono</th>
                              <th className="py-2.5 px-4">Ancho</th>
                              <th className="py-2.5 px-4">Pot.</th>
                              <th className="py-2.5 px-4">Scan</th>
                              <th className="py-2.5 px-4 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 bg-[#0c0e12]">
                            {grp.list.map(c => {
                              const novice = getChannelNoviceExplanation(c);
                              const isSelected = selectedChannelIds.has(c.n);
                              return (
                                <tr key={c.n} className={`hover:bg-zinc-800/30 transition ${isSelected ? 'bg-cyan-950/20' : ''}`}>
                                  <td className="py-2 px-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleSelectChannel(c.n)}
                                      className="rounded bg-zinc-800 border-zinc-700 text-cyan-500"
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-cyan-400 font-bold">{c.n}</td>
                                  <td className="py-2 px-4 font-sans">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border shrink-0 ${novice.badgeClass}`}>
                                        {novice.prefix}
                                      </span>
                                      <span className="text-white font-bold tracking-wide font-mono text-xs">{c.nom}</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 font-sans">
                                    <div className="text-zinc-200 font-medium text-xs leading-snug">{novice.purpose}</div>
                                    <div className="text-[10px] text-zinc-400 font-sans mt-0.5">{novice.tip}</div>
                                  </td>
                                  <td className="py-2 px-4 text-zinc-200 font-mono font-semibold">{formatFrequency(c.rx)}</td>
                                  <td className="py-2 px-4 text-zinc-400 font-mono">
                                    {c.tx ? formatFrequency(c.tx) : <span className="text-amber-400/80 font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/50">Solo RX</span>}
                                  </td>
                                  <td className="py-2 px-4 text-zinc-400">
                                    {c.enc || c.dec ? (
                                      <span className="text-[11px] text-zinc-300 font-mono">
                                        {c.enc ? `TX:${c.enc}` : ''} {c.dec ? `RX:${c.dec}` : ''}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-zinc-400">{c.ancho}</td>
                                  <td className="py-2 px-4 text-zinc-400">{c.pot === 'Alta 5 W' ? '5W' : '2W'}</td>
                                  <td className="py-2 px-4 text-zinc-400">{c.scan === null ? '—' : c.scan ? 'Sí' : 'No'}</td>
                                  <td className="py-2 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => handleTuneChannelToVfo(c)}
                                        className="p-1.5 hover:bg-cyan-950/50 rounded-lg text-yellow-400 hover:text-yellow-300 transition cursor-pointer"
                                        title={`⚡ Sintonizar ${formatFrequency(c.rx)} MHz directo al VFO`}
                                      >
                                        <Zap className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingChannel({ ...c });
                                          setIsAddingNew(false);
                                        }}
                                        className="p-1.5 hover:bg-zinc-700 rounded-lg text-cyan-400 transition cursor-pointer"
                                        title="Editar canal"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteChannel(c.n)}
                                        className="p-1.5 hover:bg-red-950/50 rounded-lg text-red-400 transition cursor-pointer"
                                        title="Eliminar canal"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VISTA LISTA CONTINUA */
              <div className="overflow-x-auto border border-zinc-800 rounded-2xl bg-[#15171d] shadow-lg">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#121418] text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-3 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={filteredChannels.length > 0 && filteredChannels.every(c => selectedChannelIds.has(c.n))}
                          onChange={handleSelectAllChannels}
                          className="rounded bg-zinc-800 border-zinc-700 text-cyan-500"
                        />
                      </th>
                      <th className="py-3 px-3 w-10">CH</th>
                      <th className="py-3 px-4">Grupo</th>
                      <th className="py-3 px-4">Nombre LCD</th>
                      <th className="py-3 px-4 min-w-[200px]">¿Para qué sirve? (Guía Novato)</th>
                      <th className="py-3 px-4">RX Frec (MHz)</th>
                      <th className="py-3 px-4">TX Frec (MHz)</th>
                      <th className="py-3 px-4">Subtono</th>
                      <th className="py-3 px-4">Ancho</th>
                      <th className="py-3 px-4">Pot.</th>
                      <th className="py-3 px-4">Scan</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-[#0c0e12]">
                    {filteredChannels.map(c => {
                      const catInfo = getChannelCategoryInfo(c);
                      const novice = getChannelNoviceExplanation(c);
                      const isSelected = selectedChannelIds.has(c.n);
                      return (
                        <tr key={c.n} className={`hover:bg-zinc-800/30 transition ${isSelected ? 'bg-cyan-950/20' : ''}`}>
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectChannel(c.n)}
                              className="rounded bg-zinc-800 border-zinc-700 text-cyan-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-cyan-400 font-bold">{c.n}</td>
                          <td className="py-2.5 px-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-sans font-semibold border ${catInfo.badgeColor}`}>
                              {catInfo.name}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-sans">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border shrink-0 ${novice.badgeClass}`}>
                                {novice.prefix}
                              </span>
                              <span className="text-white font-bold tracking-wide font-mono text-xs">{c.nom}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-sans">
                            <div className="text-zinc-200 font-medium text-xs leading-snug">{novice.purpose}</div>
                            <div className="text-[10px] text-zinc-400 font-sans mt-0.5">{novice.tip}</div>
                          </td>
                          <td className="py-2.5 px-4 text-zinc-200 font-mono font-semibold">{formatFrequency(c.rx)}</td>
                          <td className="py-2.5 px-4 text-zinc-400 font-mono">
                            {c.tx ? formatFrequency(c.tx) : <span className="text-amber-400/80 font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/50">Solo RX</span>}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-400">
                            {c.enc || c.dec ? (
                              <span className="text-[11px] text-zinc-300 font-mono">
                                {c.enc ? `TX:${c.enc}` : ''} {c.dec ? `RX:${c.dec}` : ''}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-400">{c.ancho}</td>
                          <td className="py-2.5 px-4 text-zinc-400">{c.pot === 'Alta 5 W' ? '5W' : '2W'}</td>
                          <td className="py-2.5 px-4 text-zinc-400">{c.scan === null ? '—' : c.scan ? 'Sí' : 'No'}</td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleTuneChannelToVfo(c)}
                                className="p-1.5 hover:bg-cyan-950/50 rounded-lg text-yellow-400 hover:text-yellow-300 transition cursor-pointer"
                                title={`⚡ Sintonizar ${formatFrequency(c.rx)} MHz directo al VFO`}
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingChannel({ ...c });
                                  setIsAddingNew(false);
                                }}
                                className="p-1.5 hover:bg-zinc-700 rounded-lg text-cyan-400 transition cursor-pointer"
                                title="Editar canal"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteChannel(c.n)}
                                className="p-1.5 hover:bg-red-950/50 rounded-lg text-red-400 transition cursor-pointer"
                                title="Eliminar canal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Modal de Edición de Canal con Asistente Descriptivo para Novatos */}
            {editingChannel && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#15171d] border border-zinc-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-cyan-400" />
                        {isAddingNew ? 'Añadir Nuevo Canal' : `Editar Canal #${editingChannel.n}`}
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Configuración de canal con nombres descriptivos para novatos (MAR-, AIR-, SOS-, PMR-, SAT-, HAM-)
                      </p>
                    </div>
                    <button 
                      onClick={() => setEditingChannel(null)}
                      className="text-zinc-500 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Asistente y Explicación en Tiempo Real */}
                  {(() => {
                    const currentNovice = getChannelNoviceExplanation(editingChannel);
                    return (
                      <div className="bg-[#0e1014] border border-zinc-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-cyan-400" />
                            Guía y Uso de este canal:
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const autoName = currentNovice.descriptiveLcdName;
                              setEditingChannel({ ...editingChannel, nom: autoName });
                            }}
                            className="text-[10px] px-2 py-0.5 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 rounded font-semibold transition cursor-pointer flex items-center gap-1"
                            title="Rellenar automáticamente el nombre más descriptivo según la frecuencia"
                          >
                            <Sparkles className="w-3 h-3 text-yellow-400" />
                            Auto-nombrar como "{currentNovice.descriptiveLcdName}"
                          </button>
                        </div>
                        <p className="text-xs text-white font-medium">{currentNovice.purpose}</p>
                        <p className="text-[11px] text-zinc-400">{currentNovice.tip}</p>
                      </div>
                    );
                  })()}

                  {/* Botones de Prefijos Rápidos */}
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Prefijos Descriptivos Rápidos (haz clic para insertar en el nombre):</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { prefix: 'MAR-', label: '⚓ MAR (Marina)', tip: 'Barcos y náutica' },
                        { prefix: 'AIR-', label: '✈️ AIR (Aviación)', tip: 'Aviones y torres VHF AM' },
                        { prefix: 'SOS-', label: '🚨 SOS (Emergencia)', tip: 'Rescate, Canal 7-7' },
                        { prefix: 'PMR-', label: '📻 PMR (Walkies)', tip: 'Uso libre sin licencia' },
                        { prefix: 'SAT-', label: '🛰️ SAT (Satélites)', tip: 'NOAA e ISS' },
                        { prefix: 'HAM-V', label: '🟢 HAM-V (2m)', tip: 'Radioafición 145 MHz' },
                        { prefix: 'HAM-U', label: '🔵 HAM-U (70cm)', tip: 'Radioafición 430 MHz' }
                      ].map(p => (
                        <button
                          key={p.prefix}
                          type="button"
                          onClick={() => {
                            let cleanNom = editingChannel.nom.replace(/^(MAR|AIR|SOS|PMR|SAT|HAM-V|HAM-U|HAM)[-_]?/i, '');
                            const newNom = `${p.prefix}${cleanNom}`.slice(0, 8).toUpperCase();
                            setEditingChannel({ ...editingChannel, nom: newNom });
                          }}
                          className="px-2 py-1 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-[10px] rounded-lg text-zinc-200 font-mono transition cursor-pointer"
                          title={p.tip}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-zinc-400 mb-1">Número de Canal (1-199)</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="199"
                        value={editingChannel.n} 
                        onChange={e => setEditingChannel({ ...editingChannel, n: parseInt(e.target.value) || 1 })}
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Nombre en LCD (Máx 8 letras)</label>
                      <input 
                        type="text" 
                        maxLength={8}
                        value={editingChannel.nom} 
                        onChange={e => setEditingChannel({ ...editingChannel, nom: e.target.value.toUpperCase() })}
                        placeholder="Ej. MAR-16"
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white font-mono font-bold tracking-wider"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Frecuencia RX (MHz)</label>
                      <input 
                        type="number" 
                        step="0.00001"
                        value={editingChannel.rx} 
                        onChange={e => setEditingChannel({ ...editingChannel, rx: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Frecuencia TX (MHz)</label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          step="0.00001"
                          disabled={editingChannel.tx === null}
                          value={editingChannel.tx !== null ? editingChannel.tx : ""} 
                          onChange={e => setEditingChannel({ ...editingChannel, tx: parseFloat(e.target.value) || 0 })}
                          placeholder={editingChannel.tx === null ? "Inhibida" : "MHz"}
                          className="flex-1 bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white font-mono disabled:opacity-30"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingChannel({ ...editingChannel, tx: editingChannel.tx === null ? editingChannel.rx : null })}
                          className={`px-2 text-[10px] font-bold rounded-lg border cursor-pointer ${
                            editingChannel.tx === null ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {editingChannel.tx === null ? 'Solo RX' : 'Permitir TX'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Subtono RX (ej. 88.5 o DCS 023N)</label>
                      <input 
                        type="text" 
                        value={editingChannel.dec} 
                        onChange={e => setEditingChannel({ ...editingChannel, dec: e.target.value })}
                        placeholder="Sin subtono"
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Subtono TX (ej. 77.0 o DCS 023N)</label>
                      <input 
                        type="text" 
                        value={editingChannel.enc} 
                        onChange={e => setEditingChannel({ ...editingChannel, enc: e.target.value })}
                        placeholder="Sin subtono"
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Potencia</label>
                      <select 
                        value={editingChannel.pot} 
                        onChange={e => setEditingChannel({ ...editingChannel, pot: e.target.value })}
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white"
                      >
                        <option value="Baja 2 W">Baja (2 W)</option>
                        <option value="Alta 5 W">Alta (5 W)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Ancho de Banda</label>
                      <select 
                        value={editingChannel.ancho} 
                        onChange={e => setEditingChannel({ ...editingChannel, ancho: e.target.value })}
                        className="w-full bg-[#0b0c10] border border-zinc-700 rounded-lg p-2 text-white"
                      >
                        <option value="N">Estrecho (Narrow 12.5 kHz)</option>
                        <option value="W">Ancho (Wide 25 kHz)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                    <button
                      onClick={() => setEditingChannel(null)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleSaveChannel(editingChannel)}
                      className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-cyan-600/30"
                    >
                      Guardar Canal
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 2: PACKS DE FRECUENCIAS PREDEFINIDAS */}
        {activeTab === 'presets' && (
          <div className="space-y-6">
            <div className="bg-[#15171d] border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                    Packs de Frecuencias con Nombres Descriptivos para Novatos
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Selecciona cualquier colección de frecuencias. Los canales ya vienen con nombres muy claros y descriptivos (MAR-, AIR-, SOS-, PMR-, SAT-, HAM-) listos para la pantalla de tu radio.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAutoReorderGroups(!autoReorderGroups)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                      autoReorderGroups 
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' 
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                    Auto-ordenar en sus grupos: <span className="font-mono font-bold">{autoReorderGroups ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>

              {/* Guía Rápida de Prefijos para Novatos (Plegable) */}
              <CollapsibleSection
                title="Guía de Prefijos Descriptivos Rápidos (MAR, AIR, SOS, PMR, SAT, HAM)"
                subtitle="Consulta las características de cada colección predefinida"
                icon={Sparkles}
                badge="Referencia"
                badgeColor="bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                defaultOpen={false}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  <div className="bg-cyan-950/30 border border-cyan-800/30 rounded-lg p-2">
                    <div className="font-bold text-cyan-300 font-mono text-[11px]">⚓ MAR-</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Mar y náutica (CH16 socorro, puertos)</div>
                  </div>
                  <div className="bg-sky-950/30 border border-sky-800/30 rounded-lg p-2">
                    <div className="font-bold text-sky-300 font-mono text-[11px]">✈️ AIR-</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Aviación civil (Torre, aprox, 121.5 AM)</div>
                  </div>
                  <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-2">
                    <div className="font-bold text-red-300 font-mono text-[11px]">🚨 SOS-</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Emergencias (Canal 7-7 Montaña, REMER)</div>
                  </div>
                  <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg p-2">
                    <div className="font-bold text-amber-300 font-mono text-[11px]">📻 PMR-</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Walkies libres sin licencia (446 MHz)</div>
                  </div>
                  <div className="bg-purple-950/30 border border-purple-800/30 rounded-lg p-2">
                    <div className="font-bold text-purple-300 font-mono text-[11px]">🛰️ SAT-</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Satélites NOAA y Estación Espacial ISS</div>
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-2">
                    <div className="font-bold text-emerald-300 font-mono text-[11px]">🟢 HAM-</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Radioaficionados (Repetidores VHF/UHF)</div>
                  </div>
                </div>
              </CollapsibleSection>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {PRESETS_FRECUENCIAS.map(preset => {
                  const analysis = analyzePresetDuplication(preset, channels);
                  const isFullyLoaded = analysis.isFullyLoaded;
                  const hasDuplicates = analysis.duplicates.length > 0;

                  return (
                    <div key={preset.id} className="bg-[#0f1115] border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 flex flex-col justify-between transition">
                      <div>
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40">
                              {preset.category}
                            </span>
                            <h3 className="text-sm font-bold text-white mt-1.5">{preset.name}</h3>
                          </div>
                          
                          {/* Smart Status Badge */}
                          {isFullyLoaded ? (
                            <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              100% en Radio ({preset.channels.length})
                            </span>
                          ) : hasDuplicates ? (
                            <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                              {analysis.duplicates.length} en radio · {analysis.newChannels.length} nuevos
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1 shrink-0">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                              {preset.channels.length} canales
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-400 mb-3 leading-relaxed">{preset.desc}</p>
                        
                        {/* Interactive Channel Chips showing exact memory matches & descriptive novice purpose */}
                        <div className="bg-[#090a0d] rounded-xl p-3 border border-zinc-800/80 mb-4 font-mono text-[11px] flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                          {preset.channels.map(c => {
                            const duplicateInfo = analysis.duplicates.find(d => Math.abs(d.channel.rx - c.rx) < 0.00005);
                            return duplicateInfo ? (
                              <span 
                                key={c.name} 
                                title={`${c.purpose || c.name} · Ya está en tu radio en el canal #${duplicateInfo.existing.n} (${duplicateInfo.existing.nom})`}
                                className="px-2 py-0.5 bg-emerald-950/70 border border-emerald-500/40 rounded-lg text-emerald-300 flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="font-bold">{c.name}</span>
                                <span className="text-[10px] text-emerald-400/80 font-mono">CH {duplicateInfo.existing.n}</span>
                              </span>
                            ) : (
                              <span 
                                key={c.name} 
                                title={`${c.purpose || c.name} · ${formatFrequency(c.rx)} MHz`}
                                className="px-2 py-0.5 bg-zinc-800/90 border border-zinc-700/60 rounded-lg text-zinc-200 flex items-center gap-1 hover:border-cyan-500/50 transition cursor-help"
                              >
                                <span className="text-cyan-400 font-bold">+</span>
                                <span className="font-bold font-mono">{c.name}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">{formatFrequency(c.rx)}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Smart Action Button */}
                      {isFullyLoaded ? (
                        <div className="flex items-center gap-2">
                          <button
                            disabled
                            className="flex-1 py-2.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 opacity-90 cursor-default"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Pack Completo ya en Memoria
                          </button>
                          <button
                            onClick={() => handleApplyPreset(preset, true)}
                            title="Forzar duplicación y añadir todos los canales de nuevo"
                            className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-[11px] font-bold rounded-xl cursor-pointer"
                          >
                            Forzar copia
                          </button>
                        </div>
                      ) : hasDuplicates ? (
                        <div className="space-y-1.5">
                          <button
                            onClick={() => handleApplyPreset(preset, false)}
                            className="w-full py-2.5 bg-gradient-to-r from-amber-600/30 via-cyan-600/30 to-teal-600/30 hover:from-amber-600/40 hover:to-teal-600/40 border border-cyan-500/40 text-cyan-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-cyan-900/20"
                          >
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                            <span>Añadir {analysis.newChannels.length} nuevos (Omitir {analysis.duplicates.length} duplicados)</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleApplyPreset(preset, false)}
                          className="w-full py-2.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-cyan-900/20"
                        >
                          <PlusCircle className="w-4 h-4 text-cyan-400" />
                          <span>Cargar Pack Completo ({preset.channels.length} canales)</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SINTONIZADOR VFO */}
        {activeTab === 'vfo' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="bg-[#15171d] border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-5">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <RadioTower className="w-5 h-5 text-cyan-400" />
                  Sintonizador Rápido de Frecuencia (VFO-A)
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Escribe una frecuencia directa en la memoria del VFO activo de tu radio (0x1950) sin tener que crear un canal.
                </p>
              </div>

              <div className="bg-[#0b0c10] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 font-mono block">FRECUENCIA VFO LEÍDA DE LA RADIO</span>
                  <span className="text-2xl font-black text-cyan-400 font-mono">{rxFreq} <span className="text-xs text-zinc-500">MHz</span></span>
                </div>
                <button
                  onClick={handleSyncVFO}
                  disabled={!connected || isReadingVFO}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-xs font-bold rounded-xl border border-zinc-700 transition cursor-pointer flex items-center gap-2 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReadingVFO ? 'animate-spin' : ''}`} />
                  Leer VFO
                </button>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs text-zinc-300 font-semibold mb-1">Nueva Frecuencia RX (MHz)</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={vfoWriteRx}
                    onChange={e => setVfoWriteRx(e.target.value)}
                    placeholder="446.13125"
                    className="w-full bg-[#0b0c10] border border-zinc-700 rounded-xl px-4 py-2.5 font-mono text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-300 font-semibold mb-1">Nueva Frecuencia TX (MHz)</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={vfoWriteTx}
                    onChange={e => setVfoWriteTx(e.target.value)}
                    placeholder="446.13125"
                    className="w-full bg-[#0b0c10] border border-zinc-700 rounded-xl px-4 py-2.5 font-mono text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  onClick={handleWriteVFO}
                  disabled={!connected || isWritingVFO}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40 shadow-lg shadow-blue-500/20"
                >
                  {isWritingVFO ? 'Escribiendo en memoria de la radio...' : 'Sintonizar Frecuencia en la Radio'}
                </button>

                {vfoStatusMsg && (
                  <p className="text-xs text-center font-mono text-cyan-400">{vfoStatusMsg}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PANTALLA Y CONTROL EN VIVO (LCD MIRROR) */}
        {activeTab === 'panel' && (
          <LiveScreenMirror
            device={device}
            connected={connected}
            liveState={liveState}
            setLiveState={setLiveState}
            memoryBuffer={memoryBuffer}
            onRefreshChannels={handleReadFullMemory}
            onOpenFirmwareGuide={() => setActiveTab('firmware')}
          />
        )}

        {/* TAB: FIRMWARE NICFW & FLASHER */}
        {activeTab === 'firmware' && (
          <FirmwareHub />
        )}

        {/* TAB 5: LABORATORY & PROBES */}
        {activeTab === 'lab' && (
          <div className="space-y-6">
            <div className="bg-[#15171d] border border-zinc-800 rounded-2xl p-6 shadow-lg">
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Laboratorio de Sondeos · Oficial vs nicFW
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed mb-6">
                Este banco de pruebas permite verificar qué comandos acepta la radio. Como tu TD-H3 Plus tiene el <b>firmware oficial</b>, los comandos de memoria (VFO-A 0x52) responden correctamente, mientras que los comandos de inyección de teclado remoto (0x50, 0x4A, 0xAA) solo devuelven respuesta en firmwares modificados como nicFW.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SONDEOS.map(probe => (
                  <div key={probe.id} className="bg-[#0f1115] border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.2 rounded border ${
                            probe.fwType === 'Oficial' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}>
                            {probe.fwType}
                          </span>
                          <h4 className="text-xs font-bold text-zinc-200 mt-1">{probe.name}</h4>
                        </div>
                        <button
                          onClick={() => handleRunProbe(probe)}
                          disabled={!connected}
                          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-cyan-400 text-xs font-bold rounded-lg transition active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Probar
                        </button>
                      </div>
                      <code className="text-[10px] text-zinc-500 font-mono block mb-2">
                        {probe.bytes ? probe.bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ") : `0x52 ${probe.readAddr?.toString(16).toUpperCase()}`}
                      </code>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{probe.desc}</p>
                    </div>

                    {probeResults[probe.id] && (
                      <pre className="mt-3 p-2.5 bg-[#08090b] rounded-lg border border-zinc-800/80 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap">
                        {probeResults[probe.id]}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Hex Byte Sender */}
            <div className="bg-[#15171d] border border-zinc-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Enviar Bytes Hexadecimales a Mano
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Introduce cualquier secuencia en hexadecimal (separada por espacios) para enviarla directamente a la característica de escritura BLE (0xFF02).
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={customHex}
                  onChange={e => setCustomHex(e.target.value)}
                  placeholder="ej: 50 00 0A 00 00 00 00"
                  className="flex-1 bg-[#0b0c10] border border-zinc-700 rounded-xl px-4 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSendCustomHex}
                  disabled={!connected}
                  className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Enviar a la radio
                </button>
              </div>

              {customHexRes && (
                <pre className="mt-3 p-3 bg-[#0b0c10] border border-zinc-800 rounded-xl font-mono text-xs text-cyan-300 whitespace-pre-wrap">
                  {customHexRes}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: BLE TRAFFIC LOG */}
        {activeTab === 'log' && (
          <div className="bg-[#15171d] border border-zinc-800 rounded-2xl p-6 shadow-lg flex flex-col h-[650px]">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-yellow-400" />
                  Registro de Tráfico Bluetooth en Tiempo Real
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Muestra cada byte transmitido (<span className="text-cyan-400 font-bold">→ TX</span>) y recibido (<span className="text-emerald-400 font-bold">← RX</span>).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={e => setAutoScroll(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-0"
                  />
                  Auto-scroll
                </label>
                <button
                  onClick={() => setLogs([])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpiar registro
                </button>
              </div>
            </div>

            <div 
              ref={logContainerRef}
              className="flex-1 bg-[#090a0d] border border-zinc-800 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1.5"
            >
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic py-8 text-center">
                  El registro está vacío. Conecta la radio o pulsa cualquier botón para ver los paquetes en directo.
                </div>
              ) : (
                logs.map(l => (
                  <div key={l.id} className="flex items-start gap-2 hover:bg-zinc-900/40 p-0.5 rounded">
                    <span className="text-zinc-600 select-none">{l.timestamp}</span>
                    <span className={`font-bold select-none px-1 rounded ${
                      l.dir === 'tx' ? 'bg-cyan-500/10 text-cyan-400' :
                      l.dir === 'rx' ? 'bg-emerald-500/10 text-emerald-400' :
                      l.dir === 'err' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {l.dir === 'tx' ? '→ TX' : l.dir === 'rx' ? '← RX' : l.dir === 'err' ? 'ERR' : 'INFO'}
                    </span>
                    <span className="text-zinc-200 font-semibold break-all">{l.hex}</span>
                    {l.text && <span className="text-zinc-500 font-normal">[{l.text}]</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
