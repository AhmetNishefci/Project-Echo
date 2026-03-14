/**
 * Ice-breaker prompts shown on the match celebration screen.
 * Both users see the same prompt (derived deterministically from matchId).
 *
 * Mix of Wave-specific, casual, and fun prompts.
 */
const ICEBREAKERS: string[] = [
  // Wave-specific — reference the shared experience
  "So... who waved first? 👋",
  "What made you wave at me?",
  "We were close enough to wave — where were you?",
  "How long were you on the radar before you waved?",
  "Do you wave at everyone, or am I special? 😏",
  "I waved, you waved back — now what?",
  "What's your Wave success rate so far?",

  // Situational — great for in-person context
  "What brought you here tonight?",
  "What's the best thing about this place?",
  "Are you here with friends or flying solo?",
  "How's your night going so far?",
  "This place — overrated or underrated?",

  // Fun / personality
  "Coffee or drinks person?",
  "Morning person or night owl?",
  "What's the best thing that happened to you this week?",
  "If you could teleport anywhere right now, where would you go?",
  "What's your go-to karaoke song?",
  "Hot take: pineapple on pizza?",
  "What's something you're weirdly good at?",
  "Last song you had on repeat?",
  "What's your comfort show?",
  "Dogs or cats — and this matters",
  "If we grabbed food right now, where are we going?",

  // Flirty but light
  "So what's the story behind your username?",
  "Tell me something your Instagram doesn't show",
  "What's your best quality that I can't see from your profile?",
  "On a scale of 1-10, how brave was my wave?",
  "I'm going to guess three things about you — ready?",
  "What made you download Wave?",
  "First impression of me based on... absolutely nothing 😂",
];

/**
 * Pick an ice-breaker deterministically from a matchId.
 * Both users in a match will see the same prompt.
 */
export function getIcebreakerForMatch(matchId: string): string {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = ((hash << 5) - hash + matchId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % ICEBREAKERS.length;
  return ICEBREAKERS[index];
}
