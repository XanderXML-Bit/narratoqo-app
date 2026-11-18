import { describe, expect, it } from 'vitest';
import { deriveTitle } from './deriveTitle';

describe('deriveTitle', () => {
  it('uses a short first line followed by more text', () => {
    const text = "The Lighthouse Keeper's Ledger\n\nThe lamp was lit at dusk, as it had been for forty years.";
    expect(deriveTitle(text)).toBe("The Lighthouse Keeper's Ledger");
  });

  it('drops a trailing full stop and a markdown heading mark', () => {
    expect(deriveTitle('# Down the Rabbit-Hole.\n\nAlice was beginning to get very tired.')).toBe('Down the Rabbit-Hole');
  });

  it('falls back to the opening words of a single paragraph', () => {
    expect(deriveTitle('Alice was beginning to get very tired of sitting by her sister on the bank.')).toBe(
      'Alice was beginning to get very tired of…',
    );
  });

  it('uses the opening words when the first line is too long to be a heading', () => {
    const long = 'word '.repeat(30).trim();
    expect(deriveTitle(`${long}\nsecond line`)).toBe(`${'word '.repeat(8).trim()}…`);
  });

  it('returns an empty string for blank text', () => {
    expect(deriveTitle('   \n\t ')).toBe('');
  });
});
