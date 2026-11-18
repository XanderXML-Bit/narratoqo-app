import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlobURLManager, getBlobURLManager, resetBlobURLManager } from './BlobURLManager';

// Mock URL.createObjectURL and revokeObjectURL
let urlCounter = 0;
const revokedUrls = new Set<string>();

vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn(() => `blob:http://localhost/${++urlCounter}`),
  revokeObjectURL: vi.fn((url: string) => revokedUrls.add(url)),
});

describe('BlobURLManager', () => {
  let manager: BlobURLManager;

  beforeEach(() => {
    manager = new BlobURLManager();
    urlCounter = 0;
    revokedUrls.clear();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates and tracks a blob URL', () => {
      const blob = new Blob(['test']);
      const url = manager.create(blob);
      expect(url).toMatch(/^blob:/);
      expect(manager.size).toBe(1);
      expect(manager.has(url)).toBe(true);
    });

    it('uses custom id when provided', () => {
      const blob = new Blob(['test']);
      const url = manager.create(blob, 'my-id');
      expect(manager.has('my-id')).toBe(true);
      expect(manager.has(url)).toBe(true);
    });

    it('revokes old URL when id is reused', () => {
      const blob = new Blob(['test']);
      const url1 = manager.create(blob, 'reuse-id');
      const url2 = manager.create(blob, 'reuse-id');
      expect(url1).not.toBe(url2);
      expect(revokedUrls.has(url1)).toBe(true);
      expect(manager.size).toBe(1);
    });
  });

  describe('revoke', () => {
    it('revokes by id', () => {
      const blob = new Blob(['test']);
      manager.create(blob, 'test-id');
      manager.revoke('test-id');
      expect(manager.size).toBe(0);
      expect(manager.has('test-id')).toBe(false);
    });

    it('does nothing for unknown id', () => {
      manager.revoke('nonexistent');
      expect(manager.size).toBe(0);
    });
  });

  describe('revokeByUrl', () => {
    it('revokes tracked URL', () => {
      const blob = new Blob(['test']);
      const url = manager.create(blob, 'url-id');
      manager.revokeByUrl(url);
      expect(manager.size).toBe(0);
    });

    it('revokes untracked blob URL', () => {
      manager.revokeByUrl('blob:http://localhost/untracked');
      expect(revokedUrls.has('blob:http://localhost/untracked')).toBe(true);
    });

    it('ignores non-blob URLs', () => {
      manager.revokeByUrl('https://example.com');
      expect(revokedUrls.size).toBe(0);
    });
  });

  describe('revokeAll', () => {
    it('revokes all tracked URLs', () => {
      const blob = new Blob(['test']);
      manager.create(blob, 'a');
      manager.create(blob, 'b');
      manager.create(blob, 'c');
      expect(manager.size).toBe(3);

      manager.revokeAll();
      expect(manager.size).toBe(0);
      expect(revokedUrls.size).toBe(3);
    });
  });

  describe('has', () => {
    it('checks by id and url', () => {
      const blob = new Blob(['test']);
      const url = manager.create(blob, 'check-id');
      expect(manager.has('check-id')).toBe(true);
      expect(manager.has(url)).toBe(true);
      expect(manager.has('unknown')).toBe(false);
    });
  });
});

describe('singleton', () => {
  beforeEach(() => {
    resetBlobURLManager();
  });

  it('returns same instance', () => {
    const a = getBlobURLManager();
    const b = getBlobURLManager();
    expect(a).toBe(b);
  });

  it('reset creates new instance', () => {
    const a = getBlobURLManager();
    resetBlobURLManager();
    const b = getBlobURLManager();
    expect(a).not.toBe(b);
  });
});
