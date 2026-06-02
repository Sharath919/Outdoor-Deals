/** Lunar phase for a given instant — same algorithm as the homepage hero widget. */
export function getMoonPhase(date: Date) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const msPerDay = 86400000;
  const lunarCycle = 29.53058867;

  const daysSince = (date.getTime() - knownNewMoon.getTime()) / msPerDay;
  const phase = ((daysSince % lunarCycle) + lunarCycle) % lunarCycle;

  if (phase < 1.85) return { emoji: '🌑', label: 'New Moon' };
  if (phase < 5.54) return { emoji: '🌒', label: 'Waxing Crescent' };
  if (phase < 9.22) return { emoji: '🌓', label: 'First Quarter' };
  if (phase < 12.91) return { emoji: '🌔', label: 'Waxing Gibbous' };
  if (phase < 16.61) return { emoji: '🌕', label: 'Full Moon' };
  if (phase < 20.3) return { emoji: '🌖', label: 'Waning Gibbous' };
  if (phase < 23.99) return { emoji: '🌗', label: 'Last Quarter' };
  if (phase < 27.68) return { emoji: '🌘', label: 'Waning Crescent' };
  return { emoji: '🌑', label: 'New Moon' };
}
