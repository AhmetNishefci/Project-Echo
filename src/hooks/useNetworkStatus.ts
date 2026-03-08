import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Monitors network connectivity. Returns false when the device
 * has no internet connection (airplane mode, no signal, etc.).
 * Defaults to true to avoid flashing an offline banner on launch.
 */
export function useNetworkStatus(): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // state.isConnected can be null during initialization
      setIsConnected(state.isConnected !== false);
    });

    return () => unsubscribe();
  }, []);

  return { isConnected };
}
