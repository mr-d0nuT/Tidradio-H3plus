export const SRV = 0xFF00;
export const C_NOTIF = 0xFF01;
export const C_ESCR = 0xFF02;

export interface BleLogEntry {
  id: string;
  timestamp: string;
  dir: 'tx' | 'rx' | 'info' | 'err';
  hex: string;
  text?: string;
}

export class TidradioDevice {
  device: BluetoothDevice | null = null;
  server: BluetoothRemoteGATTServer | null = null;
  chNotif: BluetoothRemoteGATTCharacteristic | null = null;
  chEscr: BluetoothRemoteGATTCharacteristic | null = null;
  
  buf: number[] = [];
  pend: { res: (data: Uint8Array) => void; rej: (err: Error) => void; t: any } | null = null;
  quiero: number = 0;
  
  private _queue: Promise<any> = Promise.resolve();

  onStateChange: (state: { connected: boolean; name?: string; mode?: string }) => void = () => {};
  onLog: (entry: BleLogEntry) => void = () => {};

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

  async connect(): Promise<void> {
    this.log('info', 'Buscando dispositivo Bluetooth con prefijo TD-H3...');
    
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "TD-H3" }],
        optionalServices: [SRV]
      });
    } catch (e: any) {
      if (e.name === "NotFoundError" || e.name === "TypeError") {
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [SRV]
        });
      } else {
        throw e;
      }
    }

    if (!this.device) throw new Error("No se seleccionó ningún dispositivo");

    this.device.addEventListener("gattserverdisconnected", () => {
      this.log('err', 'GATT desconectado de la radio');
      this.onStateChange({ connected: false });
    });

    this.log('info', `Conectando a GATT server de ${this.device.name || 'radio'}...`);
    this.server = await this.device.gatt?.connect() ?? null;
    if (!this.server) throw new Error("No se pudo conectar al servidor GATT");

    const srv = await this.server.getPrimaryService(SRV);
    this.chNotif = await srv.getCharacteristic(C_NOTIF);
    this.chEscr = await srv.getCharacteristic(C_ESCR);

    await this.chNotif.startNotifications();
    this.chNotif.addEventListener("characteristicvaluechanged", this.handleReceive.bind(this));
    
    this.log('info', `Servicio 0x${SRV.toString(16).toUpperCase()} listo. Notificaciones activadas.`);
    this.onStateChange({ connected: true, name: this.device.name || "TD-H3" });
  }

  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  private handleReceive(ev: any) {
    const value = ev.target.value;
    const d = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    for (let i = 0; i < d.length; i++) {
      this.buf.push(d[i]);
    }
    
    this.log('rx', d);

    if (this.pend && this.buf.length >= this.quiero) {
      const p = this.pend;
      this.pend = null;
      clearTimeout(p.t);
      const r = new Uint8Array(this.buf);
      this.buf = [];
      p.res(r);
    }
  }

  private async _rawWrite(data: Uint8Array | number[]): Promise<void> {
    const u = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!this.chEscr) {
      throw new Error("Característica de escritura no disponible");
    }

    this.log('tx', u);

    const charac = this.chEscr as any;
    try {
      if (typeof charac.writeValueWithResponse === 'function' && charac.properties?.write) {
        await charac.writeValueWithResponse(u);
      } else if (typeof charac.writeValueWithoutResponse === 'function' && charac.properties?.writeWithoutResponse) {
        await charac.writeValueWithoutResponse(u);
      } else if (typeof charac.writeValue === 'function') {
        await charac.writeValue(u);
      } else {
        await charac.writeValue(u);
      }
    } catch (err: any) {
      if (typeof charac.writeValue === 'function') {
        await charac.writeValue(u);
      } else {
        throw err;
      }
    }
  }

  private _expect(len: number, timeoutMs = 2500): Promise<Uint8Array> {
    this.quiero = len;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (!this.pend || this.pend.t !== t) return;
        this.pend = null;
        if (this.buf.length > 0) {
          const r = new Uint8Array(this.buf);
          this.buf = [];
          resolve(r);
        } else {
          reject(new Error("Timeout: la radio no contestó a tiempo"));
        }
      }, timeoutMs);
      this.pend = { res: resolve, rej: reject, t };
    });
  }

  async send(data: Uint8Array | number[]): Promise<void> {
    return this.enqueue(async () => {
      await this._rawWrite(data);
    });
  }

  async sendAndExpect(data: Uint8Array | number[], expectLen: number, timeoutMs = 2500): Promise<Uint8Array> {
    return this.enqueue(async () => {
      this.buf = [];
      if (this.pend) {
        clearTimeout(this.pend.t);
        this.pend = null;
      }
      
      const p = this._expect(expectLen, timeoutMs);
      try {
        await this._rawWrite(data);
        return await p;
      } catch (err) {
        if (this.pend) {
          clearTimeout(this.pend.t);
          this.pend = null;
        }
        throw err;
      }
    });
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this._queue.then(() => task()).catch(async (err) => {
      // Allow subsequent queue calls even if this task fails
      throw err;
    });
    this._queue = next.catch(() => {});
    return next;
  }
}
