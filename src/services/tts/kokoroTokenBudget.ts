/**
 * Keeps every Kokoro inference inside the model's input limit.
 *
 * kokoro-js `generate()` phonemizes the text, then tokenizes with truncation at
 * 510 phoneme tokens plus the two boundary tokens, and silently drops the rest.
 * Numbers, currency and abbreviations expand a lot when phonemized
 * ("$123,456.78" becomes dozens of tokens), so no character limit is safe.
 * This module measures the real, untruncated token count and splits the text
 * at natural boundaries until every piece fits.
 */

/** 510 phoneme tokens plus the start and end tokens kokoro-js adds. */
export const KOKORO_MAX_INPUT_IDS = 512;

export interface MeasuredPiece<T> {
  text: string;
  /** Untruncated input ids for `text`. */
  ids: T;
  /** Number of input ids, including the two boundary tokens. */
  count: number;
}

export type MeasureFn<T> = (text: string) => Promise<{ ids: T; count: number }>;

/**
 * Words that end in a full stop without ending a sentence. Compared lowercase,
 * without the final stop. Single letters (initials such as "J." or the "U." in
 * "U. S.") and dotted runs ("U.S.", "e.g.", "p.m.") are caught by pattern.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'ft', 'rev', 'gen', 'col', 'capt', 'lt', 'sgt',
  'gov', 'sen', 'rep', 'pres', 'hon', 'no', 'nos', 'ref', 'vol', 'vols', 'fig', 'figs', 'p', 'pp', 'ch', 'sec',
  'art', 'para', 'ed', 'eds', 'vs', 'etc', 'approx', 'est', 'dept', 'univ', 'inc', 'ltd', 'co', 'corp', 'bros',
  'ave', 'blvd', 'rd', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** True when the text before a cut ends with an abbreviation or an initial. */
function endsWithAbbreviation(left: string): boolean {
  const word = left.split(/\s+/).pop() ?? '';
  // Ignore an opening quote or bracket before the word: "(Dr." -> "Dr."
  const bare = word.replace(/^["'\u201c\u2018([]+/, '');
  if (!bare.endsWith('.')) return false;
  if (/^(?:\p{L}\.)+$/u.test(bare)) return true; // J. / U. / U.S. / e.g. / p.m.
  return ABBREVIATIONS.has(bare.slice(0, -1).toLowerCase());
}

interface Boundary {
  pattern: RegExp;
  /** Whether a cut here is safe, given the text on each side. */
  safe?: (left: string, right: string) => boolean;
}

// Boundaries, best first. Each pattern matches the separator after which we cut.
// Clause marks need a following space so "$123,456.78" is never split, and no
// pattern matches inside a run of non-space characters, so amounts and URLs
// stay whole. Sentence and word cuts are skipped after an abbreviation, and a
// sentence cut is skipped when the next word starts lowercase or with a digit.
// The last entry takes any space, so text that has only unsafe cuts still fits.
const BOUNDARIES: Boundary[] = [
  { pattern: /\n\s*\n\s*/g }, // paragraph
  {
    pattern: /[.!?\u2026]+["'\u201d\u2019)\]]*\s+/g, // sentence
    safe: (left, right) => !endsWithAbbreviation(left) && !/^["'\u201c\u2018([]*[\p{Ll}\p{Nd}]/u.test(right),
  },
  { pattern: /[,;:\u2014\u2013]\s+|\s+[\u2014\u2013-]\s+/g }, // clause
  { pattern: /\s+/g, safe: (left) => !endsWithAbbreviation(left) }, // word
  { pattern: /\s+/g }, // any space, last resort
];

/**
 * Split `text` into two non-empty halves at the best boundary closest to the
 * middle. Returns null when the text is a single character and cannot be split.
 */
export function splitNearMiddle(text: string): [string, string] | null {
  const middle = text.length / 2;
  for (const { pattern, safe } of BOUNDARIES) {
    let best = -1;
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const cut = match.index + match[0].length;
      if (match[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      // A cut must leave readable text on both sides.
      const left = text.slice(0, cut).trim();
      const right = text.slice(cut).trim();
      if (!text.slice(0, match.index).trim() || !right) continue;
      if (safe && !safe(left, right)) continue;
      if (best < 0 || Math.abs(cut - middle) < Math.abs(best - middle)) {
        best = cut;
      }
    }
    if (best > 0) {
      return [text.slice(0, best).trim(), text.slice(best).trim()];
    }
  }
  // No whitespace at all (one long word or number): cut by code point.
  const chars = Array.from(text);
  if (chars.length < 2) return null;
  const half = Math.floor(chars.length / 2);
  return [chars.slice(0, half).join(''), chars.slice(half).join('')];
}

/**
 * Return pieces of `text`, in order, each measured within `maxIds`.
 * Pieces keep all non-whitespace characters of the input; only the whitespace
 * at a cut is dropped.
 */
export async function planWithinBudget<T>(
  text: string,
  measure: MeasureFn<T>,
  maxIds: number = KOKORO_MAX_INPUT_IDS
): Promise<MeasuredPiece<T>[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { ids, count } = await measure(trimmed);
  if (count <= maxIds) return [{ text: trimmed, ids, count }];
  const halves = splitNearMiddle(trimmed);
  // A single character over budget cannot be split further; send it as is.
  if (!halves) return [{ text: trimmed, ids, count }];
  const [left, right] = halves;
  return [
    ...(await planWithinBudget(left, measure, maxIds)),
    ...(await planWithinBudget(right, measure, maxIds)),
  ];
}

/** Join mono Float32 sample arrays end to end. */
export function concatSamples(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Encode mono Float32 samples as a 32-bit float WAV, the format kokoro-js produces. */
export function encodeFloatWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 4;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 32, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  new Float32Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: 'audio/wav' });
}
