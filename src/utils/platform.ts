import { Platform } from "react-native";

export function isIOS(): boolean {
  return Platform.OS === "ios";
}

export function isAndroid(): boolean {
  return Platform.OS === "android";
}

export function getAndroidApiLevel(): number {
  if (!isAndroid()) return 0;
  return typeof Platform.Version === "number"
    ? Platform.Version
    : parseInt(String(Platform.Version), 10);
}
