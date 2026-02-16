const isDev = __DEV__;

export const logger = {
  ble: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[BLE] ${message}`, data !== undefined ? data : "");
    }
  },
  echo: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[ECHO] ${message}`, data !== undefined ? data : "");
    }
  },
  auth: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[AUTH] ${message}`, data !== undefined ? data : "");
    }
  },
  error: (message: string, error?: unknown) => {
    console.error(`[ERROR] ${message}`, error !== undefined ? error : "");
  },
};
