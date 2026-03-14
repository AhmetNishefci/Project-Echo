const isDev = __DEV__;

export const logger = {
  ble: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[BLE] ${message}`, data !== undefined ? data : "");
    }
  },
  wave: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[WAVE] ${message}`, data !== undefined ? data : "");
    }
  },
  auth: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[AUTH] ${message}`, data !== undefined ? data : "");
    }
  },
  error: (message: string, error?: unknown) => {
    // Always log errors, even in production — these surface in Xcode
    // device console for TestFlight builds and will feed into Sentry
    // once integrated (see README roadmap).
    console.error(`[ERROR] ${message}`, error !== undefined ? error : "");
  },
};
