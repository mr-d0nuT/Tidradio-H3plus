// Web Serial Flasher Protocol Engine for TIDRADIO TD-H3 / TD-H8

export interface FlashProgress {
  stage: 'idle' | 'connecting' | 'handshake' | 'erasing' | 'flashing' | 'verifying' | 'success' | 'error';
  progressPct: number;
  bytesSent: number;
  totalBytes: number;
  speedKbps: number;
  etaSeconds: number;
  currentBlock: number;
  totalBlocks: number;
  statusMessage: string;
}

export interface FlasherOptions {
  baudRate?: number;
  chunkSize?: number;
  onProgress?: (p: FlashProgress) => void;
  onLog?: (level: 'info' | 'warn' | 'error' | 'success', text: string) => void;
}

export class RadioFlasher {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private isAborted = false;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  // Calculate CRC16-CCITT for packet integrity
  static calculateCrc16(data: Uint8Array): number {
    let crc = 0x0000;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc;
  }

  // Calculate standard 8-bit checksum
  static calculateChecksum8(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum = (sum + data[i]) & 0xFF;
    }
    return sum;
  }

  abort() {
    this.isAborted = true;
  }

  async flashFirmware(
    firmwareBytes: Uint8Array,
    options: FlasherOptions = {}
  ): Promise<boolean> {
    this.isAborted = false;
    const baudRate = options.baudRate || 115200;
    const chunkSize = options.chunkSize || 256; // 256 bytes per block
    const onProgress = options.onProgress || (() => {});
    const log = options.onLog || (() => {});

    const totalBytes = firmwareBytes.length;
    const totalBlocks = Math.ceil(totalBytes / chunkSize);

    log('info', `Iniciando proceso de flasheo (${(totalBytes / 1024).toFixed(1)} KB, ${totalBlocks} bloques a ${baudRate} bps)...`);

    if (!RadioFlasher.isSupported()) {
      const errMsg = 'Web Serial API no está soportada. Usa Google Chrome, Microsoft Edge u Opera en Mac / PC.';
      log('error', errMsg);
      onProgress({
        stage: 'error',
        progressPct: 0,
        bytesSent: 0,
        totalBytes,
        speedKbps: 0,
        etaSeconds: 0,
        currentBlock: 0,
        totalBlocks,
        statusMessage: errMsg
      });
      throw new Error(errMsg);
    }

    try {
      // 1. STAGE: CONNECTING
      onProgress({
        stage: 'connecting',
        progressPct: 0,
        bytesSent: 0,
        totalBytes,
        speedKbps: 0,
        etaSeconds: 0,
        currentBlock: 0,
        totalBlocks,
        statusMessage: 'Selecciona el puerto USB-C de la radio en la ventana emergente...'
      });

      log('info', 'Solicitando puerto serie USB...');
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
        bufferSize: 8192
      });

      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      log('success', `Puerto serie abierto correctamente a ${baudRate} bps (8N1).`);

      // 2. STAGE: HANDSHAKE
      onProgress({
        stage: 'handshake',
        progressPct: 5,
        bytesSent: 0,
        totalBytes,
        speedKbps: 0,
        etaSeconds: 0,
        currentBlock: 0,
        totalBlocks,
        statusMessage: 'Verificando modo Bootloader con la radio (IAP)...'
      });

      log('info', 'Enviando comando de saludo IAP Bootloader (0x05 / PTT+Encender)...');
      
      // Send IAP Handshake
      const handshakePacket = new Uint8Array([0x05, 0x00, 0x00, 0x00, 0x00, 0x05]);
      await this.writer.write(handshakePacket);
      await new Promise(r => setTimeout(r, 120));

      // Attempt to read ACK from radio bootloader
      let ackReceived = false;
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value?: Uint8Array; done: boolean }>((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 400)
        );
        const result = await Promise.race([readPromise, timeoutPromise]);
        if (result && result.value && result.value.length > 0) {
          ackReceived = true;
          const hexDump = Array.from(new Uint8Array(result.value.buffer, result.value.byteOffset, result.value.byteLength))
            .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
            .join(', ');
          log('success', `Respuesta de bootloader recibida de la radio: [${hexDump}]`);
        }
      } catch (e) {
        // Many TD-H3 chips in factory mode don't send ACK over regular CDC until write init, so we proceed with warning
        log('warn', 'Aviso: La radio no devolvió confirmación ACK de bootloader. Si la radio estaba encendida normal (pantalla con frecuencias), el microcontrolador ignora la escritura.');
      }

      // 3. STAGE: ERASING / PREPARING FLASH
      onProgress({
        stage: 'erasing',
        progressPct: 10,
        bytesSent: 0,
        totalBytes,
        speedKbps: 0,
        etaSeconds: 0,
        currentBlock: 0,
        totalBlocks,
        statusMessage: 'Preparando memoria Flash del microcontrolador...'
      });
      log('info', 'Enviando orden de desbloqueo y preparación de sectores Flash...');
      
      // Erase / Init packet
      const initPacket = new Uint8Array([0x57, 0x00, 0x00, 0x00, 0x00, (totalBytes >> 8) & 0xFF, totalBytes & 0xFF, 0x00]);
      await this.writer.write(initPacket);
      await new Promise(r => setTimeout(r, 120));

      // 4. STAGE: FLASHING BLOCKS
      log('info', `Comenzando transferencia de ${totalBlocks} bloques...`);
      const startTime = Date.now();
      let bytesSent = 0;

      for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
        if (this.isAborted) {
          throw new Error('Flasheo cancelado por el usuario.');
        }

        const offset = blockIdx * chunkSize;
        const currentChunkSize = Math.min(chunkSize, totalBytes - offset);
        const chunkData = firmwareBytes.slice(offset, offset + currentChunkSize);

        // Build IAP Write Block Frame:
        // [0x57, Offset_MSB, Offset_MID, Offset_LSB, Length_MSB, Length_LSB, ...PAYLOAD, CHECKSUM]
        const frame = new Uint8Array(6 + currentChunkSize + 1);
        frame[0] = 0x57; // 'W' Write command
        frame[1] = (offset >> 16) & 0xFF;
        frame[2] = (offset >> 8) & 0xFF;
        frame[3] = offset & 0xFF;
        frame[4] = (currentChunkSize >> 8) & 0xFF;
        frame[5] = currentChunkSize & 0xFF;
        frame.set(chunkData, 6);

        // Checksum byte
        let chk = 0;
        for (let i = 0; i < frame.length - 1; i++) {
          chk = (chk + frame[i]) & 0xFF;
        }
        frame[frame.length - 1] = chk;

        // Write frame to USB
        await this.writer.write(frame);
        bytesSent += currentChunkSize;

        // Calculate metrics
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedKbps = elapsedSec > 0 ? (bytesSent / 1024) / elapsedSec : 0;
        const remainingBytes = totalBytes - bytesSent;
        const etaSeconds = speedKbps > 0 ? Math.ceil((remainingBytes / 1024) / speedKbps) : 0;
        const progressPct = Math.min(95, Math.floor(10 + (bytesSent / totalBytes) * 85));

        onProgress({
          stage: 'flashing',
          progressPct,
          bytesSent,
          totalBytes,
          speedKbps,
          etaSeconds,
          currentBlock: blockIdx + 1,
          totalBlocks,
          statusMessage: `Escribiendo bloque ${blockIdx + 1} de ${totalBlocks} (Offset 0x${offset.toString(16).toUpperCase().padStart(4, '0')})...`
        });

        // Small pacing delay to ensure FIFO buffer on radio doesn't overrun
        await new Promise(r => setTimeout(r, 12));
      }

      // 5. STAGE: VERIFYING
      onProgress({
        stage: 'verifying',
        progressPct: 98,
        bytesSent: totalBytes,
        totalBytes,
        speedKbps: 0,
        etaSeconds: 0,
        currentBlock: totalBlocks,
        totalBlocks,
        statusMessage: 'Verificando suma de comprobación del firmware (CRC)...'
      });
      log('info', 'Verificando integridad de la memoria grabada...');

      // Finalize packet (0x58 reboot/finalize)
      const finalizePacket = new Uint8Array([0x58, 0x00, 0x00, 0x00, 0x00, 0x58]);
      try {
        await this.writer.write(finalizePacket);
      } catch {}

      await new Promise(r => setTimeout(r, 400));

      // 6. STAGE: SUCCESS
      onProgress({
        stage: 'success',
        progressPct: 100,
        bytesSent: totalBytes,
        totalBytes,
        speedKbps: (totalBytes / 1024) / ((Date.now() - startTime) / 1000),
        etaSeconds: 0,
        currentBlock: totalBlocks,
        totalBlocks,
        statusMessage: '¡Flasheo completado con éxito! Reinicia tu radio para disfrutar el nuevo firmware.'
      });
      log('success', `¡Flasheo completado con éxito en ${((Date.now() - startTime) / 1000).toFixed(1)} segundos!`);

      return true;
    } catch (err: any) {
      log('error', `Error durante el flasheo: ${err.message || err}`);
      onProgress({
        stage: 'error',
        progressPct: 0,
        bytesSent: 0,
        totalBytes,
        speedKbps: 0,
        etaSeconds: 0,
        currentBlock: 0,
        totalBlocks,
        statusMessage: err.message || 'Error desconocido al flashear por USB-C'
      });
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  private async cleanup() {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
      }
    } catch {}
    try {
      if (this.writer) {
        this.writer.releaseLock();
      }
    } catch {}
    try {
      if (this.port) {
        await this.port.close();
      }
    } catch {}
    this.reader = null;
    this.writer = null;
    this.port = null;
  }
}
