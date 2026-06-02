import { supabase } from '../lib/supabase';
import { allCards, type Card } from '../data/cards';

const allImages: Record<string, string> = {};
let allImagesLoaded = false;

let cacheVersion = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  cacheVersion += 1;
  listeners.forEach((l) => l());
}

export function subscribeCardImages(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getCardImagesVersion() {
  return cacheVersion;
}

/** Stable slug used as storage key and DB `card_id` (e.g. major-0, wands-ace). */
export function getCardImageSlug(card: Pick<Card, 'id' | 'arcana' | 'number'>): string {
  if (card.arcana === 'major') return `major-${card.id}`;
  const suit = card.arcana;
  const n = card.number ?? 0;
  if (n === 1) return `${suit}-ace`;
  if (n >= 2 && n <= 10) return `${suit}-${n}`;
  if (n === 11) return `${suit}-page`;
  if (n === 12) return `${suit}-knight`;
  if (n === 13) return `${suit}-queen`;
  if (n === 14) return `${suit}-king`;
  return `${suit}-${n}`;
}

export function getCardImage(cardIdSlug: string): string | null {
  return allImages[cardIdSlug] ?? null;
}

export function setCardImageInCache(cardIdSlug: string, imageUrl: string) {
  allImages[cardIdSlug] = imageUrl;
  notifyListeners();
}

export function removeCardImageFromCache(cardIdSlug: string) {
  delete allImages[cardIdSlug];
  notifyListeners();
}

export function invalidateCardImageCache() {
  allImagesLoaded = false;
  for (const k of Object.keys(allImages)) delete allImages[k];
  notifyListeners();
}

/** Load all card image URLs from Supabase (call on app init). */
export async function preloadCardImages() {
  if (allImagesLoaded) return;
  const { data, error } = await supabase.from('card_images').select('card_id, image_url');
  if (error) {
    console.warn('[cardImages] preload failed:', error.message);
    allImagesLoaded = true;
    notifyListeners();
    return;
  }
  if (data) {
    for (const row of data as { card_id: string; image_url: string }[]) {
      const canonical = normalizeImageSlug(row.card_id);
      allImages[canonical] = row.image_url;
    }
  }
  allImagesLoaded = true;
  notifyListeners();
}

const EXT_RE = /\.(jpe?g|png|webp)$/i;

const CARD_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

const RANK_TO_NUM: Record<string, number> = {
  ace: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  page: 11,
  knight: 12,
  queen: 13,
  king: 14,
};

const NUM_TO_RANK: Record<number, string> = {
  1: 'ace',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'page',
  12: 'knight',
  13: 'queen',
  14: 'king',
};

const MAJOR_ARTICLE_ID_TO_STORAGE: Record<string, number> = {
  'the-fool': 0,
  'the-magician': 1,
  'the-high-priestess': 2,
  'the-empress': 3,
  'the-emperor': 4,
  'the-hierophant': 5,
  'the-lovers': 6,
  'the-chariot': 7,
  strength: 8,
  'the-hermit': 9,
  'wheel-of-fortune': 10,
  justice: 11,
  'the-hanged-man': 12,
  death: 13,
  temperance: 14,
  'the-devil': 15,
  'the-tower': 16,
  'the-star': 17,
  'the-moon': 18,
  'the-sun': 19,
  judgement: 20,
  'the-world': 21,
};

/** Append a cache-buster so replaced storage objects show immediately in the admin UI. */
export function cacheBustStorageUrl(url: string, version = Date.now()): string {
  const base = url.split('?')[0];
  return `${base}?v=${version}`;
}

export function stripStorageUrlCacheBust(url: string): string {
  return url.split('?')[0];
}

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
]);

/** Browser / ZIP often omit or mis-report MIME; fall back to filename. */
export function isAllowedImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase().trim();
  if (mime && ALLOWED_IMAGE_MIMES.has(mime)) return true;
  return EXT_RE.test(file.name);
}

/** Value for Storage upload Content-Type header. */
export function imageContentTypeForUpload(file: File): string {
  const mime = (file.type || '').toLowerCase().trim();
  if (mime === 'image/png' || /\.png$/i.test(file.name)) return 'image/png';
  if (mime === 'image/webp' || /\.webp$/i.test(file.name)) return 'image/webp';
  return 'image/jpeg';
}

/** Supabase bucket limit — large sources are resized/compressed before upload. */
export const CARD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const CARD_IMAGE_MAX_DIMENSION = 1200;

function loadImageFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function jpegFileName(base: string): string {
  const stem = base.replace(/\.[^.]+$/i, '');
  return `${stem}.jpg`;
}

/**
 * Resize and re-encode as JPEG so uploads stay under CARD_IMAGE_MAX_BYTES.
 * Pass `slug` (e.g. cups-8) for stable bulk upload filenames.
 */
export async function prepareImageForCardUpload(file: File, slug?: string): Promise<File> {
  const outName = slug ? `${slug}.jpg` : jpegFileName(file.name);

  // Admin uploads always normalize to JPEG so storage paths stay stable (cups-6.jpg).
  if (slug) {
    const img = await loadImageFile(file);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > CARD_IMAGE_MAX_DIMENSION ? CARD_IMAGE_MAX_DIMENSION / longest : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');
    ctx.drawImage(img, 0, 0, w, h);

    let blob: Blob | null = null;
    for (let quality = 0.88; quality >= 0.42; quality -= 0.06) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
      if (blob && blob.size <= CARD_IMAGE_MAX_BYTES) break;
    }

    if (!blob || blob.size > CARD_IMAGE_MAX_BYTES) {
      throw new Error(
        `Could not compress below ${Math.round(CARD_IMAGE_MAX_BYTES / 1024 / 1024)}MB. Try a smaller source image.`,
      );
    }

    return new File([blob], outName, { type: 'image/jpeg' });
  }

  if (file.size <= CARD_IMAGE_MAX_BYTES) {
    try {
      const img = await loadImageFile(file);
      if (Math.max(img.naturalWidth, img.naturalHeight) <= CARD_IMAGE_MAX_DIMENSION) {
        return file;
      }
    } catch {
      return file;
    }
  }

  const img = await loadImageFile(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > CARD_IMAGE_MAX_DIMENSION ? CARD_IMAGE_MAX_DIMENSION / longest : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(img, 0, 0, w, h);

  let blob: Blob | null = null;
  for (let quality = 0.88; quality >= 0.42; quality -= 0.06) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (blob && blob.size <= CARD_IMAGE_MAX_BYTES) break;
  }

  if (!blob || blob.size > CARD_IMAGE_MAX_BYTES) {
    throw new Error(
      `Could not compress below ${Math.round(CARD_IMAGE_MAX_BYTES / 1024 / 1024)}MB. Try a smaller source image.`,
    );
  }

  return new File([blob], outName, { type: 'image/jpeg' });
}

/** Base name without extension, lowercased (e.g. major-0, wands-king). */
export function slugFromUploadedFilename(name: string): string | null {
  const normalized = name.replace(/\\/g, '/');
  const base = normalized.split('/').pop()?.trim() ?? '';
  if (!base) return null;
  const withoutExt = base.replace(EXT_RE, '').toLowerCase();
  if (!withoutExt || withoutExt.includes('__MACOSX') || withoutExt.startsWith('.')) return null;
  return withoutExt;
}

export function extensionFromFileName(name: string): string {
  const m = name.match(EXT_RE);
  return m ? m[0].toLowerCase() : '.jpg';
}

export function findCardByImageSlug(slug: string): Card | undefined {
  return allCards.find((c) => getCardImageSlug(c) === slug);
}

/** Match canonical slugs (cups-6) and legacy article slugs (six-of-cups). */
export function findCardByAnyImageSlug(slug: string): Card | undefined {
  const normalized = slug.trim().toLowerCase();
  const direct = findCardByImageSlug(normalized);
  if (direct) return direct;

  const minor = normalized.match(
    /^(ace|two|three|four|five|six|seven|eight|nine|ten|page|knight|queen|king)-of-(cups|wands|swords|pentacles)$/,
  );
  if (minor) {
    const rank = minor[1];
    const suit = minor[2] as Card['arcana'];
    const number = RANK_TO_NUM[rank];
    return allCards.find((c) => c.arcana === suit && c.number === number);
  }

  const majorNum = MAJOR_ARTICLE_ID_TO_STORAGE[normalized];
  if (majorNum !== undefined) {
    return allCards.find((c) => c.arcana === 'major' && c.id === majorNum);
  }

  return undefined;
}

export function normalizeImageSlug(slug: string): string {
  const card = findCardByAnyImageSlug(slug);
  return card ? getCardImageSlug(card) : slug.trim().toLowerCase();
}

/** All DB/storage keys that may refer to the same card image. */
export function getAllImageSlugsForCard(card: Card): string[] {
  const slugs = new Set<string>([getCardImageSlug(card)]);

  if (card.arcana === 'major') {
    const articleId = Object.entries(MAJOR_ARTICLE_ID_TO_STORAGE).find(([, n]) => n === card.id)?.[0];
    if (articleId) slugs.add(articleId);
    return [...slugs];
  }

  const rank = NUM_TO_RANK[card.number ?? 0];
  if (rank) slugs.add(`${rank}-of-${card.arcana}`);
  return [...slugs];
}

export function storagePathsForSlug(slug: string): string[] {
  return CARD_IMAGE_EXTENSIONS.map((ext) => `${slug}${ext}`);
}

/** Scrollable reference lines for bulk upload instructions. */
export function buildCardImageNamingReference(): string[] {
  const lines: string[] = [];
  lines.push('Major Arcana:');
  for (const c of allCards.filter((x) => x.arcana === 'major')) {
    lines.push(`${getCardImageSlug(c)}.jpg = ${c.name}`);
  }
  lines.push('');
  for (const suit of ['wands', 'cups', 'swords', 'pentacles'] as const) {
    lines.push(`${suit.charAt(0).toUpperCase() + suit.slice(1)}:`);
    for (const c of allCards.filter((x) => x.arcana === suit)) {
      lines.push(`${getCardImageSlug(c)}.jpg = ${c.name}`);
    }
    lines.push('');
  }
  return lines;
}
