import { describe, it, expect } from 'vitest';
import { parseFile, getSupportedExtensions, getAcceptString } from './FileParser';

function createFile(name: string, content: string, type = 'text/plain'): File {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  // jsdom File doesn't always support .text(), polyfill it
  if (!file.text) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file as any).text = () => Promise.resolve(content);
  }
  return file;
}

describe('FileParser', () => {
  describe('getSupportedExtensions', () => {
    it('returns known extensions', () => {
      const exts = getSupportedExtensions();
      expect(exts).toContain('.txt');
      expect(exts).toContain('.md');
      expect(exts).toContain('.html');
      expect(exts).toContain('.pdf');
      expect(exts).toContain('.epub');
    });
  });

  describe('getAcceptString', () => {
    it('returns comma-separated extensions with .text', () => {
      const accept = getAcceptString();
      expect(accept).toContain('.txt');
      expect(accept).toContain('.text');
    });
  });

  describe('parseFile', () => {
    it('rejects unsupported file types', async () => {
      const file = createFile('data.xyz', 'content');
      await expect(parseFile(file)).rejects.toThrow('Unsupported file type');
    });

    it('parses plain text files', async () => {
      const file = createFile('my-book.txt', 'Chapter 1\n\nOnce upon a time...');
      const result = await parseFile(file);
      expect(result.title).toBe('my-book');
      expect(result.content).toBe('Chapter 1\n\nOnce upon a time...');
    });

    it('parses markdown files', async () => {
      const file = createFile('notes.md', '# Heading\n\nSome content here.');
      const result = await parseFile(file);
      expect(result.title).toBe('notes');
      expect(result.content).toContain('Heading');
    });

    it('trims whitespace from text content', async () => {
      const file = createFile('spaced.txt', '  \n  Hello world  \n  ');
      const result = await parseFile(file);
      expect(result.content).toBe('Hello world');
    });

    it('parses HTML files extracting text', async () => {
      const html = `<html>
        <head><title>My Page</title></head>
        <body>
          <nav>Navigation</nav>
          <p>First paragraph</p>
          <p>Second paragraph</p>
          <script>alert("removed")</script>
        </body>
      </html>`;
      const file = createFile('page.html', html, 'text/html');
      const result = await parseFile(file);
      expect(result.title).toBe('My Page');
      expect(result.content).toContain('First paragraph');
      expect(result.content).toContain('Second paragraph');
      expect(result.content).not.toContain('alert');
      expect(result.content).not.toContain('Navigation');
    });

    it('uses h1 as title when no title tag', async () => {
      const html = '<html><body><h1>My Heading</h1><p>Content here</p></body></html>';
      const file = createFile('page.htm', html, 'text/html');
      const result = await parseFile(file);
      expect(result.title).toBe('My Heading');
    });

    it('uses filename as fallback title', async () => {
      const html = '<html><body><p>Just some text</p></body></html>';
      const file = createFile('doc.html', html, 'text/html');
      const result = await parseFile(file);
      expect(result.title).toBe('doc');
    });

    it('rejects PDF without pdfjs library', async () => {
      const file = createFile('book.pdf', '%PDF-1.4', 'application/pdf');
      await expect(parseFile(file)).rejects.toThrow('PDF parsing requires');
    });

    it('rejects EPUB without epub.js library', async () => {
      const file = createFile('book.epub', 'fake epub data', 'application/epub+zip');
      await expect(parseFile(file)).rejects.toThrow('EPUB parsing requires');
    });

    it('handles files with no extension', async () => {
      const file = createFile('noext', 'content');
      await expect(parseFile(file)).rejects.toThrow('Unsupported file type');
    });
  });
});
