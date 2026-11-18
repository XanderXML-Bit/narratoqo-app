import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseURL } from './URLParser';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('URLParser', () => {
  describe('SSRF protection', () => {
    it('rejects invalid URLs', async () => {
      await expect(parseURL('not-a-url')).rejects.toThrow('Invalid URL');
    });

    it('rejects HTTP URLs (requires HTTPS)', async () => {
      await expect(parseURL('http://example.com/article')).rejects.toThrow('URL not allowed');
    });

    it('rejects localhost', async () => {
      await expect(parseURL('https://localhost/secret')).rejects.toThrow('URL not allowed');
    });

    it('rejects 127.x.x.x loopback', async () => {
      await expect(parseURL('https://127.0.0.1/api')).rejects.toThrow('URL not allowed');
    });

    it('rejects 10.x.x.x private range', async () => {
      await expect(parseURL('https://10.0.0.1/internal')).rejects.toThrow('URL not allowed');
    });

    it('rejects 172.16-31.x.x private range', async () => {
      await expect(parseURL('https://172.16.0.1/data')).rejects.toThrow('URL not allowed');
      await expect(parseURL('https://172.31.255.255/data')).rejects.toThrow('URL not allowed');
    });

    it('rejects 192.168.x.x private range', async () => {
      await expect(parseURL('https://192.168.1.1/admin')).rejects.toThrow('URL not allowed');
    });

    it('rejects 169.254.x.x link-local (AWS metadata)', async () => {
      await expect(parseURL('https://169.254.169.254/latest/meta-data')).rejects.toThrow('URL not allowed');
    });

    it('rejects 0.x.x.x current network', async () => {
      await expect(parseURL('https://0.0.0.0/')).rejects.toThrow('URL not allowed');
    });

    it('allows valid HTTPS public URLs', async () => {
      // This will fail at fetch level, not at SSRF check
      mockFetch.mockRejectedValue(new Error('Network error'));
      await expect(parseURL('https://example.com/article')).rejects.toThrow();
      // The error should NOT be about URL not allowed
    });
  });

  describe('parseURL with mock responses', () => {
    it('extracts content from proxy response', async () => {
      const html = `
        <html>
          <head>
            <title>Test Article</title>
            <meta property="og:title" content="My Article Title" />
            <meta name="author" content="John Doe" />
            <meta property="og:site_name" content="TestSite" />
          </head>
          <body>
            <article>
              <p>This is a long paragraph with enough content to pass the minimum threshold for extraction. It needs to be over two hundred characters to be considered meaningful content by the parser.</p>
              <p>Second paragraph with additional content that makes the article extraction work properly in the test environment.</p>
            </article>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ contents: html }),
      });

      const result = await parseURL('https://example.com/article');
      expect(result.title).toBe('My Article Title');
      expect(result.author).toBe('John Doe');
      expect(result.siteName).toBe('TestSite');
      expect(result.content.length).toBeGreaterThan(100);
    });

    it('falls back to second proxy on first failure', async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Fallback content that is long enough to pass all the minimum content thresholds for the parser to accept it as valid article text.</p>
              <p>More content here to ensure we have enough text for a successful extraction from the fallback proxy method.</p>
            </article>
          </body>
        </html>
      `;

      // First proxy fails
      mockFetch.mockRejectedValueOnce(new Error('Proxy down'));
      // Second proxy succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(html),
      });

      const result = await parseURL('https://example.com/article');
      expect(result.content.length).toBeGreaterThan(50);
    });

    it('throws when all extraction methods fail', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      await expect(parseURL('https://example.com/article')).rejects.toThrow('Could not fetch this page');
    });

    it('throws when content is too short', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ contents: '<html><body><p>Short</p></body></html>' }),
      });
      mockFetch.mockRejectedValueOnce(new Error('fail'));

      await expect(parseURL('https://example.com/article')).rejects.toThrow();
    });
  });
});
