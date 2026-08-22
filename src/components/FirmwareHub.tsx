import React, { useState } from 'react';
import { 
  Cpu, 
  Download, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle2, 
  Zap, 
  Layers, 
  Terminal, 
  Radio, 
  ArrowRight, 
  Flame, 
  HelpCircle, 
  Sparkles,
  RefreshCw,
  Usb,
  RadioTower,
  BookOpen,
  Info,
  AlertTriangle,
  Wrench,
  Package,
  ChevronDown,
  Globe
} from 'lucide-react';
import { WebFlasher } from './WebFlasher';
import { CollapsibleSection } from './CollapsibleSection';

export function FirmwareHub() {
  const [activeFlasherView, setActiveFlasherView] = useState<'flasher' | 'downloads'>('flasher');

  return (
    <div className="space-y-6">
      
      {/* Compact Top Cockpit Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#0e121a] via-[#121724] to-[#10141f] border border-cyan-500/30 rounded-2xl p-4 sm:p-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 text-[11px] font-mono font-bold">
              <Sparkles className="w-3 h-3" />
              ÚLTIMA VERSIÓN OFICIAL: TD-H3 PLUS 1.0.50 (1.0.5) • 2026.07.29
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Flasheo y Centro de Firmware TIDRADIO TD-H3 Plus
            </h2>
            <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
              Flashea directamente la <b>versión oficial TD-H3 Plus 1.0.50 (1.0.5)</b> o recupera la radio mediante cable USB-C a 115200 baudios sin drivers externos.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://tidradio.com/pages/firmware"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Web Oficial TIDRADIO</span>
              <ExternalLink className="w-3 h-3 text-emerald-400/70" />
            </a>
          </div>
        </div>
      </div>

      {/* Official TIDRADIO Releases Registry Card */}
      <div className="bg-[#0b0e14] border border-cyan-500/20 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold font-mono tracking-wider text-zinc-200 uppercase">
              Registro Oficial de Versiones TIDRADIO (tidradio.com)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">Verificado Oficialmente</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* TD-H3 Plus */}
          <div className="bg-[#121622] border-2 border-emerald-500/50 rounded-xl p-3.5 space-y-1.5 relative overflow-hidden shadow-lg shadow-emerald-950/40">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
                ÚLTIMA VERSIÓN
              </span>
              <span className="text-[11px] font-mono text-zinc-400">2026.07.29</span>
            </div>
            <div className="text-sm font-black text-white">TD-H3 Plus v1.0.50 (1.0.5)</div>
            <p className="text-[11px] text-zinc-300 leading-snug">
              Calibración de RF BK4819, nuevo Squelch dinámico y decodificación instantánea CTCSS/DCS.
            </p>
          </div>

          {/* TD-H3 Classic */}
          <div className="bg-[#0e1118] border border-zinc-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                TD-H3 CLÁSICA
              </span>
              <span className="text-[11px] font-mono text-zinc-400">17.03.2025</span>
            </div>
            <div className="text-sm font-bold text-zinc-200">TD-H3 v250317</div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Revisión estable de fábrica para la primera generación TD-H3 estándar.
            </p>
          </div>

          {/* TD-H9 / H8 Gen3 */}
          <div className="bg-[#0e1118] border border-zinc-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                SERIE TD-H9 / H8
              </span>
              <span className="text-[11px] font-mono text-zinc-400">2026</span>
            </div>
            <div className="text-sm font-bold text-zinc-200">TD-H9 v1.0.33 / APRS v1.0.15</div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Firmwares oficiales complementarios de TIDRADIO para la gama H9 y H8 Gen3.
            </p>
          </div>
        </div>
      </div>

      {/* Main Flasher Core (Front and Center) */}
      <WebFlasher />

      {/* Collapsible Guides & Documentation (Folded by Default for clean UI) */}
      <div className="space-y-3 pt-2">
        
        {/* Accordion 1: Guía de 3 pasos */}
        <CollapsibleSection
          title="Guía Rápida de Instalación en 3 Pasos"
          subtitle="Procedimiento de conexión de cable USB y modo bootloader"
          icon={BookOpen}
          badge="Guía Rápida"
          badgeColor="bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0b0d12] border border-zinc-800/90 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black text-xs">
                1
              </div>
              <h4 className="text-xs font-bold text-white">Conectar Cable USB-C</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Apaga el walkie con la rueda de volumen. Conéctalo al PC con un cable USB-A a USB-C con soporte de datos (preferiblemente puertos traseros del ordenador).
              </p>
            </div>

            <div className="bg-[#0b0d12] border border-zinc-800/90 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xs">
                2
              </div>
              <h4 className="text-xs font-bold text-white">Modo Bootloader</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                <b>• TD-H3 PLUS:</b> Enciende y mantén pulsada la <b>tecla [8]</b> (o PTT+[3] al encender). Pantalla apagada y LED verde (sin linterna).<br/>
                <b>• TD-H3 Clásica:</b> Mantén <b>PTT</b> y enciende (linterna blanca fija).
              </p>
            </div>

            <div className="bg-[#0b0d12] border border-zinc-800/90 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xs">
                3
              </div>
              <h4 className="text-xs font-bold text-white">Flashear desde Navegador</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Pulsa "CONECTAR Y FLASHEAR", elige el puerto COM del walkie en la ventana de Chrome/Edge y espera 35 segundos hasta completar el 100%.
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Accordion 2: Troubleshooting / Congelación de flasher */}
        <CollapsibleSection
          title="¿Se cuelga el Flasher o no conecta? Solución a las 3 Causas Típicas"
          subtitle="Comprobaciones de hardware, modo bootloader y bloqueo de puertos COM"
          icon={AlertTriangle}
          badge="Solución de Problemas"
          badgeColor="bg-amber-500/15 text-amber-300 border-amber-500/30"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[#0a0c10] border border-red-500/20 rounded-xl p-4 space-y-2">
              <div className="font-bold text-red-400 font-mono text-[11px]">CAUSA #1 (80%)</div>
              <h4 className="font-bold text-white">No estaba en modo Bootloader</h4>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Si la radio muestra frecuencias en pantalla, la flash está bloqueada contra escritura. Apágala y usa el atajo correspondiente (Tecla [8] en PLUS, o PTT en Clásica).
              </p>
            </div>

            <div className="bg-[#0a0c10] border border-amber-500/20 rounded-xl p-4 space-y-2">
              <div className="font-bold text-amber-400 font-mono text-[11px]">CAUSA #2 (15%)</div>
              <h4 className="font-bold text-white">Cable USB-C a USB-C Power Delivery</h4>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                El TD-H3 no soporta negociación Power Delivery. Usa siempre un cable <b>USB-A a USB-C</b> conectado a los puertos de la placa base, evitando hubs sin corriente.
              </p>
            </div>

            <div className="bg-[#0a0c10] border border-blue-500/20 rounded-xl p-4 space-y-2">
              <div className="font-bold text-blue-400 font-mono text-[11px]">CAUSA #3 (5%)</div>
              <h4 className="font-bold text-white">ODmaster o CHIRP en segundo plano</h4>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Los puertos COM son exclusivos en Windows. Cierra ODmaster, CHIRP o Arduino IDE desde el Administrador de Tareas antes de conectar el flasheador web.
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Accordion 3: Enlaces Oficiales */}
        <CollapsibleSection
          title="Enlaces Oficiales, Repositorios de Código y Manuales"
          subtitle="Descargas directas, esquemáticos y documentación de desarrollo"
          icon={Cpu}
          badge="Enlaces"
          badgeColor="bg-purple-500/15 text-purple-300 border-purple-500/30"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="https://tidradio.com/pages/firmware"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-[#0a0c10] border border-emerald-500/30 hover:border-emerald-500 rounded-xl flex items-center justify-between transition group"
            >
              <div>
                <div className="text-xs font-bold text-white group-hover:text-emerald-300">Descargas Oficiales TIDRADIO</div>
                <div className="text-[10px] text-zinc-400">tidradio.com/pages/firmware</div>
              </div>
              <ExternalLink className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </a>

            <a
              href="https://github.com/nicsure/TD-H3-Engineering"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-[#0a0c10] border border-zinc-800 hover:border-cyan-500/40 rounded-xl flex items-center justify-between transition group"
            >
              <div>
                <div className="text-xs font-bold text-white group-hover:text-cyan-300">GitHub TD-H3 Engineering</div>
                <div className="text-[10px] text-zinc-400">Protocolos y herramientas</div>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400" />
            </a>

            <a
              href="https://walkietalkiesoftware.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-[#0a0c10] border border-zinc-800 hover:border-cyan-500/40 rounded-xl flex items-center justify-between transition group"
            >
              <div>
                <div className="text-xs font-bold text-white group-hover:text-cyan-300">WalkieTalkieSoftware</div>
                <div className="text-[10px] text-zinc-400">Drivers CH340 y programas CPS</div>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400" />
            </a>
          </div>
        </CollapsibleSection>

      </div>

    </div>
  );
}
