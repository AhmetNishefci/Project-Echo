/**
 * Ice-breaker prompts shown on the match celebration screen.
 * Both users see the same prompt (derived deterministically from matchId).
 *
 * Prompts are stored in the locale files (en.json → "icebreakers" key)
 * so they can be translated.
 */
import i18n from "@/i18n";

const ICEBREAKER_COUNT = 30;

/**
 * Pick an ice-breaker deterministically from a matchId.
 * Both users in a match will see the same prompt.
 */
export function getIcebreakerForMatch(matchId: string): string {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = ((hash << 5) - hash + matchId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % ICEBREAKER_COUNT;
  return i18n.t(`icebreakers.${index}`);
}
