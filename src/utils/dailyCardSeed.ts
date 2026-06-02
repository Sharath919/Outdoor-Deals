import type { Card } from '../data/cards';

/** YYYY-MM-DD in local calendar */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDailyCard(cards: Card[], refDate: Date = new Date()): Card {
  const today = refDate;
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % cards.length;
  return cards[index];
}

/** Same global rule as spec: reversed when the numeric date seed is divisible by 3. */
export function isDailyReversed(refDate: Date = new Date()): boolean {
  const d = refDate;
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return seed % 3 === 0;
}

export function addDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}
