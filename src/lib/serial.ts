/**
 * Web Serial API Driver for TIDRADIO TD-H3 / TD-H8 & nicFW
 * Allows connecting to the radio via standard USB-C cable on Mac / Windows / Linux in Chrome / Edge / Opera.
 */

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  dir: 'tx' | 'rx' | 'info' | 'err';
  hex: string;
  text?: string;
}

export class TidradioSerialDevice {
  port: any = null;
  reader: any = null;
  writer: any = null;
  keepReading: boolean = false;
  
  buf: number[] = [];
  pend: { res: (data: Uint8Array) => void; rej: (err: Error) => void; t: any } | null = null;
  quiero: number = 0;
  
  private _queue: Promise<any> = Promise.resolve();

  onStateChange: (state: { connected: boolean; name?: string; mode?: string }) => void = () => {};
  onLog: (entry: SerialLogEntry) => void = () => {};

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  log(dir: 'tx' | 'rx' | 'info' | 'err', data: Uint8Array | number[] | string, note?: string) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    
    let hexStr = '';
    if (typeof data === 'string') {
      hexStr = data;
    } else {
      const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
      hexStr = Array.from(arr).map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    }

    this.onLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timeStr,
      dir,
      hex: hexStr,
      text: note
    });
  }

  async connect(baudRate: number = 38400): Promise<void> {
    if (!TidradioSerialDevice.isSupported()) {
      throw new Error('Web Serial API no es compatible con este navegador. Por favor usa Chrome, Edge u Opera en Mac/PC.');
    }

    this.log('info', 'Solicitando puerto Serie USB (Cable USB-C)...');

    // Request USB serial port from user
    this.port = await (navigator as any).serial.requestPort();
    
    // Open port with 38400 baud (or 115200 depending on firmware/bootloader mode)
    await this.port.open({
      baudRate: baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096
    });

    this.keepReading = true;
    this.startReadingLoop();

    const info = this.port.getInfo ? this.port.getInfo() : {};
    const vid = info.usbVendorId ? `VID:${info.usbVendorId.toString(16)}` : 'USB-C';
    const pid = info.usbProductId ? `PID:${info.usbProductId.toString(16)}` : 'Serial';
    const portName = `TIDRADIO USB (${vid} ${pid})`;

    this.onStateChange({ connected: true, name: portName, mode: 'USB-C Serial' });
    this.log('info', `Conectado exitosamente por Cable USB-C (${portName}) a ${baudRate} bps`);
  }

  private async startReadingLoop() {
    while (this.port && this.port.readable && this.keepReading) {
      this.reader = this.port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length > 0) {
            const incoming = Array.from(value as Uint8Array);
            this.buf.push(...incoming);
            this.log('rx', value, `Recibidos ${value.length} bytes por USB-C`);

            if (this.pend && this.buf.length >= this.quiero) {
              clearTimeout(this.pend.t);
              const chunk = new Uint8Array(this.buf.splice(0, this.quiero));
              const p = this.pend;
              this.pend = null;
              this.quiero = 0;
              p.res(chunk);
            }
          }
        }
      } catch (err: any) {
        if (this.keepReading) {
          this.log('err', `Error en lectura serie USB: ${err.message}`);
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch (_) {}
          this.reader = null;
        }
      }
    }
  }

  async sendAndExpect(bytes: Uint8Array | number[], expectedLen: number = 0, timeoutMs: number = 2500): Promise<Uint8Array> {
    return this.send(bytes, expectedLen, timeoutMs);
  }

  async send(bytes: Uint8Array | number[], expectedLen: number = 0, timeoutMs: number = 2500): Promise<Uint8Array> {
    return this._enqueue(async () => {
      if (!this.port || !this.port.writable) {
        throw new Error('Puerto USB no disponible o desconectado');
      }

      const outArr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      this.log('tx', outArr, `Enviando ${outArr.length} bytes por USB-C`);

      if (expectedLen <= 0) {
        const writer = this.port.writable.getWriter();
        try {
          await writer.write(outArr);
        } finally {
          writer.releaseLock();
        }
        return new Uint8Array(0);
      }

      // Check if already in buffer
      if (this.buf.length >= expectedLen) {
        const chunk = new Uint8Array(this.buf.splice(0, expectedLen));
        return chunk;
      }

      return new Promise<Uint8Array>(async (resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pend) {
            this.log('err', `Timeout (${timeoutMs}ms) esperando ${expectedLen} bytes USB. En buffer: ${this.buf.length}`);
            this.pend = null;
            this.quiero = 0;
            reject(new Error(`Timeout USB: no se recibieron ${expectedLen} bytes en ${timeoutMs}ms`));
          }
        }, timeoutMs);

        this.quiero = expectedLen;
        this.pend = {
          res: resolve,
          rej: reject,
          t: timer
        };

        const writer = this.port.writable.getWriter();
        try {
          await writer.write(outArr);
        } catch (err) {
          clearTimeout(timer);
          this.pend = null;
          this.quiero = 0;
          writer.releaseLock();
          reject(err);
          return;
        }
        writer.releaseLock();
      });
    });
  }

  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    const p = this._queue.then(task, task);
    this._queue = p.catch(() => {});
    return p;
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (_) {}
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (_) {}
      this.port = null;
    }

    this.onStateChange({ connected: false });
    this.log('info', 'Desconectado de puerto serie USB.');
  }
}
