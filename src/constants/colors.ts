/**
 * Design token constants for use in Ionicon color props, inline styles,
 * and native components (Switch, ActivityIndicator, RefreshControl) that
 * can't use Tailwind class names.
 *
 * Single source of truth — matches tailwind.config.js wave-* tokens.
 */
export const COLORS = {
  primary: "#6c63ff",
  accent: "#00d4aa",
  text: "#e0e0e0",
  muted: "#8585a0",     // Bumped from #666680 for WCAG AA compliance (~4.6:1 on #0a0a0a)
  bg: "#0a0a0a",
  surface: "#1a1a2e",
  danger: "#ff4757",
  wave: "#4ecdc4",
  match: "#ec4899",
  white: "#ffffff",
  black: "#000000",

  // Platform brand colors
  snapchat: "#FFFC00",
  google: "#ffffff",

  // UI-specific
  placeholder: "#555570",   // Input placeholder text
  switchOff: "#333345",     // Switch track when off
  toastSuccess: "#16a34a",  // Toast success border
  toastError: "#dc2626",    // Toast error border
} as const;
