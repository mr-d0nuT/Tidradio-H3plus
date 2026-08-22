import React, { useState } from 'react';
import { RadioTower, Sparkles, Zap, PlusCircle, Check, Info } from 'lucide-react';
import { formatFrequency } from '../lib/protocol';

interface BandRange {
  name: string;
  category: string;
  startFreq: number;
  endFreq: number;
  color: string;
  badge: string;
  desc: string;
  modulation: string;
  frequencies: Array<{ name: string; freq: number; tip: string }>;
}

const BAND_REGIONS: BandRange[] = [
  {
    name: "Banda Aérea Civil (AM)",
    category: "AIR",
    startFreq: 108.0,
    endFreq: 137.0,
    color: "from-sky-600 to-blue-700 border-sky-500/40 text-sky-300",
    badge: "✈️ AÉREO",
    desc: "Aviación civil internacional en modulación AM. Torres de control, aproximación y canal de emergencia.",
    modulation: "AM (Modulación en Amplitud)",
    frequencies: [
      { name: "AIR-1215", freq: 121.500, tip: "Canal Internacional de Emergencia y Rescate Aéreo" },
      { name: "AIR-TWR", freq: 118.100, tip: "Torre de Control / Tráfico Aeroportuario" },
      { name: "AIR-APRX", freq: 119.700, tip: "Aproximación y Control de Radar" },
      { name: "AIR-INFO", freq: 123.450, tip: "Frecuencia de Charla e Información Aire-Aire" },
      { name: "AIR-ATIS", freq: 127.600, tip: "Boletín meteorológico continuo ATIS" }
    ]
  },
  {
    name: "Radioafición 2m VHF (144 - 146 MHz)",
    category: "HAM-VHF",
    startFreq: 144.0,
    endFreq: 146.0,
    color: "from-emerald-600 to-teal-700 border-emerald-500/40 text-emerald-300",
    badge: "🟢 2M VHF",
    desc: "Banda de radioaficionados de 2 metros. Incluye la frecuencia nacional de llamada y repetidores analógicos R0 a R7.",
    modulation: "FM (Estrecho/Ancho)",
    frequencies: [
      { name: "HAM-VCAL", freq: 145.500, tip: "Frecuencia Nacional de Llamada Directa en VHF" },
      { name: "HAM-VR0", freq: 145.600, tip: "Repetidor R0 (Shift -600 kHz)" },
      { name: "HAM-VR2", freq: 145.650, tip: "Repetidor R2 (Shift -600 kHz)" },
      { name: "HAM-VR4", freq: 145.700, tip: "Repetidor R4 (Shift -600 kHz)" },
      { name: "HAM-VR7", freq: 145.775, tip: "Repetidor R7 (Shift -600 kHz)" },
      { name: "HAM-VDIR", freq: 145.525, tip: "Canal de QSO Directo Local" }
    ]
  },
  {
    name: "Banda Marina VHF (156 - 162 MHz)",
    category: "MARINE",
    startFreq: 156.0,
    endFreq: 162.0,
    color: "from-cyan-600 to-blue-700 border-cyan-500/40 text-cyan-300",
    badge: "⚓ MARINA",
    desc: "Comunicaciones náuticas marítimas. Canal 16 de socorro, clubes náuticos, puertos y coordinación barco a barco.",
    modulation: "FM (Ancho 25 kHz)",
    frequencies: [
      { name: "MAR-16", freq: 156.800, tip: "Canal 16 de Socorro, Llamada y Salvamento Marítimo" },
      { name: "MAR-09", freq: 156.450, tip: "Canal 9 de Clubes Náuticos y Puertos Deportivos" },
      { name: "MAR-72", freq: 156.625, tip: "Canal 72 Barco a Barco entre Embarcaciones" },
      { name: "MAR-77", freq: 156.875, tip: "Canal 77 Operaciones Portuarias" },
      { name: "MAR-06", freq: 156.300, tip: "Canal 6 de Búsqueda y Rescate Marítimo (SAR)" }
    ]
  },
  {
    name: "Radioafición 70cm UHF (430 - 440 MHz)",
    category: "HAM-UHF",
    startFreq: 430.0,
    endFreq: 440.0,
    color: "from-blue-600 to-indigo-700 border-blue-500/40 text-blue-300",
    badge: "🔵 70CM UHF",
    desc: "Banda de 70 centímetros. Gran alcance urbano, penetración en edificios y repetidores UHF RU690 a RU730.",
    modulation: "FM (Estrecho 12.5 kHz)",
    frequencies: [
      { name: "HAM-UCAL", freq: 433.500, tip: "Frecuencia Nacional de Llamada Directa en UHF" },
      { name: "HAM-U690", freq: 438.625, tip: "Repetidor RU690 (Shift -7.6 MHz)" },
      { name: "HAM-U700", freq: 438.750, tip: "Repetidor RU700 (Shift -7.6 MHz)" },
      { name: "HAM-U720", freq: 439.000, tip: "Repetidor RU720 (Shift -7.6 MHz)" },
      { name: "HAM-LORA", freq: 433.175, tip: "Canal de telemetría y datos APRS/LoRa" }
    ]
  },
  {
    name: "Walkies de Uso Libre PMR446 (446.0 - 446.2 MHz)",
    category: "PMR",
    startFreq: 446.0,
    endFreq: 446.2,
    color: "from-amber-600 to-orange-700 border-amber-500/40 text-amber-300",
    badge: "📻 PMR446",
    desc: "16 canales de uso libre sin licencia para walkie-talkies. Incluye Canal 7-7 (Canal 7 subtono 7 85.4Hz) para rescate y montaña.",
    modulation: "FM (Estrecho 12.5 kHz)",
    frequencies: [
      { name: "PMR-01", freq: 446.00625, tip: "Canal 1 de Walkie Libre (Llamada general)" },
      { name: "SOS-7-7", freq: 446.08125, tip: "Canal 7-7 Seguridad y Rescate en Montaña (Subtono 85.4 Hz)" },
      { name: "PMR-08", freq: 446.09375, tip: "Canal 8 de Walkie Libre (Uso frecuente)" },
      { name: "PMR-09", freq: 446.10625, tip: "Canal 9 de la nueva banda ampliada" },
      { name: "PMR-16", freq: 446.19375, tip: "Canal 16 de Walkie Libre" }
    ]
  },
  {
    name: "Satélites Meteorológicos y Espacio (137 - 145.8 MHz)",
    category: "SPACE",
    startFreq: 137.0,
    endFreq: 145.8,
    color: "from-purple-600 to-pink-700 border-purple-500/40 text-purple-300",
    badge: "🛰️ SATÉLITES",
    desc: "Transmisiones desde el espacio exterior: Estación Espacial Internacional ISS (con astronautas) y satélites meteorológicos NOAA APT.",
    modulation: "FM / WFM",
    frequencies: [
      { name: "SAT-ISS", freq: 145.800, tip: "Estación Espacial Internacional (Voz Astronautas / SSTV imágenes)" },
      { name: "SAT-APRS", freq: 145.825, tip: "Digipeater de paquetes digitales APRS de la ISS" },
      { name: "SAT-NO15", freq: 137.620, tip: "Satélite Meteorológico NOAA-15 (Fotos de la Tierra en directo)" },
      { name: "SAT-NO18", freq: 137.9125, tip: "Satélite Meteorológico NOAA-18" },
      { name: "SAT-NO19", freq: 137.100, tip: "Satélite Meteorológico NOAA-19" }
    ]
  }
];

interface BandPlanViewerProps {
  onTuneFreq?: (freq: number, name: string) => void;
  onAddChannel?: (name: string, freq: number) => void;
}

export function BandPlanViewer({ onTuneFreq, onAddChannel }: BandPlanViewerProps) {
  const [selectedBand, setSelectedBand] = useState<BandRange>(BAND_REGIONS[1]);
  const [copiedFreq, setCopiedFreq] = useState<number | null>(null);

  const handleCopy = (freq: number) => {
    navigator.clipboard.writeText(freq.toFixed(5));
    setCopiedFreq(freq);
    setTimeout(() => setCopiedFreq(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Band Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {BAND_REGIONS.map(band => {
          const isSelected = selectedBand.category === band.category;
          return (
            <button
              key={band.category}
              onClick={() => setSelectedBand(band)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? `bg-gradient-to-br ${band.color} text-white shadow-lg shadow-black/40 scale-[1.02]`
                  : 'bg-[#0f1116] border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <div className="text-[11px] font-bold font-mono truncate">{band.badge}</div>
              <div className="text-[10px] text-zinc-300/80 font-mono mt-0.5 truncate">
                {band.startFreq} - {band.endFreq} MHz
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Band Details Card */}
      <div className="bg-[#10131a] border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-zinc-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${selectedBand.color}`}>
                {selectedBand.badge}
              </span>
              <h3 className="text-sm font-bold text-white">{selectedBand.name}</h3>
            </div>
            <p className="text-xs text-zinc-400 mt-1">{selectedBand.desc}</p>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 bg-[#080a0e] px-3 py-1.5 rounded-lg border border-zinc-800 shrink-0">
            Modulación: <span className="text-cyan-300 font-bold">{selectedBand.modulation}</span>
          </div>
        </div>

        {/* Frequency Chips Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {selectedBand.frequencies.map(f => (
            <div 
              key={f.name}
              className="bg-[#0a0c10] border border-zinc-800/90 hover:border-cyan-500/40 rounded-xl p-3 flex flex-col justify-between transition-colors group"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-xs">{f.name}</span>
                  <span className="font-mono font-black text-cyan-400 text-xs">{formatFrequency(f.freq)} MHz</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">{f.tip}</p>
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-2 mt-2 border-t border-zinc-800/60">
                <button
                  onClick={() => handleCopy(f.freq)}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono rounded-lg transition cursor-pointer"
                  title="Copiar frecuencia"
                >
                  {copiedFreq === f.freq ? <Check className="w-3 h-3 text-emerald-400 inline" /> : 'Copiar'}
                </button>

                {onTuneFreq && (
                  <button
                    onClick={() => onTuneFreq(f.freq, f.name)}
                    className="px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                    title="Sintonizar de inmediato en el VFO activo de la radio"
                  >
                    <Zap className="w-3 h-3 text-cyan-400" />
                    Sintonizar VFO
                  </button>
                )}

                {onAddChannel && (
                  <button
                    onClick={() => onAddChannel(f.name, f.freq)}
                    className="px-2.5 py-1 bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-300 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                    title="Añadir a la lista de canales de memoria"
                  >
                    <PlusCircle className="w-3 h-3 text-blue-400" />
                    + Canal
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
