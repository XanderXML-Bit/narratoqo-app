/**
 * File Parser Service
 * Handles parsing of uploaded files (TXT, PDF, EPUB, etc.)
 */

interface ParsedFile {
  title: string;
  content: string;
  chapters?: Array<{
    title: string;
    content: string;
  }>;
  metadata?: {
    author?: string;
    publisher?: string;
    language?: string;
  };
}

type SupportedFileType = 'text' | 'pdf' | 'epub' | 'html' | 'markdown';

const FILE_EXTENSIONS: Record<string, SupportedFileType> = {
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.pdf': 'pdf',
  '.epub': 'epub',
};

/**
 * Parse an uploaded file based on its type
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const extension = getFileExtension(file.name);
  const fileType = FILE_EXTENSIONS[extension];

  if (!fileType) {
    throw new Error(`Unsupported file type: ${extension}`);
  }

  switch (fileType) {
    case 'text':
    case 'markdown':
      return parseTextFile(file);
    case 'html':
      return parseHTMLFile(file);
    case 'pdf':
      return parsePDFFile(file);
    case 'epub':
      return parseEPUBFile(file);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Get supported file extensions for the file input
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(FILE_EXTENSIONS);
}

/**
 * Get accept string for file input
 */
export function getAcceptString(): string {
  return getSupportedExtensions().join(',') + ',.text';
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Parse plain text or markdown file
 */
async function parseTextFile(file: File): Promise<ParsedFile> {
  const content = await file.text();
  const title = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

  return {
    title,
    content: content.trim(),
  };
}

/**
 * Parse HTML file
 */
async function parseHTMLFile(file: File): Promise<ParsedFile> {
  const html = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove unwanted elements
  const selectorsToRemove = ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside'];
  selectorsToRemove.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  });

  // Get title
  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    file.name.replace(/\.[^/.]+$/, '');

  // Get body content
  const body = doc.body;
  const content = body ? extractTextFromBody(body) : '';

  return {
    title,
    content: content.trim(),
  };
}

function extractTextFromBody(body: Element): string {
  const paragraphs: string[] = [];
  const elements = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

  elements.forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length === 0) {
    return body.textContent?.trim() || '';
  }

  return paragraphs.join('\n\n');
}

/**
 * Parse PDF file
 * Note: Full PDF support requires pdfjs-dist library
 */
async function parsePDFFile(file: File): Promise<ParsedFile> {
  // Check if PDF.js is available
  if (typeof window !== 'undefined' && 'pdfjsLib' in window) {
    return parsePDFWithPDFJS(file);
  }

  // Fallback: Return error message about PDF support
  throw new Error(
    'PDF parsing requires the pdfjs-dist library. ' +
    'Please copy and paste the text content instead, or install pdfjs-dist.'
  );
}

async function parsePDFWithPDFJS(file: File): Promise<ParsedFile> {
  // @ts-expect-error - pdfjsLib would be loaded dynamically
  const pdfjsLib = window.pdfjsLib;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: { str: string }) => item.str)
      .join(' ');
    textParts.push(pageText);
  }

  return {
    title: file.name.replace(/\.pdf$/i, ''),
    content: textParts.join('\n\n').trim(),
    metadata: {
      // PDF metadata could be extracted here
    },
  };
}

/**
 * Parse EPUB file
 * Note: Full EPUB support requires epub.js library
 */
async function parseEPUBFile(file: File): Promise<ParsedFile> {
  // Check if epub.js is available
  if (typeof window !== 'undefined' && 'ePub' in window) {
    return parseEPUBWithEpubJS(file);
  }

  // Fallback: Return error message about EPUB support
  throw new Error(
    'EPUB parsing requires the epub.js library. ' +
    'Please copy and paste the text content instead, or install epub.js.'
  );
}

async function parseEPUBWithEpubJS(file: File): Promise<ParsedFile> {
  // @ts-expect-error - ePub would be loaded dynamically
  const ePub = window.ePub;

  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;

  const metadata = await book.loaded.metadata;
  const spine = await book.loaded.spine;

  const chapters: Array<{ title: string; content: string }> = [];
  const textParts: string[] = [];

  for (const item of spine.items) {
    const content = await item.load(book.load.bind(book));
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const text = doc.body?.textContent?.trim() || '';

    if (text) {
      textParts.push(text);
      chapters.push({
        title: item.idref || `Chapter ${chapters.length + 1}`,
        content: text,
      });
    }
  }

  return {
    title: metadata.title || file.name.replace(/\.epub$/i, ''),
    content: textParts.join('\n\n').trim(),
    chapters,
    metadata: {
      author: metadata.creator,
      publisher: metadata.publisher,
      language: metadata.language,
    },
  };
}
