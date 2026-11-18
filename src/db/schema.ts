import Dexie, { type EntityTable } from 'dexie';
import type { Project, CachedAudio, Settings } from '@/types';

// Database schema
export interface NarratoqoDBSchema {
  projects: EntityTable<Project, 'id'>;
  audioCache: EntityTable<CachedAudio, 'id'>;
  settings: EntityTable<Settings & { id: string }, 'id'>;
}

// Database instance
export class NarratoqoDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  audioCache!: EntityTable<CachedAudio, 'id'>;
  settings!: EntityTable<Settings & { id: string }, 'id'>;

  constructor() {
    super('narratoqo');

    this.version(1).stores({
      projects: 'id, title, createdAt, updatedAt',
      audioCache: 'id, projectId, chunkIndex, accessedAt, [projectId+chunkIndex]',
      settings: 'id',
    });
  }
}

// Singleton database instance
export const db = new NarratoqoDB();

// Helper functions
export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function getAllProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function saveProject(project: Project): Promise<string> {
  project.updatedAt = new Date();
  return db.projects.put(project);
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.audioCache], async () => {
    await db.projects.delete(id);
    await db.audioCache.where('projectId').equals(id).delete();
  });
}

export async function getCachedAudio(
  projectId: string,
  chunkIndex: number
): Promise<CachedAudio | undefined> {
  const cached = await db.audioCache
    .where('[projectId+chunkIndex]')
    .equals([projectId, chunkIndex])
    .first();

  if (cached) {
    // Update access time for LRU
    await db.audioCache.update(cached.id, { accessedAt: new Date() });
  }

  return cached;
}

/**
 * Delete cached audio for a specific project.
 * Used when regenerating all audio.
 */
export async function deleteProjectCache(projectId: string): Promise<void> {
  await db.audioCache.where('projectId').equals(projectId).delete();
}

export async function saveCachedAudio(audio: CachedAudio): Promise<string> {
  return db.audioCache.put(audio);
}

export async function getCacheSize(): Promise<number> {
  const items = await db.audioCache.toArray();
  return items.reduce((total, item) => total + item.sizeBytes, 0);
}

export async function pruneCache(maxSizeBytes: number): Promise<number> {
  const currentSize = await getCacheSize();
  if (currentSize <= maxSizeBytes) return 0;

  let deletedCount = 0;
  const targetSize = maxSizeBytes * 0.8; // Keep 20% headroom

  // Get oldest accessed items first
  const items = await db.audioCache.orderBy('accessedAt').toArray();

  let freedBytes = 0;
  for (const item of items) {
    if (currentSize - freedBytes <= targetSize) break;

    await db.audioCache.delete(item.id);
    freedBytes += item.sizeBytes;
    deletedCount++;
  }

  return deletedCount;
}

export async function clearAllCache(): Promise<void> {
  await db.audioCache.clear();
}

export async function getSettings(): Promise<Settings | null> {
  const result = await db.settings.get('default');
  if (result) {
    const { id: _id, ...settings } = result;
    return settings as Settings;
  }
  return null;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, id: 'default' });
}
