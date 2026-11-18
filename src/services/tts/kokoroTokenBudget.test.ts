import { describe, it, expect } from 'vitest';
import { concatSamples, encodeFloatWav, planWithinBudget, splitNearMiddle } from './kokoroTokenBudget';

const squash = (s: string) => s.replace(/\s+/g, '');

describe('splitNearMiddle', () => {
  it('prefers a sentence boundary', () => {
    expect(splitNearMiddle('One two three. Four five, six seven.')).toEqual(['One two three.', 'Four five, six seven.']);
  });

  it('falls back to a clause, then a word', () => {
    expect(splitNearMiddle('alpha beta, gamma delta')).toEqual(['alpha beta,', 'gamma delta']);
    expect(splitNearMiddle('alpha beta gamma delta')).toEqual(['alpha beta', 'gamma delta']);
  });

  it('never cuts inside a number with commas or a decimal point', () => {
    const [left, right] = splitNearMiddle('$123,456.78 and $98,765.43')!;
    expect(left).toBe('$123,456.78');
    expect(right).toBe('and $98,765.43');
    expect(splitNearMiddle('$123,456.78')).toEqual(['$123,', '456.78']); // no space: code points only
  });

  it('never cuts after an abbreviation or initial when a safer boundary exists', () => {
    // Found in review: a "sentence" cut after "U." or "Dr."
    // splits one phrase into two inference calls.
    const unsafeEnd = /(?:^|\s)(?:[A-Za-z]\.|(?:[A-Za-z]\.){2,}|Dr\.|Mr\.|Mrs\.|Ms\.|St\.|no\.|ref\.)$/;
    const cases = [
      'Costs rose by a lot at the U. S. embassy in the city today',
      'Revenue was reported by the U.S. embassy late in the evening',
      'We waited a while and then Dr. Smith paid $123,456.78 at the desk',
      'Bring fruit, e.g. apples and pears, to the 5 p.m. meeting tomorrow',
      'Please quote ref. no. 2026-0417-889 when you write to us again',
      'The letter was signed by J. R. Tolkien and posted that day',
    ];
    for (const text of cases) {
      const [left, right] = splitNearMiddle(text)!;
      expect(left, text).not.toMatch(unsafeEnd);
      expect(squash(left + right)).toBe(squash(text));
    }
  });

  it('never cuts a sentence before a lowercase word or a digit', () => {
    const [left] = splitNearMiddle('It closed at 5 p.m. sharp and opened again. The next day was calm')!;
    expect(left).toBe('It closed at 5 p.m. sharp and opened again.');
    const [left2] = splitNearMiddle('Item 3. 45 people came to the hall for the long talk')!;
    expect(left2).not.toBe('Item 3.');
  });

  it('still cuts a real sentence end', () => {
    expect(splitNearMiddle('Dr. Smith paid $123,456.78 at https://example.com. All done.')).toEqual([
      'Dr. Smith paid $123,456.78 at https://example.com.',
      'All done.',
    ]);
  });

  it('cuts a word with no spaces by code point', () => {
    expect(splitNearMiddle('12345678')).toEqual(['1234', '5678']);
    expect(splitNearMiddle('😀😀')).toEqual(['😀', '😀']);
    expect(splitNearMiddle('x')).toBeNull();
  });
});

describe('planWithinBudget', () => {
  const measure = async (text: string) => ({ ids: text, count: text.length + 2 });

  it('keeps short text whole', async () => {
    const pieces = await planWithinBudget('Short text.', measure, 50);
    expect(pieces.map((p) => p.text)).toEqual(['Short text.']);
  });

  it('splits until every piece fits, keeping all text in order', async () => {
    const text = 'First sentence is here. Second one, with a clause, follows. ' + 'w'.repeat(120) + ' end.';
    const pieces = await planWithinBudget(text, measure, 40);
    for (const piece of pieces) expect(piece.count).toBeLessThanOrEqual(40);
    expect(pieces.map((p) => p.text).join('').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });

  it('returns nothing for blank text', async () => {
    expect(await planWithinBudget('   ', measure, 40)).toEqual([]);
  });
});

describe('audio helpers', () => {
  it('joins samples in order', () => {
    expect(Array.from(concatSamples([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
  });

  it('writes a float WAV header the length of the samples', async () => {
    const blob = encodeFloatWav(new Float32Array([0, 0.5, -0.5]), 24000);
    expect(blob.size).toBe(44 + 12);
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const view = new DataView(bytes);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getFloat32(48, true)).toBeCloseTo(0.5);
  });
});
