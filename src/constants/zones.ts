import type { DistanceZone } from "@/types";
import i18n from "@/i18n";

export const ZONE_CONFIG: Record<DistanceZone, { readonly label: string; color: string }> = {
  HERE: { get label() { return i18n.t("zones.here"); }, color: "text-green-400" },
  CLOSE: { get label() { return i18n.t("zones.close"); }, color: "text-blue-400" },
  NEARBY: { get label() { return i18n.t("zones.nearby"); }, color: "text-wave-muted" },
};
