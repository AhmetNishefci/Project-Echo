import ExoBlePeripheralModule from "./src/ExoBlePeripheralModule";

export function startAdvertising(token: string): Promise<void> {
  return ExoBlePeripheralModule.startAdvertising(token);
}

export function stopAdvertising(): Promise<void> {
  return ExoBlePeripheralModule.stopAdvertising();
}

export function updateToken(token: string): Promise<void> {
  return ExoBlePeripheralModule.updateToken(token);
}

export function isSupported(): Promise<boolean> {
  return ExoBlePeripheralModule.isSupported();
}
