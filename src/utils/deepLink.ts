import { Linking } from "react-native";

/**
 * Open an Instagram profile via deep-link (app → web fallback).
 */
export function openInstagramProfile(handle: string): void {
  Linking.openURL(`instagram://user?username=${handle}`).catch(() => {
    Linking.openURL(`https://instagram.com/${handle}`).catch(() => {});
  });
}

/**
 * Open a Snapchat profile via deep-link (app → web fallback).
 */
export function openSnapchatProfile(handle: string): void {
  Linking.openURL(`snapchat://add/${handle}`).catch(() => {
    Linking.openURL(`https://snapchat.com/add/${handle}`).catch(() => {});
  });
}
