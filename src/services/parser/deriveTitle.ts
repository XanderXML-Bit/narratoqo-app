/**
 * A project title taken from the text itself, for when the user leaves the title empty.
 *
 * Uses the first line when it reads like a heading (short and followed by more text);
 * otherwise the opening words of the text. Returns '' when there is nothing to use.
 */
const MAX_HEADING_CHARS = 80;
const OPENING_WORDS = 8;

export function deriveTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0].replace(/^#+\s*/, '').trim();
  if (lines.length > 1 && first.length > 0 && first.length <= MAX_HEADING_CHARS) {
    return first.replace(/[.:;,]+$/, '').trim() || first;
  }

  const words = trimmed.replace(/\s+/g, ' ').split(' ');
  const opening = words.slice(0, OPENING_WORDS).join(' ').replace(/[.:;,]+$/, '');
  return words.length > OPENING_WORDS ? `${opening}…` : opening;
}
