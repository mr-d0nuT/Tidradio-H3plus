import React, { useState, useEffect } from 'react';
import {
  Radio,
  Bluetooth,
  Usb,
  Battery,
  BatteryCharging,
  Zap,
  Volume2,
  VolumeX,
  Palette,
  Clock,
  Activity,
  Cpu,
  ShieldCheck,
  Signal,
  Flame,
  RadioTower,
  Eye
} from 'lucide-react';
import { radioAudio } from '../lib/audio';

interface TacticalCockpitHeaderProps {
  connected: boolean;
  connectionType: 'ble' | 'serial' | 'usb' | null;
  deviceName?: string;
  isReceiving?: boolean;
  isTransmitting?: boolean;
  batteryPct?: number;
  batteryVolts?: number;
  rssi?: number;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  activeVfo?: 'A' | 'B';
  dualWatch?: boolean;
  onConnectUsb?: () => void;
  onConnectBle?: () => void;
  onDisconnect?: () => void;
}

export function TacticalCockpitHeader({
  connected,
  connectionType,
  deviceName = 'TIDRADIO TD-H3 Plus',
  isReceiving = false,
  isTransmitting = false,
  batteryPct = 92,
  batteryVolts = 7.8,
  rssi = 65,
  currentTheme,
  onThemeChange,
  activeVfo = 'A',
  dualWatch = true,
  onConnectUsb,
  onConnectBle,
  onDisconnect
}: TacticalCockpitHeaderProps) {
  const [utcTime, setUtcTime] = useState<string>('');
  const [soundOn, setSoundOn] = useState<boolean>(radioAudio.isSoundEnabled());
  const [showThemeMenu, setShowThemeMenu] = useState<boolean>(false);

  // UTC Zulu Clock update
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const zulu = now.toISOString().slice(11, 19) + ' UTC';
      setUtcTime(zulu);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    radioAudio.setSoundEnabled(next);
    if (next) {
      radioAudio.playKeyBeep(1200, 0.05);
    }
  };

  const themes = [
    { id: 'cyan', name: 'Stealth Cyan', color: '#06b6d4', desc: 'Cyber Cockpit' },
    { id: 'phosphor', name: 'Phosphor Green', color: '#10b981', desc: 'Radar Milspec' },
    { id: 'amber', name: 'FLIR Amber', color: '#f59e0b', desc: 'Night Vision' },
    { id: 'amethyst', name: 'Amethyst SDR', color: '#a855f7', desc: 'Neon Spectrum' },
  ];

  return (
    <header className="bg-[#0b0e14]/95 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-40 shadow-2xl">
      
      {/* Top Telemetry & Status Ribbon */}
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        
        {/* Left: Brand / Radio Station Badge */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border font-bold ${
              connected
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500'
            }`}>
              <RadioTower className={`w-5 h-5 ${connected ? 'text-cyan-400 animate-pulse' : 'text-zinc-500'}`} />
            </div>
            {connected && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-black rounded-full animate-ping" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-sm sm:text-base text-white tracking-wider">
                TIDRADIO <span className="text-cyan-400">TD-H3 PLUS</span>
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                PRO v2.8
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 flex items-center gap-1.5">
              <span>BK4819 RF SOC</span>
              <span>•</span>
              <span>Airband AM / VHF / UHF</span>
              <span>•</span>
              <span className="text-cyan-400 font-bold">{connected ? 'ONLINE CONECTADO' : 'OFFLINE'}</span>
            </p>
          </div>
        </div>

        {/* Center: Live Avionics Status Indicators */}
        <div className="hidden lg:flex items-center gap-2 bg-[#06080d] px-3 py-1.5 rounded-xl border border-zinc-800/80">
          
          {/* TX Lamp */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold transition ${
            isTransmitting
              ? 'bg-red-600 text-white border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] animate-pulse'
              : 'bg-zinc-900 text-zinc-600 border-zinc-800'
          }`}>
            <Flame className="w-3 h-3" />
            <span>TX</span>
          </div>

          {/* RX Carrier Lamp */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold transition ${
            isReceiving
              ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse'
              : 'bg-zinc-900 text-zinc-600 border-zinc-800'
          }`}>
            <Activity className="w-3 h-3" />
            <span>RX</span>
          </div>

          {/* RF Lock Synthesizer */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-zinc-900 text-cyan-400 border-zinc-800 text-[10px]">
            <ShieldCheck className="w-3 h-3 text-cyan-400" />
            <span>PLL LOCK</span>
          </div>

          {/* Dual Watch */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-zinc-900 text-zinc-300 border-zinc-800 text-[10px]">
            <span className="text-[9px] text-zinc-500">DW:</span>
            <span className={dualWatch ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>
              {dualWatch ? 'A+B' : 'OFF'}
            </span>
          </div>

          {/* Zulu Clock */}
          <div className="flex items-center gap-1 px-2.5 py-0.5 text-zinc-400 text-[10px] border-l border-zinc-800 pl-2">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span className="text-zinc-200 font-bold">{utcTime || '00:00:00 UTC'}</span>
          </div>

        </div>

        {/* Right: Telemetry Meters & Quick Controls */}
        <div className="flex items-center gap-2.5">
          
          {/* Signal S-Meter / RSSI */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#06080d] px-2.5 py-1 rounded-xl border border-zinc-800">
            <Signal className="w-3.5 h-3.5 text-cyan-400" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-300 ${
                      rssi > 75 ? 'bg-emerald-400' : rssi > 40 ? 'bg-cyan-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(10, rssi))}%` }}
                  />
                </div>
                <span className="text-[10px] text-cyan-300 font-bold">S{Math.min(9, Math.ceil((rssi / 100) * 9))}</span>
              </div>
              <span className="text-[8px] text-zinc-500 font-mono">-{120 - Math.round((rssi / 100) * 80)} dBm</span>
            </div>
          </div>

          {/* Battery Level */}
          <div className="flex items-center gap-1.5 bg-[#06080d] px-2.5 py-1 rounded-xl border border-zinc-800">
            <Battery className={`w-4 h-4 ${
              batteryPct > 50 ? 'text-emerald-400' : batteryPct > 20 ? 'text-amber-400' : 'text-red-400'
            }`} />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-zinc-200 leading-tight">{batteryPct}%</span>
              <span className="text-[9px] text-zinc-500 leading-tight">{batteryVolts.toFixed(1)}V</span>
            </div>
          </div>

          {/* Tactical Audio Sound FX Toggle */}
          <button
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
              soundOn
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-sm'
                : 'bg-zinc-800/80 border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
            title={soundOn ? 'Efectos de Audio y Clicks ACTIVADOS' : 'Audio SILENCIADO'}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Tactical Theme Selector */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition cursor-pointer flex items-center gap-1"
              title="Cambiar Tema Táctico"
            >
              <Palette className="w-4 h-4 text-cyan-400" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-2 w-52 bg-[#0e131d] border border-zinc-700 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] font-bold text-zinc-400 px-2 py-1 uppercase tracking-wider border-b border-zinc-800 mb-1">
                  Temas de Cabina Táctica
                </div>
                {themes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChange(t.id);
                      setShowThemeMenu(false);
                      radioAudio.playKeyBeep(1300, 0.04);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition flex items-center justify-between cursor-pointer ${
                      currentTheme === t.id
                        ? 'bg-zinc-800 text-white font-bold border border-zinc-600'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-black" style={{ backgroundColor: t.color }} />
                      <span>{t.name}</span>
                    </div>
                    <span className="text-[9px] text-zinc-500">{t.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Connection Actions */}
          <div className="flex items-center gap-1.5 ml-1">
            {!connected ? (
              <div className="flex items-center gap-1.5">
                {onConnectUsb && (
                  <button
                    onClick={onConnectUsb}
                    title="Conectar por Cable USB-C (Web Serial)"
                    className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold rounded-xl text-[11px] shadow-md shadow-cyan-500/20 transition cursor-pointer active:scale-95"
                  >
                    <Usb className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">USB-C</span>
                  </button>
                )}
                {onConnectBle && (
                  <button
                    onClick={onConnectBle}
                    title="Conectar por Bluetooth LE"
                    className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-[11px] shadow-md shadow-blue-500/20 transition cursor-pointer active:scale-95"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">BLE</span>
                  </button>
                )}
              </div>
            ) : (
              onDisconnect && (
                <button
                  onClick={onDisconnect}
                  title="Desconectar radio"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-xl text-[11px] shadow-sm transition cursor-pointer active:scale-95"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">DESCONECTAR</span>
                </button>
              )
            )}
          </div>

        </div>

      </div>

    </header>
  );
}
