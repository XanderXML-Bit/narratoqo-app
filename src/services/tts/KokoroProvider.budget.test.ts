import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Completeness tests for Kokoro's 510-token input limit.
 *
 * The fake mirrors kokoro-js 1.2.1 `generate()`: phonemize, tokenize with
 * truncation at 512 ids (510 + 2 boundary tokens), then `generate_from_ids()`.
 * Its phonemizer expands digits and currency the way eSpeak does (much longer
 * than the characters), so short number-heavy text overflows the limit.
 */

const MAX_IDS = 512;
const SAMPLES_PER_TOKEN = 100;

function fakePhonemize(text: string): string {
  // Digits and "$" expand into whole spoken words; letters stay roughly 1:1.
  return text.replace(/\$/g, ' dˈɑːlɚz ').replace(/\d/g, ' nˈaɪn ');
}

interface FakeIds {
  dims: number[];
  phonemes: string;
}

const calls: { inputIds: number; phonemes: string }[] = [];

class FakeKokoro {
  voices = { af_heart: {} };
  _validate_voice(voice: string) {
    if (!(voice in this.voices)) throw new Error(`bad voice ${voice}`);
    return 'a';
  }
  tokenizer = (phonemes: string, { truncation }: { truncation: boolean }) => {
    const content = truncation ? phonemes.slice(0, MAX_IDS - 2) : phonemes;
    return { input_ids: { dims: [1, content.length + 2], phonemes: content } as FakeIds };
  };
  async generate(text: string, { voice = 'af_heart', speed = 1 } = {}) {
    const language = this._validate_voice(voice);
    void language;
    const phonemes = fakePhonemize(text);
    const { input_ids } = this.tokenizer(phonemes, { truncation: true });
    return this.generate_from_ids(input_ids, { voice, speed });
  }
  async generate_from_ids(ids: FakeIds, _opts: { voice?: string; speed?: number } = {}) {
    void _opts;
    calls.push({ inputIds: ids.dims[1], phonemes: ids.phonemes });
    const audio = new Float32Array((ids.dims[1] - 2) * SAMPLES_PER_TOKEN);
    return {
      audio,
      sampling_rate: 24000,
      toBlob: () => new Blob([new Uint8Array(8)], { type: 'audio/wav' }),
    };
  }
}

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: vi.fn(async () => new FakeKokoro()),
  },
}));

vi.mock('./modelDownload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./modelDownload')>();
  return { ...actual, isUrlCached: vi.fn(async () => true) };
});

const { KokoroProvider } = await import('./KokoroProvider');

// Found in review: 276 characters, 1013 real ids.
const FINANCIAL =
  'In 2026, revenue was $123,456.78, costs were $98,765.43, and profit was $24,691.35. In 2025, revenue was $111,222.33, costs were $88,999.44, and profit was $22,222.89. The next forecast is $234,567.89 with costs of $123,456.78, leaving $111,111.11 for the company to reinvest.';
// 202 characters, one sentence, 1816 real ids.
const ACCOUNT_NUMBERS =
  'The account numbers are 12345678901234567890, 23456789012345678901, 34567890123456789012, 45678901234567890123, 56789012345678901234, 67890123456789012345, 78901234567890123456, 89012345678901234567890.';

const squash = (s: string) => s.replace(/\s+/g, '');

describe('KokoroProvider token budget', () => {
  beforeEach(() => {
    calls.length = 0;
    if (!URL.createObjectURL) {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:test';
    }
  });

  it.each([
    ['financial paragraph', FINANCIAL],
    ['number-heavy sentence', ACCOUNT_NUMBERS],
  ])('synthesizes every token of a %s that overflows one call', async (_name, text) => {
    const fullContentTokens = fakePhonemize(text).length;
    expect(fullContentTokens + 2).toBeGreaterThan(MAX_IDS); // the case really overflows

    const provider = new KokoroProvider();
    const result = await provider.synthesize({ text, voiceId: 'af_heart' });

    // No inference call is over the limit, so nothing is truncated.
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call.inputIds).toBeLessThanOrEqual(MAX_IDS);

    // Every non-space phoneme of the text reached inference, in order.
    expect(squash(calls.map((c) => c.phonemes).join(''))).toBe(squash(fakePhonemize(text)));

    // Audio covers the whole text, not the 510-token prefix.
    const synthesizedTokens = calls.reduce((sum, c) => sum + c.inputIds - 2, 0);
    expect(result.duration).toBeCloseTo((synthesizedTokens * SAMPLES_PER_TOKEN) / 24000, 6);
    expect(result.duration).toBeGreaterThan(((MAX_IDS - 2) * SAMPLES_PER_TOKEN) / 24000);
  });

  it('does not split the amounts inside a number', async () => {
    const provider = new KokoroProvider();
    await provider.synthesize({ text: FINANCIAL, voiceId: 'af_heart' });
    const phonemeText = calls.map((c) => c.phonemes).join('|');
    // The cut points fall after ", " or ". ", never inside "$123,456.78":
    // no piece ends in a digit (or digit and mark) that the next piece continues.
    expect(calls.length).toBeGreaterThan(1);
    expect(squash(phonemeText)).not.toMatch(/nˈaɪn[.,]?\|nˈaɪn/);
  });

  it('never ends a piece on an abbreviation (review case)', async () => {
    // Exact case found in review: real kokoro cut it as '... the U.' | 'S. embassy today'.
    const text = 'Revenue of $123,456.78 and costs of $98,765.43 '.repeat(6) + 'were reported by the U. S. embassy today';
    const provider = new KokoroProvider();
    await provider.synthesize({ text, voiceId: 'af_heart' });
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call.inputIds).toBeLessThanOrEqual(MAX_IDS);
    expect(squash(calls.map((c) => c.phonemes).join(''))).toBe(squash(fakePhonemize(text)));
    // The fake phonemizer keeps letters, so each inference call shows its piece's words.
    const spoken = calls.map((c) => c.phonemes.trim());
    for (const piece of spoken) {
      expect(piece).not.toMatch(/(?:^|\s)U\.$/);
      expect(piece).not.toMatch(/^S\./);
    }
    expect(spoken.some((p) => /U\. S\. embassy today$/.test(p))).toBe(true);
  });

  it('falls back to the library path if measuring throws', async () => {
    const provider = new KokoroProvider();
    await provider.download();
    const instance = (provider as unknown as { kokoroInstance: FakeKokoro }).kokoroInstance;
    const original = FakeKokoro.prototype.generate;
    // A future generate() that reads an internal field the probe does not have.
    instance.generate = (async function (this: unknown, text: string) {
      if (this !== instance) throw new TypeError('probe has no model');
      return original.call(instance, text);
    }) as unknown as FakeKokoro['generate'];
    const result = await provider.synthesize({ text: 'Down the Rabbit-Hole.', voiceId: 'af_heart' });
    expect(result.duration).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it('does not offer a stream path that could split amounts or URLs', () => {
    const provider = new KokoroProvider() as unknown as Record<string, unknown>;
    expect(provider.synthesizeStream).toBeUndefined();
  });

  it('uses one inference call for text within the limit', async () => {
    const provider = new KokoroProvider();
    const text = 'Down the Rabbit-Hole.';
    const result = await provider.synthesize({ text, voiceId: 'af_heart' });
    expect(calls).toHaveLength(1);
    expect(calls[0].inputIds).toBe(fakePhonemize(text).length + 2);
    expect(result.duration).toBeCloseTo((fakePhonemize(text).length * SAMPLES_PER_TOKEN) / 24000, 6);
  });

  it('falls back to the library path if kokoro-js changes shape', async () => {
    const provider = new KokoroProvider();
    await provider.download();
    const instance = (provider as unknown as { kokoroInstance: FakeKokoro }).kokoroInstance;
    // A future generate() that no longer calls this.tokenizer / this.generate_from_ids.
    const original = FakeKokoro.prototype.generate;
    const generate = vi.fn(async function (this: unknown, text: string) {
      if (this !== instance) return null;
      return original.call(instance, text);
    });
    instance.generate = generate as unknown as FakeKokoro['generate'];
    const result = await provider.synthesize({ text: 'Down the Rabbit-Hole.', voiceId: 'af_heart' });
    expect(result.duration).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    // Two calls: the failed measurement, then the library's own generate().
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
