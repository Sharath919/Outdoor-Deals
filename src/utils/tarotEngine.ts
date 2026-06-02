import { callAI } from './claudeApi';
import { SPREAD_SELECTOR_SYSTEM } from './spreadSelectorPrompt';

export type Verdict = 'YES' | 'LEANING YES' | 'NEUTRAL' | 'LEANING NO' | 'NO';

const VALID_SPREADS = [
  'yes_no',
  'single',
  'three_card',
  'situation_action_outcome',
  'mind_body_spirit',
  'love',
  'love_blockage',
  'career',
  'two_options',
  'three_options',
  'celtic_cross',
  'horseshoe',
  'soulmate',
  'shadow_work',
  'new_moon',
  'full_moon',
  'decision',
  'monthly',
  'yearly',
  'seasonal',
] as const;

const VERDICT_SCALE: Verdict[] = ['YES', 'LEANING YES', 'NEUTRAL', 'LEANING NO', 'NO'];

const STRONG_YES = new Set([
  'The Sun', 'The Star', 'The World', 'The Lovers', 'The Empress',
  'The Magician', 'Judgement', 'Ace of Cups', 'Ace of Wands',
  'Ace of Pentacles', 'Ten of Cups', 'Ten of Pentacles',
  'Six of Wands', 'Three of Cups',
]);

const LEAN_YES = new Set([
  'The Chariot', 'Strength', 'The Emperor', 'Wheel of Fortune',
  'The Hierophant', 'Two of Cups', 'Four of Wands',
  'Nine of Pentacles', 'King of Pentacles',
]);

const NEUTRAL_SET = new Set([
  'The High Priestess', 'The Hermit', 'Justice', 'Temperance',
  'The Hanged Man', 'Seven of Cups', 'Two of Swords', 'Eight of Cups',
]);

const LEAN_NO = new Set([
  'The Moon', 'Five of Cups', 'Five of Pentacles', 'Eight of Swords',
  'Nine of Swords', 'Ten of Swords', 'Three of Swords', 'Seven of Swords',
]);

const STRONG_NO = new Set([
  'The Devil', 'The Tower', 'Five of Wands', 'Ten of Wands', 'Nine of Wands',
]);

const CLASSIFY_TIMEOUT_MS = 12_000;

/** Pick the best spread ID for a question via AI classification only. */
export async function autoSelectSpread(question: string): Promise<string> {
  const trimmed = question.trim();
  if (!trimmed) return 'three_card';

  const classify = async (): Promise<string> => {
    const response = await callAI({
      stream: false,
      maxTokens: 10,
      systemPrompt: SPREAD_SELECTOR_SYSTEM,
      messages: [{ role: 'user', content: trimmed }],
    });

    if (!response.ok) {
      throw new Error(`Spread classification HTTP ${response.status}`);
    }

    const data = (await response.json()) as { content?: string; error?: string };
    if (data.error) {
      throw new Error(data.error);
    }

    const spreadId = data.content
      ?.trim()
      .toLowerCase()
      .split('\n')[0]
      .replace(/[^a-z_]/g, '')
      .trim() ?? '';

    if ((VALID_SPREADS as readonly string[]).includes(spreadId)) {
      console.log(`Spread selected: ${spreadId}`);
      return spreadId;
    }
    return 'three_card';
  };

  try {
    return await Promise.race([
      classify(),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          console.warn('Spread classification timed out, using three_card');
          resolve('three_card');
        }, CLASSIFY_TIMEOUT_MS),
      ),
    ]);
  } catch (error) {
    console.error('Spread classification failed:', error);
    return 'three_card';
  }
}

/** @deprecated Use autoSelectSpread — kept for imports */
export const detectSpread = autoSelectSpread;

export function getYesNoVerdict(card: { name: string; suit?: string; isReversed: boolean }): Verdict {
  let verdict: Verdict;

  if (STRONG_YES.has(card.name)) verdict = 'YES';
  else if (LEAN_YES.has(card.name)) verdict = 'LEANING YES';
  else if (STRONG_NO.has(card.name)) verdict = 'NO';
  else if (LEAN_NO.has(card.name)) verdict = 'LEANING NO';
  else if (NEUTRAL_SET.has(card.name)) verdict = 'NEUTRAL';
  else if (card.suit === 'cups') verdict = 'LEANING YES';
  else if (card.suit === 'wands') verdict = 'LEANING YES';
  else if (card.suit === 'pentacles') verdict = 'LEANING YES';
  else if (card.suit === 'swords') verdict = 'LEANING NO';
  else verdict = 'NEUTRAL';

  if (card.isReversed) {
    const idx = VERDICT_SCALE.indexOf(verdict);
    if (idx < VERDICT_SCALE.length - 1) verdict = VERDICT_SCALE[idx + 1];
  }

  return verdict;
}

export function getMajorityVerdict(verdicts: Verdict[]): Verdict {
  const score = verdicts.reduce((acc, v) => {
    return acc + VERDICT_SCALE.indexOf(v) - 2;
  }, 0);
  const avg = score / verdicts.length;
  const idx = Math.round(avg + 2);
  return VERDICT_SCALE[Math.max(0, Math.min(4, idx))];
}

export interface VerdictConfig {
  label: string;
  bg: string;
  border: string;
  textColor: string;
  glow: string;
  particleColor: string;
  size: number;
}

export const VERDICT_CONFIGS: Record<Verdict, VerdictConfig> = {
  YES: {
    label: 'YES',
    bg: 'radial-gradient(ellipse at center, #1a5c2a 0%, #0d3318 100%)',
    border: '#4ade80',
    textColor: '#C9A84C',
    glow: 'rgba(74,222,128,0.25)',
    particleColor: '#4ade80',
    size: 48,
  },
  'LEANING YES': {
    label: 'LEANING YES',
    bg: 'radial-gradient(ellipse at center, #0d4a3a 0%, #062820 100%)',
    border: '#34d399',
    textColor: '#a7f3d0',
    glow: 'rgba(52,211,153,0.2)',
    particleColor: '#34d399',
    size: 32,
  },
  NEUTRAL: {
    label: 'UNCLEAR',
    bg: 'radial-gradient(ellipse at center, #2D1B4E 0%, #1a0f30 100%)',
    border: '#C9A84C',
    textColor: '#C9A84C',
    glow: 'rgba(201,168,76,0.2)',
    particleColor: '#C9A84C',
    size: 36,
  },
  'LEANING NO': {
    label: 'LEANING NO',
    bg: 'radial-gradient(ellipse at center, #4a1a1a 0%, #2d0f0f 100%)',
    border: '#f87171',
    textColor: '#fca5a5',
    glow: 'rgba(248,113,113,0.2)',
    particleColor: '#f87171',
    size: 32,
  },
  NO: {
    label: 'NO',
    bg: 'radial-gradient(ellipse at center, #5c1a1a 0%, #3d0f0f 100%)',
    border: '#ef4444',
    textColor: '#C9A84C',
    glow: 'rgba(239,68,68,0.25)',
    particleColor: '#ef4444',
    size: 48,
  },
};
