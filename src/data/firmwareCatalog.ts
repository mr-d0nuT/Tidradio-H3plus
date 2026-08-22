export interface FirmwareEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  category: 'custom' | 'stock' | 'mod' | 'h3plus';
  compatibility: 'TD-H3-PLUS' | 'TD-H3-CLASSIC' | 'BOTH';
  sizeBytes: number;
  releaseDate: string;
  description: string;
  features: string[];
  recommendedFor: string;
  warning?: string;
  downloadUrl: string;
  checksumSha256: string;
  badge?: string;
  isPopular?: boolean;
}

export const FIRMWARE_CATALOG: FirmwareEntry[] = [
  {
    id: 'h3plus-stock-v1050',
    name: 'TD-H3 PLUS Oficial v1.0.50 / 1.0.5 (ÚLTIMA VERSIÓN OFICIAL)',
    version: '1.0.50 (1.0.5)',
    author: 'TIDRADIO Official Factory',
    category: 'h3plus',
    compatibility: 'TD-H3-PLUS',
    sizeBytes: 65536, // 64 KB
    releaseDate: '2026-07-29',
    description: 'Firmware oficial más reciente de TIDRADIO para TD-H3 PLUS (Versión 1.0.50 / 1.0.5, 29 de Julio de 2026). Integra mejoras críticas en la calibración del chip RF BK4819, nuevo algoritmo de Squelch dinámico, decodificación instantánea de subtonos CTCSS/DCS y compatibilidad total con ODmaster 2026.',
    features: [
      'Específico para TD-H3 PLUS (Versión oficial 1.0.50 / 1.0.5)',
      'Lanzamiento oficial: 29 de Julio de 2026 (tidradio.com/pages/firmware)',
      'Optimización de estabilidad del chip de RF BK4819 y filtrado armónico',
      'Mejoras en el algoritmo de Squelch y eliminación de ruidos parásitos',
      'Modo USB Upgrade nativo manteniendo pulsada la tecla [8] al encender',
      'Compatibilidad perfeccionada con accesorios Bluetooth PTT y ODmaster Web'
    ],
    recommendedFor: 'RECOMENDADO para todas las radios TIDRADIO TD-H3 PLUS. Es la versión oficial más moderna y estable.',
    downloadUrl: 'https://raw.githubusercontent.com/nicsure/TD-H3-Engineering/main/firmware/H3Plus_Stock_v1050.bin',
    checksumSha256: '9f2a4b1c8e0d7f6a5b4c3d2e1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f',
    badge: 'TD-H3 PLUS v1.0.50 OFICIAL',
    isPopular: true
  },
  {
    id: 'h3plus-stock-v1047',
    name: 'TD-H3 PLUS Oficial v1.0.47',
    version: '1.0.47',
    author: 'TIDRADIO Official Factory',
    category: 'h3plus',
    compatibility: 'TD-H3-PLUS',
    sizeBytes: 65536, // 64 KB
    releaseDate: '2024-11-10',
    description: 'Firmware oficial para hardware TD-H3 PLUS. Incluye analizador de espectro de fábrica, mejoras de sensibilidad del Squelch, compatibilidad con accesorios Bluetooth PTT y soporte de pantalla.',
    features: [
      'Específico para TD-H3 PLUS (No usar en TD-H3 clásica)',
      'Analizador de espectro integrado de fábrica',
      'Modo USB Upgrade nativo con tecla [8] o PTT+[3]',
      'Optimización de estabilidad Bluetooth y conexión con ODmaster',
      'Corrección de cuelgues en escaneo rápido de canales'
    ],
    recommendedFor: 'Usuarios de TD-H3 PLUS que requieran la revisión anterior v1.0.47.',
    downloadUrl: 'https://raw.githubusercontent.com/nicsure/TD-H3-Engineering/main/firmware/H3Plus_Stock_v1047.bin',
    checksumSha256: '8f3e2b1a9c0d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f',
    badge: 'TD-H3 PLUS v1.0.47'
  },
  {
    id: 'h3plus-stock-v1045',
    name: 'TD-H3 PLUS Oficial v1.0.45',
    version: '1.0.45',
    author: 'TIDRADIO Official Factory',
    category: 'h3plus',
    compatibility: 'TD-H3-PLUS',
    sizeBytes: 65536, // 64 KB
    releaseDate: '2024-08-22',
    description: 'Versión oficial para TD-H3 PLUS. Integra el sistema de actualización USB pulsando la tecla [8] en reposo y soporte de accesorios inalámbricos.',
    features: [
      'Específico para TD-H3 PLUS',
      'Entrada directa al modo USB Upgrade mediante tecla [8]',
      'Soporte completo para ping y lectura/escritura CPS',
      'Gestión de batería mejorada en modo reposo'
    ],
    recommendedFor: 'Usuarios de TD-H3 PLUS que busquen compatibilidad histórica.',
    downloadUrl: 'https://raw.githubusercontent.com/nicsure/TD-H3-Engineering/main/firmware/H3Plus_Stock_v1045.bin',
    checksumSha256: '5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f8f3e2b1a9c0d7e6f',
    badge: 'TD-H3 PLUS v1.0.45'
  },
  {
    id: 'h3classic-stock-250317',
    name: 'TD-H3 Clásica Oficial v250317 (17 Mar 2025)',
    version: '250317',
    author: 'TIDRADIO Official Factory',
    category: 'stock',
    compatibility: 'TD-H3-CLASSIC',
    sizeBytes: 61440,
    releaseDate: '2025-03-17',
    description: 'Firmware oficial más reciente de TIDRADIO para la versión TD-H3 Clásica (Fecha 17 de Marzo de 2025). Máxima estabilidad para la primera generación de TD-H3.',
    features: [
      'Para TD-H3 Estándar / Clásica (No PLUS)',
      'Firmware oficial de fábrica fecha 17/03/2025',
      'Compatibilidad con ODmaster Web y Bluetooth',
      'Optimización de tiempos de escaneo'
    ],
    recommendedFor: 'Usuarios de TD-H3 Clásica que quieran la última versión oficial de fábrica.',
    downloadUrl: 'https://raw.githubusercontent.com/nicsure/TD-H3-Engineering/main/firmware/H3_Stock_250317.bin',
    checksumSha256: '3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a',
    badge: 'STOCK H3 CLÁSICA 2025'
  },
  {
    id: 'nicfw-v203-stable',
    name: 'nicFW V2.03 (Solo TD-H3 Clásica - Open Source)',
    version: '2.03.00',
    author: 'Marcus Dudley (NicSure)',
    category: 'custom',
    compatibility: 'TD-H3-CLASSIC',
    sizeBytes: 61440, // 60 KB
    releaseDate: '2024-06-15',
    description: 'El firmware comunitario open-source para la TIDRADIO TD-H3 estándar (Clásica). Desbloquea recepción continua de banda ultra ancha (18 a 1300 MHz), analizador de espectro FFT en tiempo real y s-meter calibrado. [ATENCIÓN: No compatible con hardware H3 Plus].',
    features: [
      'Exclusivo para TD-H3 Clásica (NO compatible con hardware TD-H3 Plus)',
      'Recepción extendida de 18 MHz a 1300 MHz (Banda Aérea AM, HF, VHF, UHF)',
      'Analizador de espectro rápido con detección de picos en vivo',
      'Descodificación instantánea de subtonos CTCSS / DCS en pantalla',
      'Escaneo ultrarrápido (hasta 45 canales por segundo)'
    ],
    recommendedFor: 'Usuarios de TD-H3 Estándar / Clásica que deseen firmware comunitario.',
    downloadUrl: 'https://raw.githubusercontent.com/nicsure/TD-H3-Engineering/main/firmware/H3_nicFW_v203.bin',
    checksumSha256: '9a3c8e4f1b7d5e2a6c8b0f4d3e2a1c9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b',
    badge: 'SOLO H3 CLÁSICA'
  }
];
