import { nanoid } from 'nanoid';
import type { Project, TTSProviderType } from '@/types';
import { saveProject } from '@/db/schema';
import { parseTextIntoChunks } from '@/services/parser/textChunks';

/**
 * One-click sample so a first-time visitor can hear narration without
 * finding their own text. Lewis Carroll, "Alice's Adventures in
 * Wonderland" (1865), chapter I opening. Public domain.
 *
 * The first paragraph is deliberately short so the first segment is ready
 * quickly on a phone CPU.
 */
export const SAMPLE_TITLE = 'Sample: Alice in Wonderland, chapter I';

export const SAMPLE_TEXT = `Down the Rabbit-Hole.

Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.

Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, "and what is the use of a book," thought Alice, "without pictures or conversations?"

So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.

There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, "Oh dear! Oh dear! I shall be late!"`;

export const SAMPLE_SOURCE = 'Lewis Carroll, Alice\'s Adventures in Wonderland (1865), public domain';

/** Build the sample project object (not yet saved). */
export function buildSampleProject(defaultProvider: TTSProviderType, defaultVoiceId: string): Project {
  const now = new Date();
  return {
    id: nanoid(),
    title: SAMPLE_TITLE,
    sourceType: 'text',
    originalContent: SAMPLE_TEXT,
    chunks: parseTextIntoChunks(SAMPLE_TEXT),
    defaultVoiceId,
    defaultProvider,
    lastPosition: { chunkIndex: 0, time: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

/** Create and persist the sample project in IndexedDB. */
export async function createSampleProject(
  defaultProvider: TTSProviderType,
  defaultVoiceId: string,
): Promise<Project> {
  const project = buildSampleProject(defaultProvider, defaultVoiceId);
  await saveProject(project);
  return project;
}
