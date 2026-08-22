import React, { useEffect, useRef, useState } from 'react';
import { Activity, Radio, Volume2, VolumeX, Eye, Maximize2, Zap, RefreshCw, Sliders, Waves } from 'lucide-react';
import { radioAudio } from '../lib/audio';
import { formatFrequency } from '../lib/protocol';

interface SdrWaterfallProps {
  centerFreq: number; // in MHz
  activeVfo?: 'A' | 'B';
  onTune?: (freq: number) => void;
  rssi?: number; // 0-100 or -120 to -40 dBm
  isReceiving?: boolean;
}

export function SdrWaterfall({
  centerFreq,
  activeVfo = 'A',
  onTune,
  rssi = 45,
  isReceiving = false
}: SdrWaterfallProps) {
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [spanKhz, setSpanKhz] = useState<number>(500); // 500 kHz span
  const [squelchDb, setSquelchDb] = useState<number>(-85);
  const [colorMap, setColorMap] = useState<'cyan' | 'green' | 'amber' | 'rainbow'>('cyan');
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [soundStatic, setSoundStatic] = useState<boolean>(false);
  const [hoverFreq, setHoverFreq] = useState<number | null>(null);

  // Peak signal detection state
  const [peakSignal, setPeakSignal] = useState<{ freq: number; dbm: number } | null>(null);

  // Animation frame ref
  const animRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const waterfallDataRef = useRef<ImageData | null>(null);

  // Toggle sound static
  const handleToggleSound = () => {
    const next = !soundStatic;
    setSoundStatic(next);
    if (next) {
      radioAudio.playSquelchTail(0.3);
    }
  };

  useEffect(() => {
    const spectrumCanvas = spectrumCanvasRef.current;
    const waterfallCanvas = waterfallCanvasRef.current;
    if (!spectrumCanvas || !waterfallCanvas) return;

    const sCtx = spectrumCanvas.getContext('2d');
    const wCtx = waterfallCanvas.getContext('2d');
    if (!sCtx || !wCtx) return;

    const width = spectrumCanvas.width;
    const height = spectrumCanvas.height;
    const wHeight = waterfallCanvas.height;

    // Synthetic RF noise simulation + Carrier Peaks based on center frequency
    const render = () => {
      phaseRef.current += 0.05;
      const phase = phaseRef.current;

      // 1. Clear Spectrum
      sCtx.fillStyle = '#05080e';
      sCtx.fillRect(0, 0, width, height);

      // Grid Lines
      sCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      sCtx.lineWidth = 1;
      sCtx.setLineDash([4, 4]);

      // Vertical freq grid
      for (let x = 0; x < width; x += width / 8) {
        sCtx.beginPath();
        sCtx.moveTo(x, 0);
        sCtx.lineTo(x, height);
        sCtx.stroke();
      }
      // Horizontal dBm grid (-120dBm to -40dBm)
      for (let y = 0; y < height; y += height / 5) {
        sCtx.beginPath();
        sCtx.moveTo(0, y);
        sCtx.lineTo(width, y);
        sCtx.stroke();
      }
      sCtx.setLineDash([]);

      // 2. Generate FFT Points
      const numPoints = width;
      const fftData: number[] = [];
      let maxDb = -130;
      let maxFreq = centerFreq;

      const centerIdx = width / 2;
      const carrierWidth = 14;

      for (let i = 0; i < numPoints; i++) {
        // Noise floor with slight ripple
        const noise = -115 + Math.random() * 8 + Math.sin((i / 40) + phase) * 3;
        let signal = noise;

        // Carrier on center frequency if receiving or strong RSSI
        const distFromCenter = Math.abs(i - centerIdx);
        if (distFromCenter < carrierWidth) {
          const carrierHeight = isReceiving ? 65 : (rssi > 30 ? (rssi / 100) * 55 : 20);
          const bump = Math.cos((distFromCenter / carrierWidth) * (Math.PI / 2)) * carrierHeight;
          signal += bump;
        }

        // Add 2 realistic harmonic peaks in the span
        const leftHarmonic = centerIdx - width * 0.28;
        if (Math.abs(i - leftHarmonic) < 8) {
          signal += Math.cos((Math.abs(i - leftHarmonic) / 8) * (Math.PI / 2)) * 32;
        }

        const rightHarmonic = centerIdx + width * 0.35;
        if (Math.abs(i - rightHarmonic) < 10) {
          signal += Math.cos((Math.abs(i - rightHarmonic) / 10) * (Math.PI / 2)) * 40;
        }

        fftData.push(signal);

        if (signal > maxDb) {
          maxDb = signal;
          const freqOffset = ((i - centerIdx) / width) * (spanKhz / 1000);
          maxFreq = centerFreq + freqOffset;
        }
      }

      setPeakSignal({ freq: maxFreq, dbm: Math.round(maxDb) });

      // Squelch Line
      const squelchY = height - ((squelchDb + 125) / 85) * height;
      sCtx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      sCtx.lineWidth = 1.5;
      sCtx.setLineDash([6, 3]);
      sCtx.beginPath();
      sCtx.moveTo(0, squelchY);
      sCtx.lineTo(width, squelchY);
      sCtx.stroke();
      sCtx.setLineDash([]);

      // Squelch label
      sCtx.fillStyle = '#ef4444';
      sCtx.font = '10px JetBrains Mono';
      sCtx.fillText(`SQL: ${squelchDb} dBm`, 6, squelchY - 4);

      // 3. Draw Spectrum Curve & Gradient Fill
      sCtx.beginPath();
      sCtx.moveTo(0, height);

      for (let i = 0; i < numPoints; i++) {
        // Map dBm (-125 to -40) to canvas Y (height to 0)
        const db = fftData[i];
        const y = height - ((db + 125) / 85) * height;
        if (i === 0) sCtx.moveTo(i, y);
        else sCtx.lineTo(i, y);
      }

      // Gradient Fill
      const grad = sCtx.createLinearGradient(0, 0, 0, height);
      if (colorMap === 'cyan') {
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.7)');
        grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.25)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0.02)');
        sCtx.strokeStyle = '#22d3ee';
      } else if (colorMap === 'green') {
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.7)');
        grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.25)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
        sCtx.strokeStyle = '#34d399';
      } else if (colorMap === 'amber') {
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.7)');
        grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0.02)');
        sCtx.strokeStyle = '#fbbf24';
      } else {
        grad.addColorStop(0, 'rgba(236, 72, 153, 0.7)');
        grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.3)');
        grad.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
        sCtx.strokeStyle = '#f472b6';
      }

      sCtx.lineWidth = 1.8;
      sCtx.stroke();

      // Complete path for fill
      sCtx.lineTo(width, height);
      sCtx.lineTo(0, height);
      sCtx.fillStyle = grad;
      sCtx.fill();

      // Center Marker Line (Tuned VFO Frequency)
      sCtx.strokeStyle = '#06b6d4';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      sCtx.moveTo(centerIdx, 0);
      sCtx.lineTo(centerIdx, height);
      sCtx.stroke();

      // Center Marker Arrow
      sCtx.fillStyle = '#06b6d4';
      sCtx.beginPath();
      sCtx.moveTo(centerIdx - 6, 0);
      sCtx.lineTo(centerIdx + 6, 0);
      sCtx.lineTo(centerIdx, 8);
      sCtx.closePath();
      sCtx.fill();

      // 4. Update Waterfall Canvas (Shift down 1 pixel and write new scanline)
      if (isScanning) {
        // Shift existing waterfall down
        wCtx.drawImage(waterfallCanvas, 0, 0, width, wHeight - 1, 0, 1, width, wHeight - 1);

        // Draw new top row
        const rowImage = wCtx.createImageData(width, 1);
        for (let i = 0; i < width; i++) {
          const db = fftData[i];
          const norm = Math.max(0, Math.min(1, (db + 120) / 75)); // 0.0 to 1.0

          let r = 0, g = 0, b = 0;
          if (colorMap === 'cyan') {
            r = Math.floor(norm * 40);
            g = Math.floor(norm * 220);
            b = Math.floor(norm * 255);
          } else if (colorMap === 'green') {
            r = Math.floor(norm * 20);
            g = Math.floor(norm * 240);
            b = Math.floor(norm * 80);
          } else if (colorMap === 'amber') {
            r = Math.floor(norm * 255);
            g = Math.floor(norm * 180);
            b = Math.floor(norm * 20);
          } else {
            // Rainbow
            if (norm < 0.25) {
              b = Math.floor(norm * 4 * 255);
            } else if (norm < 0.5) {
              g = Math.floor((norm - 0.25) * 4 * 255);
              b = 255;
            } else if (norm < 0.75) {
              r = Math.floor((norm - 0.5) * 4 * 255);
              g = 255;
            } else {
              r = 255;
              g = Math.floor((1 - (norm - 0.75) * 4) * 255);
            }
          }

          const idx = i * 4;
          rowImage.data[idx] = r;
          rowImage.data[idx + 1] = g;
          rowImage.data[idx + 2] = b;
          rowImage.data[idx + 3] = 255;
        }
        wCtx.putImageData(rowImage, 0, 0);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [centerFreq, spanKhz, squelchDb, colorMap, isScanning, isReceiving, rssi]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const freqOffset = (ratio - 0.5) * (spanKhz / 1000);
    const targetFreq = Number((centerFreq + freqOffset).toFixed(5));

    radioAudio.playKeyBeep(1400, 0.05);
    if (onTune) {
      onTune(targetFreq);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const freqOffset = (ratio - 0.5) * (spanKhz / 1000);
    setHoverFreq(Number((centerFreq + freqOffset).toFixed(5)));
  };

  const startFreq = centerFreq - spanKhz / 2000;
  const endFreq = centerFreq + spanKhz / 2000;

  return (
    <div className="bg-[#090c12] border border-cyan-500/30 rounded-2xl overflow-hidden shadow-2xl space-y-0">
      
      {/* SDR Header Toolbar */}
      <div className="bg-[#0e131d] px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Waves className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-white font-display tracking-wider">
                ANALIZADOR DE ESPECTRO SDR & WATERFALL
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                REALTIME 60 FPS
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              VFO {activeVfo}: <span className="text-cyan-400 font-bold">{formatFrequency(centerFreq)} MHz</span> | Ancho de Barrido: ±{(spanKhz / 2)} kHz
            </p>
          </div>
        </div>

        {/* Quick Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Span Switcher */}
          <div className="flex items-center bg-[#07090e] p-1 rounded-xl border border-zinc-800 text-[11px] font-mono">
            <span className="text-zinc-500 px-1.5 text-[10px]">SPAN:</span>
            {[200, 500, 1000, 2000].map(s => (
              <button
                key={s}
                onClick={() => {
                  setSpanKhz(s);
                  radioAudio.playKeyBeep(1100, 0.03);
                }}
                className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                  spanKhz === s
                    ? 'bg-cyan-500 text-black font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {s >= 1000 ? `${s / 1000}M` : `${s}k`}
              </button>
            ))}
          </div>

          {/* Color Scheme */}
          <div className="flex items-center bg-[#07090e] p-1 rounded-xl border border-zinc-800 text-[11px] font-mono">
            {(['cyan', 'green', 'amber', 'rainbow'] as const).map(c => (
              <button
                key={c}
                onClick={() => setColorMap(c)}
                className={`w-5 h-5 rounded-lg transition cursor-pointer flex items-center justify-center ${
                  colorMap === c ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  background:
                    c === 'cyan' ? '#06b6d4' : c === 'green' ? '#10b981' : c === 'amber' ? '#f59e0b' : 'linear-gradient(45deg, #ec4899, #06b6d4)'
                }}
                title={`Tema ${c}`}
              />
            ))}
          </div>

          {/* Sound Squelch Static Toggle */}
          <button
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
              soundStatic
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
            }`}
            title="Squelch Audio Simulador"
          >
            {soundStatic ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-bold">{soundStatic ? 'SQL ON' : 'MUTE'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Canvases (Spectrum Top + Waterfall Bottom) */}
      <div className="p-3 sm:p-4 space-y-2 bg-[#06080e] relative">
        
        {/* Spectrum Canvas */}
        <div className="relative rounded-xl overflow-hidden border border-zinc-800 crt-overlay">
          <canvas
            ref={spectrumCanvasRef}
            width={720}
            height={160}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoverFreq(null)}
            className="w-full h-40 cursor-crosshair block"
          />

          {/* Hover Frequency Tooltip */}
          {hoverFreq && (
            <div className="absolute top-2 left-2 bg-black/85 border border-cyan-500 text-cyan-300 text-[11px] font-mono px-2 py-1 rounded-lg pointer-events-none shadow-lg z-10 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>Clic para sintonizar: <b>{formatFrequency(hoverFreq)} MHz</b></span>
            </div>
          )}

          {/* Peak Signal Readout */}
          {peakSignal && (
            <div className="absolute top-2 right-2 bg-black/85 border border-zinc-700 text-zinc-300 text-[10px] font-mono px-2 py-1 rounded-lg pointer-events-none z-10">
              Pico RF: <span className="text-emerald-400 font-bold">{peakSignal.freq.toFixed(4)} MHz</span> ({peakSignal.dbm} dBm)
            </div>
          )}
        </div>

        {/* Frequency Scale Bar */}
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 px-1 select-none">
          <span>{startFreq.toFixed(4)} MHz</span>
          <span className="text-cyan-400 font-bold">▲ VFO: {formatFrequency(centerFreq)} MHz ▲</span>
          <span>{endFreq.toFixed(4)} MHz</span>
        </div>

        {/* Waterfall Canvas */}
        <div className="rounded-xl overflow-hidden border border-zinc-800 crt-overlay">
          <canvas
            ref={waterfallCanvasRef}
            width={720}
            height={140}
            className="w-full h-32 block"
          />
        </div>

        {/* Squelch & RF Tuning Slider */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-[11px] text-zinc-400 shrink-0">Umbral Squelch (SQL):</span>
            <input
              type="range"
              min={-120}
              max={-45}
              value={squelchDb}
              onChange={e => setSquelchDb(Number(e.target.value))}
              className="w-40 accent-red-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
            />
            <span className="text-red-400 font-bold shrink-0">{squelchDb} dBm</span>
          </div>

          <div className="text-[11px] text-zinc-500 flex items-center gap-2 self-end sm:self-auto">
            <span>Haz clic en cualquier pico del espectro para sintonizar en vivo.</span>
          </div>
        </div>

      </div>

    </div>
  );
}
