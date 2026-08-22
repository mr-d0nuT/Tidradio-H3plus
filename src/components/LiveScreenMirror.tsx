import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Volume2, 
  VolumeX, 
  ArrowUp, 
  ArrowDown, 
  RefreshCw, 
  RadioTower, 
  Activity, 
  Lock, 
  Unlock, 
  Zap, 
  Sliders, 
  ShieldCheck,
  Sparkles,
  Layers,
  Keyboard,
  Info,
  ChevronDown,
  Disc,
  Flame,
  Waves
} from 'lucide-react';
import { TidradioDevice } from '../lib/bluetooth';
import { 
  LiveRadioState, 
  VfoState, 
  tuneVfo, 
  sendUnifiedKeyPulse, 
  STEP_OPTIONS,
  readFullLiveState,
  RadioTransport,
  formatFrequency
} from '../lib/protocol';
import { radioAudio } from '../lib/audio';
import { CollapsibleSection } from './CollapsibleSection';
import { BandPlanViewer } from './BandPlanViewer';
import { SdrWaterfall } from './SdrWaterfall';

interface LiveScreenMirrorProps {
  device: RadioTransport | null;
  connected: boolean;
  liveState: LiveRadioState;
  setLiveState: React.Dispatch<React.SetStateAction<LiveRadioState>>;
  memoryBuffer: Uint8Array | null;
  onRefreshChannels?: () => void;
  onOpenFirmwareGuide?: () => void;
}

export function LiveScreenMirror({
  device,
  connected,
  liveState,
  setLiveState,
  memoryBuffer,
  onRefreshChannels,
  onOpenFirmwareGuide
}: LiveScreenMirrorProps) {
  // Firmware mode: 'stock' (ODmaster EEPROM) or 'nicfw' (Live remote streaming)
  const [firmwareMode, setFirmwareMode] = useState<'stock' | 'nicfw'>('stock');
  // Input buffer for direct frequency typing (e.g. "145500")
  const [digitBuffer, setDigitBuffer] = useState<string>("");
  const [isTypingFreq, setIsTypingFreq] = useState(false);
  const [typingVfo, setTypingVfo] = useState<'A' | 'B'>('A');
  
  // Real-time polling
  const [autoSync, setAutoSync] = useState(false);
  const [syncIntervalMs, setSyncIntervalMs] = useState(5000);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncSuccessMsg, setSyncSuccessMsg] = useState("");

  // PTT & Transmission State
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Audio effects
  const [soundOn, setSoundOn] = useState(true);

  // Selected Step for ▲/▼ (kHz)
  const [selectedStep, setSelectedStep] = useState<number>(12.5);

  // S-Meter animated level (0 - 100)
  const [signalLevel, setSignalLevel] = useState(42);

  // Rotary Knob Rotation Angle (degrees)
  const [knobAngle, setKnobAngle] = useState<number>(0);
  const isDraggingKnob = useRef<boolean>(false);
  const lastKnobY = useRef<number>(0);

  // Periodic random signal fluctuation for realism in RX
  useEffect(() => {
    if (isTransmitting) {
      setSignalLevel(100);
      return;
    }
    const interval = setInterval(() => {
      if (connected) {
        setSignalLevel(Math.floor(25 + Math.random() * 50));
      } else {
        setSignalLevel(0);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [connected, isTransmitting]);

  // Audio sound toggle
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    radioAudio.setSoundEnabled(next);
  };

  // Live Sync Engine (Periodic Poller)
  useEffect(() => {
    if (!connected || !device || !autoSync || isTransmitting || isTypingFreq) return;

    let isMounted = true;
    const pollTimer = setInterval(async () => {
      if (isSyncing) return;
      setIsSyncing(true);
      try {
        const state = await readFullLiveState(device);
        if (isMounted) {
          setLiveState(state);
          setSyncError("");
        }
      } catch (err: any) {
        if (isMounted) {
          setSyncError("Error de lectura: " + (err.message || "Timeout"));
        }
      } finally {
        if (isMounted) setIsSyncing(false);
      }
    }, syncIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
    };
  }, [connected, device, autoSync, syncIntervalMs, isTransmitting, isTypingFreq]);

  // Manual one-shot read
  const handleManualSync = async () => {
    if (!device || !connected) return;
    setIsSyncing(true);
    setSyncError("");
    setSyncSuccessMsg("");
    try {
      radioAudio.playKeyBeep(1200, 0.05);
      const state = await readFullLiveState(device);
      setLiveState(state);
      setSyncSuccessMsg("¡Sincronizado con éxito!");
      setTimeout(() => setSyncSuccessMsg(""), 3000);
    } catch (err: any) {
      setSyncError("Fallo al sincronizar: " + (err.message || "Timeout"));
    } finally {
      setIsSyncing(false);
    }
  };

  // Direct Frequency Application to VFO
  const applyFrequencyToRadio = async (vfoKey: 'A' | 'B', freqMhz: number) => {
    if (isNaN(freqMhz) || freqMhz < 18 || freqMhz > 1300) return;

    radioAudio.playKeyBeep(1400, 0.04);

    setLiveState(prev => ({
      ...prev,
      [vfoKey === 'A' ? 'vfoA' : 'vfoB']: {
        ...prev[vfoKey === 'A' ? 'vfoA' : 'vfoB'],
        rx: freqMhz,
        tx: freqMhz
      },
      lastUpdated: Date.now()
    }));

    if (device && connected) {
      try {
        await tuneVfo(device, vfoKey, freqMhz, freqMhz, memoryBuffer);
        setSyncSuccessMsg(`Sintonizado VFO-${vfoKey}: ${freqMhz.toFixed(4)} MHz`);
        setTimeout(() => setSyncSuccessMsg(""), 3000);
      } catch (err: any) {
        setSyncError("Error sintonizando: " + (err.message || "Error"));
      }
    }
  };

  // Step Frequency UP / DOWN
  const handleStepFreq = (direction: 'UP' | 'DOWN') => {
    const activeKeyName = liveState.activeVfo === 'A' ? 'vfoA' : 'vfoB';
    const currentFreq = liveState[activeKeyName].rx;
    const stepMhz = selectedStep / 1000;
    const newFreq = direction === 'UP' ? currentFreq + stepMhz : currentFreq - stepMhz;
    const roundedFreq = parseFloat(newFreq.toFixed(5));

    // Update Rotary Knob visually
    setKnobAngle(prev => prev + (direction === 'UP' ? 18 : -18));
    radioAudio.playRotaryTick(direction === 'UP');

    setActiveKey(direction);
    setTimeout(() => setActiveKey(null), 120);

    applyFrequencyToRadio(liveState.activeVfo, roundedFreq);

    if (device && connected) {
      sendUnifiedKeyPulse(device, direction === 'UP' ? 11 : 12, direction);
    }
  };

  // Handle Rotary Knob Wheel / Drag
  const handleKnobWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleStepFreq('UP');
    } else {
      handleStepFreq('DOWN');
    }
  };

  // Handle Digits
  const handleDigitPress = (digit: string, code: number) => {
    radioAudio.playDtmf(digit);
    setActiveKey(digit);
    setTimeout(() => setActiveKey(null), 120);

    if (device && connected) {
      sendUnifiedKeyPulse(device, code, digit);
    }

    if (!isTypingFreq) {
      setIsTypingFreq(true);
      setTypingVfo(liveState.activeVfo);
      setDigitBuffer(digit);
    } else {
      const nextBuf = digitBuffer + digit;
      if (nextBuf.length >= 8) {
        const mhz = parseFloat((parseInt(nextBuf, 10) / 100000).toFixed(5));
        setIsTypingFreq(false);
        setDigitBuffer("");
        applyFrequencyToRadio(typingVfo, mhz);
      } else if (nextBuf.length === 6) {
        const mhz = parseFloat((parseInt(nextBuf, 10) / 1000).toFixed(5));
        if (mhz >= 18 && mhz <= 1300) {
          setIsTypingFreq(false);
          setDigitBuffer("");
          applyFrequencyToRadio(typingVfo, mhz);
        } else {
          setDigitBuffer(nextBuf);
        }
      } else {
        setDigitBuffer(nextBuf);
      }
    }
  };

  // Handle MENU Button
  const handleMenuPress = () => {
    radioAudio.playKeyBeep(800, 0.05);
    setActiveKey('MENU');
    setTimeout(() => setActiveKey(null), 120);

    if (device && connected) {
      sendUnifiedKeyPulse(device, 10, 'MENU');
    }

    if (isTypingFreq && digitBuffer.length > 0) {
      let mhz = 0;
      if (digitBuffer.length <= 6) {
        const padded = digitBuffer.padEnd(6, '0');
        mhz = parseFloat((parseInt(padded, 10) / 1000).toFixed(5));
      } else {
        const padded = digitBuffer.padEnd(8, '0');
        mhz = parseFloat((parseInt(padded, 10) / 100000).toFixed(5));
      }
      setIsTypingFreq(false);
      setDigitBuffer("");
      applyFrequencyToRadio(typingVfo, mhz);
    }
  };

  // Handle EXIT Button
  const handleExitPress = () => {
    radioAudio.playKeyBeep(600, 0.05);
    setActiveKey('EXIT');
    setTimeout(() => setActiveKey(null), 120);

    if (device && connected) {
      sendUnifiedKeyPulse(device, 13, 'EXIT');
    }

    if (isTypingFreq) {
      setIsTypingFreq(false);
      setDigitBuffer("");
    } else {
      handleManualSync();
    }
  };

  // Toggle Active VFO (A / B)
  const handleToggleVfo = () => {
    radioAudio.playKeyBeep(1000, 0.05);
    setActiveKey('VFO_AB');
    setTimeout(() => setActiveKey(null), 120);

    const nextVfo = liveState.activeVfo === 'A' ? 'B' : 'A';
    setLiveState(prev => ({ ...prev, activeVfo: nextVfo }));
    
    if (isTypingFreq) {
      setTypingVfo(nextVfo);
    }

    if (device && connected) {
      sendUnifiedKeyPulse(device, 7, 'TDR_AB');
    }
  };

  // PTT Push-To-Talk Start / End
  const handlePttDown = () => {
    setIsTransmitting(true);
    setActiveKey('PTT');
    radioAudio.playPttStart();

    if (device && connected) {
      sendUnifiedKeyPulse(device, 21, 'PTT');
    }
  };

  const handlePttUp = () => {
    setIsTransmitting(false);
    setActiveKey(null);
    radioAudio.playRogerBeep();
  };

  // Keyboard Shortcuts (PC Keyboard listener)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleStepFreq('UP');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleStepFreq('DOWN');
      } else if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitPress(e.key, parseInt(e.key, 10));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleMenuPress();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleExitPress();
      } else if (e.key.toLowerCase() === 'v' || e.key === 'Tab') {
        e.preventDefault();
        handleToggleVfo();
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        handlePttDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        handlePttUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [liveState, isTypingFreq, digitBuffer, selectedStep, typingVfo, connected, device]);

  // Formato visual de frecuencia con cursor para entrada directa
  const formatDisplayFreq = (vfoKey: 'A' | 'B', freq: number) => {
    if (isTypingFreq && typingVfo === vfoKey) {
      const raw = digitBuffer;
      let p1 = raw.slice(0, 3);
      let p2 = raw.slice(3, 8);
      return (
        <span className="text-yellow-400 font-mono-tech tracking-wider animate-pulse">
          {p1 || "___"}.{p2 ? p2.padEnd(5, "_") : "_____"}
        </span>
      );
    }
    const str = (Number(freq) || 0).toFixed(5);
    const [mhz, decimals] = str.split('.');
    const mainDecimals = decimals ? decimals.slice(0, 3) : "000";
    const subDecimals = decimals ? decimals.slice(3) : "00";
    return (
      <span className="inline-flex items-baseline font-mono-tech tracking-wider">
        <span>{mhz}.{mainDecimals}</span>
        <span className="text-[0.72em] font-bold text-yellow-300 ml-0.5 align-baseline">
          {subDecimals}
        </span>
      </span>
    );
  };

  const currentActiveMhz = liveState[liveState.activeVfo === 'A' ? 'vfoA' : 'vfoB'].rx;

  return (
    <div className="space-y-8">
      
      {/* Top Banner: Real-Time Sync & Telemetry Bar */}
      <div className="bg-[#0b0e15] border border-cyan-500/30 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
            <RadioTower className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-display tracking-wider">
                VFO COCKPIT & LIVE MIRROR
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1.5 ${
                connected 
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' 
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`} />
                {connected ? (isSyncing ? 'LEYENDO RADIO...' : 'ONLINE 1:1') : 'OFFLINE'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Display TFT LCD 1.44", sintetizador PLL y encoder de paso de sintonía en vivo.
            </p>
          </div>
        </div>

        {/* Sync Controls & Firmware Mode */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Firmware Mode Selector */}
          <div className="flex items-center bg-[#07090e] border border-zinc-800 rounded-xl p-1 gap-1 text-xs">
            <button
              onClick={() => setFirmwareMode('stock')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer font-mono ${
                firmwareMode === 'stock'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Fábrica (ODmaster)
            </button>
            <button
              onClick={() => setFirmwareMode('nicfw')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer font-mono ${
                firmwareMode === 'nicfw'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              nicFW V2 (En Vivo)
            </button>
          </div>

          {/* Step Selector */}
          <div className="flex items-center bg-[#07090e] border border-zinc-800 rounded-xl px-2.5 py-1.5 gap-2 text-xs">
            <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase">Paso:</span>
            <select
              value={selectedStep}
              onChange={e => setSelectedStep(Number(e.target.value))}
              className="bg-transparent text-cyan-300 font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              {STEP_OPTIONS.map(val => (
                <option key={val} value={val} className="bg-zinc-900 text-white">
                  {val} kHz
                </option>
              ))}
            </select>
          </div>

          {/* One-Shot Manual Read */}
          <button
            onClick={handleManualSync}
            disabled={!connected || isSyncing}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer border ${
              isSyncing
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 hover:border-cyan-500/30'
            }`}
            title="Leer estado actual de la radio"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : 'text-zinc-400'}`} />
            <span>{isSyncing ? 'Leyendo...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* Success/Error Alerts */}
      {syncSuccessMsg && (
        <div className="bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-lg animate-in fade-in duration-200 font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        </div>
      )}
      {syncError && (
        <div className="bg-red-950/70 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-lg animate-in fade-in duration-200 font-mono">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-400 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button 
            onClick={handleManualSync}
            className="px-2.5 py-1 bg-red-500/30 hover:bg-red-500/50 rounded font-bold text-[11px] cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Main Interactive Stage: Chassis & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left / Center: Interactive TIDRADIO TD-H3 Plus Physical Frontal */}
        <div className="lg:col-span-6 xl:col-span-5 flex flex-col items-center">
          <div className="flex items-start space-x-3">
            
            {/* Left Side Buttons (PTT & Sidekeys) */}
            <div className="flex flex-col items-center space-y-3 pt-24">
              {/* PTT Button */}
              <div className="flex flex-col items-center">
                <button
                  onPointerDown={handlePttDown}
                  onPointerUp={handlePttUp}
                  onPointerLeave={handlePttUp}
                  onPointerCancel={handlePttUp}
                  onContextMenu={e => e.preventDefault()}
                  className={`w-11 h-28 rounded-xl flex flex-col items-center justify-center font-bold text-[11px] tracking-wider transition-all select-none touch-none cursor-pointer shadow-lg border-2 ${
                    isTransmitting || activeKey === 'PTT'
                      ? 'bg-red-500 border-red-300 text-white translate-x-1 shadow-[0_0_20px_rgba(239,68,68,0.8)] scale-95'
                      : 'bg-gradient-to-b from-red-600 to-red-800 border-red-700 text-red-100 hover:brightness-110 shadow-md'
                  }`}
                  title="Mantén pulsado para transmitir (o usa la barra espaciadora)"
                >
                  <span className="animate-pulse">P</span>
                  <span className="animate-pulse">T</span>
                  <span className="animate-pulse">T</span>
                </button>
                <span className="text-[9px] text-zinc-500 mt-1 font-mono">TX PTT</span>
              </div>

              {/* Side Key 1 (SK1 / MONI / LAMP) */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => {
                    radioAudio.playKeyBeep(900, 0.04);
                    setActiveKey('SK1');
                    setTimeout(() => setActiveKey(null), 120);
                    if (device && connected) sendUnifiedKeyPulse(device, 22, 'SK1');
                  }}
                  className={`w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-zinc-300 transition-all select-none touch-none shadow cursor-pointer ${
                    activeKey === 'SK1' ? 'bg-cyan-500 border-cyan-400 text-black translate-x-0.5' : 'hover:bg-zinc-700'
                  }`}
                  title="Side Key 1: Monitor / Flashlight"
                >
                  SK1
                </button>
                <span className="text-[8px] text-zinc-600 font-mono">MONI</span>
              </div>

              {/* Side Key 2 (SK2 / FM Radio) */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => {
                    radioAudio.playKeyBeep(950, 0.04);
                    setActiveKey('SK2');
                    setTimeout(() => setActiveKey(null), 120);
                    if (device && connected) sendUnifiedKeyPulse(device, 23, 'SK2');
                  }}
                  className={`w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-zinc-300 transition-all select-none touch-none shadow cursor-pointer ${
                    activeKey === 'SK2' ? 'bg-cyan-500 border-cyan-400 text-black translate-x-0.5' : 'hover:bg-zinc-700'
                  }`}
                  title="Side Key 2: FM Broadcast"
                >
                  SK2
                </button>
                <span className="text-[8px] text-zinc-600 font-mono">FM</span>
              </div>
            </div>

            {/* Main Radio Chassis Body */}
            <div className="w-80 sm:w-88 bg-[#101217] rounded-[36px] border-4 border-zinc-800 p-5 shadow-2xl relative flex flex-col glow-primary-sm">
              
              {/* Top Antenna & Rotary Encoder Knob */}
              <div className="absolute -top-7 left-10 w-7 h-8 bg-zinc-800 rounded-t-md border-t-2 border-x-2 border-zinc-700 shadow-inner flex items-center justify-center">
                <div className="w-3 h-5 bg-zinc-700 rounded-t-sm"></div>
              </div>
              
              {/* Interactive Knurled Rotary Dial Knob */}
              <div 
                onWheel={handleKnobWheel}
                onClick={() => {
                  radioAudio.playKeyBeep(1300, 0.04);
                  handleToggleVfo();
                }}
                className="absolute -top-7 right-8 w-11 h-9 bg-gradient-to-b from-zinc-700 to-zinc-900 rounded-t-xl border-t-2 border-x-2 border-cyan-500/50 flex items-center justify-center cursor-pointer shadow-lg hover:border-cyan-400 group"
                title="Rueda del ratón o clic para girar sintonía VFO"
              >
                <div 
                  className="w-8 h-8 rounded-full border border-zinc-600 flex items-center justify-center transition-transform duration-100"
                  style={{ transform: `rotate(${knobAngle}deg)` }}
                >
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                </div>
              </div>

              {/* Brand & Speaker Grille */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-black tracking-widest text-zinc-300 font-display">TIDRADIO TD-H3 PLUS</span>
                <div className="flex gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isTransmitting ? 'bg-red-500 shadow-[0_0_8px_red] animate-ping' : connected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-zinc-700'}`} />
                  <span className="w-2 h-2 rounded-full bg-zinc-700" />
                  <span className="w-2 h-2 rounded-full bg-zinc-700" />
                </div>
              </div>

              {/* ════════════════════════ 1.44" TFT COLOR LCD SCREEN ════════════════════════ */}
              <div className={`border-2 rounded-xl p-3 font-mono-tech shadow-inner mb-4 transition-colors duration-150 crt-overlay ${
                isTransmitting 
                  ? 'bg-[#180505] border-red-600/80 text-red-400' 
                  : 'bg-[#03090e] border-cyan-500/40 text-cyan-400'
              }`}>
                
                {/* Top Status Row */}
                <div className="flex justify-between items-center text-[10px] border-b border-cyan-950/80 pb-1.5 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-300 rounded font-bold">
                      {liveState.activeVfo === 'A' ? 'VFO-A' : 'VFO-B'}
                    </span>
                    <span className="text-zinc-400 font-mono font-bold">SQL:{liveState.squelch}</span>
                    <span className="text-zinc-500 font-mono text-[9px]">{selectedStep}K</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-yellow-400 font-bold">[DW]</span>
                    <span className="text-emerald-400 font-bold">
                      {liveState[liveState.activeVfo === 'A' ? 'vfoA' : 'vfoB'].pot.includes('Alt') ? 'H 5W' : 'L 2W'}
                    </span>
                    <span className="text-cyan-300 text-[9px] font-bold">
                      {liveState.batteryPct}%
                    </span>
                  </div>
                </div>

                {/* VFO A Block */}
                <div 
                  onClick={() => {
                    if (liveState.activeVfo !== 'A') handleToggleVfo();
                  }}
                  className={`p-2 rounded-lg transition-all cursor-pointer ${
                    liveState.activeVfo === 'A' 
                      ? 'bg-cyan-950/50 border border-cyan-500/40 shadow-inner' 
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold ${liveState.activeVfo === 'A' ? 'text-yellow-400' : 'text-zinc-600'}`}>
                        {liveState.activeVfo === 'A' ? '▶ A' : '  A'}
                      </span>
                      <span className="text-2xl sm:text-3xl font-black tracking-wider text-white font-mono-tech">
                        {formatDisplayFreq('A', liveState.vfoA.rx)}
                      </span>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-bold">MHz</span>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-0.5 px-1">
                    <span className="text-cyan-300 font-sans font-medium">{liveState.vfoA.nom}</span>
                    <div className="flex gap-1.5">
                      {liveState.vfoA.enc && <span className="text-yellow-400 font-bold">T:{liveState.vfoA.enc}</span>}
                      <span className="text-zinc-400">[{liveState.vfoA.ancho}]</span>
                    </div>
                  </div>
                </div>

                {/* VFO B Block */}
                <div 
                  onClick={() => {
                    if (liveState.activeVfo !== 'B') handleToggleVfo();
                  }}
                  className={`p-2 rounded-lg transition-all mt-1.5 cursor-pointer ${
                    liveState.activeVfo === 'B' 
                      ? 'bg-cyan-950/50 border border-cyan-500/40 shadow-inner' 
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold ${liveState.activeVfo === 'B' ? 'text-yellow-400' : 'text-zinc-600'}`}>
                        {liveState.activeVfo === 'B' ? '▶ B' : '  B'}
                      </span>
                      <span className="text-xl sm:text-2xl font-bold tracking-wider text-cyan-300 font-mono-tech">
                        {formatDisplayFreq('B', liveState.vfoB.rx)}
                      </span>
                    </div>
                    <span className="text-[9px] text-cyan-500 font-bold">MHz</span>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-0.5 px-1">
                    <span className="text-cyan-300 font-sans font-medium">{liveState.vfoB.nom}</span>
                    <div className="flex gap-1.5">
                      {liveState.vfoB.enc && <span className="text-yellow-400 font-bold">T:{liveState.vfoB.enc}</span>}
                      <span className="text-zinc-400">[{liveState.vfoB.ancho}]</span>
                    </div>
                  </div>
                </div>

                {/* Bottom S-Meter / RSSI Bar & TX Indicator */}
                <div className="border-t border-cyan-950/80 pt-1.5 mt-2">
                  <div className="flex items-center justify-between text-[9px] text-zinc-400 mb-1">
                    <span className="font-bold">{isTransmitting ? '🔴 TX 5W' : '🟢 RX STANDBY'}</span>
                    <span className="font-mono">{isTransmitting ? '+60 dB' : `S${Math.min(9, Math.floor(signalLevel / 10))}`}</span>
                  </div>

                  {/* S-Meter Gauge */}
                  <div className="w-full bg-zinc-900 rounded-sm h-2 overflow-hidden flex gap-0.5 p-0.5 border border-zinc-800">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const active = (i / 12) * 100 <= signalLevel;
                      const isHigh = i >= 8;
                      return (
                        <div
                          key={i}
                          className={`flex-1 h-full rounded-xs transition-all duration-150 ${
                            active
                              ? isHigh
                                ? 'bg-red-500 shadow-sm shadow-red-500/50'
                                : 'bg-emerald-400'
                              : 'bg-zinc-800/40'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Direct Typing Notice */}
                {isTypingFreq && (
                  <div className="mt-2 bg-yellow-950/60 border border-yellow-500/40 rounded p-1 text-[10px] text-center text-yellow-300 font-bold">
                    Tecleando en VFO-{typingVfo}: {digitBuffer} (Pulsa MENU para confirmar)
                  </div>
                )}

              </div>

              {/* Speaker Slots */}
              <div className="flex justify-center gap-1.5 mb-3 py-1">
                <div className="w-12 h-1 bg-zinc-800 rounded-full"></div>
                <div className="w-16 h-1 bg-zinc-800 rounded-full"></div>
                <div className="w-12 h-1 bg-zinc-800 rounded-full"></div>
              </div>

              {/* Navigation Keypad (MENU / ▲ UP / ▼ DOWN / EXIT) */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <button
                  onClick={handleMenuPress}
                  className={`h-11 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer border ${
                    activeKey === 'MENU' 
                      ? 'bg-cyan-500 border-cyan-300 text-black translate-y-0.5 scale-95 shadow-md shadow-cyan-500/40' 
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
                  }`}
                  title="MENU: Confirmar o abrir configuración"
                >
                  <span>MENU</span>
                  <span className="text-[8px] opacity-60 font-mono">ENTER</span>
                </button>

                <button
                  onClick={() => handleStepFreq('UP')}
                  className={`h-11 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer border ${
                    activeKey === 'UP' 
                      ? 'bg-cyan-500 border-cyan-300 text-black translate-y-0.5 scale-95 shadow-md shadow-cyan-500/40' 
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
                  }`}
                  title="UP: Subir frecuencia (+paso)"
                >
                  <ArrowUp className="w-4 h-4 text-cyan-300" />
                  <span className="text-[8px] opacity-60 font-mono">▲</span>
                </button>

                <button
                  onClick={() => handleStepFreq('DOWN')}
                  className={`h-11 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer border ${
                    activeKey === 'DOWN' 
                      ? 'bg-cyan-500 border-cyan-300 text-black translate-y-0.5 scale-95 shadow-md shadow-cyan-500/40' 
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
                  }`}
                  title="DOWN: Bajar frecuencia (-paso)"
                >
                  <ArrowDown className="w-4 h-4 text-cyan-300" />
                  <span className="text-[8px] opacity-60 font-mono">▼</span>
                </button>

                <button
                  onClick={handleExitPress}
                  className={`h-11 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer border ${
                    activeKey === 'EXIT' 
                      ? 'bg-cyan-500 border-cyan-300 text-black translate-y-0.5 scale-95 shadow-md shadow-cyan-500/40' 
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
                  }`}
                  title="EXIT: Cancelar o recargar"
                >
                  <span>EXIT</span>
                  <span className="text-[8px] opacity-60 font-mono">ESC</span>
                </button>
              </div>

              {/* 12-Key Alphanumeric Matrix */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { digit: '1', sub: 'STEP', code: 1 },
                  { digit: '2', sub: 'SQL', code: 2 },
                  { digit: '3', sub: 'SAVE', code: 3 },
                  { digit: '4', sub: 'VOX', code: 4 },
                  { digit: '5', sub: 'W/N', code: 5 },
                  { digit: '6', sub: 'ABR', code: 6 },
                  { digit: '7', sub: 'TDR', code: 7, action: handleToggleVfo },
                  { digit: '8', sub: 'BEEP', code: 8, action: toggleSound },
                  { digit: '9', sub: 'TOT', code: 9 },
                  { digit: '*', sub: 'SCAN', code: 14 },
                  { digit: '0', sub: 'SQL', code: 0 },
                  { digit: '#', sub: 'A/B', code: 15, action: handleToggleVfo },
                ].map(k => (
                  <button
                    key={k.digit}
                    onClick={() => {
                      if (k.action) {
                        k.action();
                      } else {
                        handleDigitPress(k.digit, k.code);
                      }
                    }}
                    className={`h-11 bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 rounded-lg flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer ${
                      activeKey === k.digit 
                        ? 'bg-cyan-500 border-cyan-300 text-black translate-y-0.5 scale-95 shadow-md shadow-cyan-500/40' 
                        : 'text-zinc-200'
                    }`}
                  >
                    <span className="text-sm font-bold leading-none font-mono-tech">{k.digit}</span>
                    <span className="text-[8px] text-yellow-500/90 font-bold leading-none mt-0.5 font-mono">{k.sub}</span>
                  </button>
                ))}
              </div>

              {/* Bottom Rim */}
              <div className="mt-3 flex justify-center">
                <div className="w-16 h-1 bg-zinc-700 rounded-full opacity-40"></div>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: SDR Waterfall, Quick Sintonizador & Presets en Vivo */}
        <div className="lg:col-span-6 xl:col-span-7 flex flex-col space-y-6">
          
          {/* Real-Time SDR Spectrum Waterfall Analyzer */}
          <SdrWaterfall
            centerFreq={currentActiveMhz}
            activeVfo={liveState.activeVfo}
            onTune={(freq) => applyFrequencyToRadio(liveState.activeVfo, freq)}
            rssi={signalLevel}
            isReceiving={signalLevel > 45}
          />

          {/* Quick Frequency Direct Dial Card */}
          <div className="bg-[#0e121a] border border-cyan-500/30 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 font-display tracking-wider">
                <Zap className="w-4 h-4 text-cyan-400" />
                SINTONIZACIÓN INSTANTÁNEA VFO
              </h3>
              <span className="text-xs text-zinc-400 font-mono">Control Bidireccional</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* VFO A Quick Dial */}
              <div className="bg-[#07090e] border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-cyan-400 font-mono">VFO-A (Principal)</span>
                  <button
                    onClick={() => handleToggleVfo()}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer border ${
                      liveState.activeVfo === 'A' 
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {liveState.activeVfo === 'A' ? 'ACTIVO' : 'ACTIVAR'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.00001"
                    value={liveState.vfoA.rx}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) applyFrequencyToRadio('A', val);
                    }}
                    className="w-full bg-[#0e121a] border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleStepFreq('UP')}
                      className="p-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded cursor-pointer border border-zinc-700"
                      title="Subir"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleStepFreq('DOWN')}
                      className="p-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded cursor-pointer border border-zinc-700"
                      title="Bajar"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* VFO B Quick Dial */}
              <div className="bg-[#07090e] border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-cyan-400 font-mono">VFO-B (Secundario)</span>
                  <button
                    onClick={() => handleToggleVfo()}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer border ${
                      liveState.activeVfo === 'B' 
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {liveState.activeVfo === 'B' ? 'ACTIVO' : 'ACTIVAR'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.00001"
                    value={liveState.vfoB.rx}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) applyFrequencyToRadio('B', val);
                    }}
                    className="w-full bg-[#0e121a] border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        if (liveState.activeVfo !== 'B') handleToggleVfo();
                        handleStepFreq('UP');
                      }}
                      className="p-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded cursor-pointer border border-zinc-700"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (liveState.activeVfo !== 'B') handleToggleVfo();
                        handleStepFreq('DOWN');
                      }}
                      className="p-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded cursor-pointer border border-zinc-700"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Direct Band Selectors */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-2 font-semibold">
                Saltar a Frecuencias Frecuentes (1 Clic a la radio):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "145.500 VHF Ham", mhz: 145.500 },
                  { label: "145.600 Repetidor R0", mhz: 145.600 },
                  { label: "446.00625 PMR CH1", mhz: 446.00625 },
                  { label: "446.13125 PMR CH11", mhz: 446.13125 },
                  { label: "446.08125 Montaña 7-7", mhz: 446.08125 },
                  { label: "156.800 Marítimo 16", mhz: 156.800 },
                  { label: "121.500 Aéreo Emerg", mhz: 121.500 },
                  { label: "433.500 UHF Ham", mhz: 433.500 }
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => applyFrequencyToRadio(liveState.activeVfo, item.mhz)}
                    className="p-2.5 bg-[#07090e] hover:bg-zinc-800 border border-zinc-800 hover:border-cyan-500/50 rounded-xl text-left transition cursor-pointer group"
                  >
                    <div className="text-[11px] font-bold text-white leading-tight font-mono-tech group-hover:text-cyan-300">{formatFrequency(item.mhz)}</div>
                    <div className="text-[9px] text-zinc-400 truncate mt-0.5">{item.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Collapsible Keyboard Shortcuts Reference Guide (Folded by Default) */}
          <CollapsibleSection
            title="Atajos de Teclado del Ordenador"
            subtitle="Controla la radio con las teclas de tu PC"
            icon={Keyboard}
            badge="Teclas Rápidas"
            badgeColor="bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="bg-[#0b0c10] p-2 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">▲ / ▼</span>
                <span className="text-cyan-300 font-bold">Subir/Bajar Frec</span>
              </div>
              <div className="bg-[#0b0c10] p-2 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">0 - 9</span>
                <span className="text-cyan-300 font-bold">Teclear Frecuencia</span>
              </div>
              <div className="bg-[#0b0c10] p-2 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">Enter</span>
                <span className="text-cyan-300 font-bold">MENU / Confirmar</span>
              </div>
              <div className="bg-[#0b0c10] p-2 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">Escape</span>
                <span className="text-cyan-300 font-bold">EXIT / Cancelar</span>
              </div>
              <div className="bg-[#0b0c10] p-2 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">V o Tab</span>
                <span className="text-cyan-300 font-bold">Conmutar VFO A/B</span>
              </div>
              <div className="bg-[#0b0c10] p-2 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">Espacio</span>
                <span className="text-red-400 font-bold">PTT (Mantener)</span>
              </div>
            </div>
          </CollapsibleSection>

          {/* Collapsible Band Plan & Spectrum Quick Sintonizador (Folded by Default) */}
          <CollapsibleSection
            title="Explorador de Bandas & Frecuencias Radioafición / PMR / Marina / Aérea"
            subtitle="Sintonización en 1 clic directa al VFO"
            icon={RadioTower}
            badge="Band Plan"
            badgeColor="bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
            defaultOpen={false}
          >
            <BandPlanViewer
              onTuneFreq={(freq) => applyFrequencyToRadio(liveState.activeVfo, freq)}
            />
          </CollapsibleSection>

        </div>

      </div>

    </div>
  );
}
