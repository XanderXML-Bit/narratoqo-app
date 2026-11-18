/**
 * URL Parser Service
 * Fetches and extracts readable content from web articles.
 */

interface ParsedArticle {
  title: string;
  content: string;
  author?: string;
  publishDate?: string;
  siteName?: string;
}

/**
 * Validates that a URL is safe to fetch (prevents SSRF attacks).
 * Blocks private IP ranges, localhost, and requires HTTPS.
 */
function isURLSafe(url: string): boolean {
  const parsed = new URL(url);

  // Require HTTPS for security
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Block private IP ranges (RFC 1918) and special addresses
  const hostname = parsed.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,                           // Loopback
    /^10\./,                            // Class A private
    /^172\.(1[6-9]|2[0-9]|3[01])\./,   // Class B private
    /^192\.168\./,                      // Class C private
    /^169\.254\./,                      // Link-local / AWS metadata
    /^0\./,                             // Current network
    /^\[::1\]$/,                        // IPv6 loopback
    /^\[fe80:/i,                        // IPv6 link-local
    /^\[fc00:/i,                        // IPv6 unique local
    /^\[fd00:/i,                        // IPv6 unique local
  ];

  return !privatePatterns.some(pattern => pattern.test(hostname));
}

/**
 * Extracts readable content from a URL using a proxy service.
 * Falls back to basic HTML parsing if proxy is unavailable.
 */
export async function parseURL(url: string): Promise<ParsedArticle> {
  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL provided');
  }

  // Security: Validate URL is safe to fetch (SSRF protection)
  if (!isURLSafe(url)) {
    throw new Error('URL not allowed: must be HTTPS and a public address');
  }

  // Try multiple extraction methods
  const methods = [
    () => extractWithAllOrigins(url),
    () => extractWithCorsProxy(url),
  ];

  for (const method of methods) {
    try {
      const result = await method();
      if (result && result.content.length > 100) {
        return result;
      }
    } catch (e) {
      console.warn('Extraction method failed:', e);
    }
  }

  throw new Error(
    'Could not fetch this page: both public proxies failed or the site blocks them. Copy the text from the page and use the Paste tab instead.'
  );
}

/** Each proxy gets this long before the next one is tried. */
export const PROXY_TIMEOUT_MS = 15_000;

/** fetch() that gives up after PROXY_TIMEOUT_MS, so a stalled proxy cannot hang the import. */
async function fetchWithTimeout(input: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    return await fetch(input, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The proxy did not answer in time');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract content using AllOrigins proxy
 */
async function extractWithAllOrigins(url: string): Promise<ParsedArticle> {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

  const response = await fetchWithTimeout(proxyUrl);
  if (!response.ok) {
    throw new Error(`Proxy request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.contents) {
    throw new Error('No content received from proxy');
  }

  return extractFromHTML(data.contents, url);
}

/**
 * Extract content using CORS Anywhere (alternative)
 */
async function extractWithCorsProxy(url: string): Promise<ParsedArticle> {
  // Note: cors-anywhere requires visiting the demo page to get temporary access
  // This is a fallback option
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

  const response = await fetchWithTimeout(proxyUrl);
  if (!response.ok) {
    throw new Error(`CORS proxy request failed: ${response.status}`);
  }

  const html = await response.text();
  return extractFromHTML(html, url);
}

/**
 * Extract readable content from HTML
 */
function extractFromHTML(html: string, sourceUrl: string): ParsedArticle {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove unwanted elements
  const selectorsToRemove = [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'header',
    'footer',
    'aside',
    '.advertisement',
    '.ad',
    '.sidebar',
    '.comments',
    '.comment',
    '.social-share',
    '.related-posts',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
  ];

  selectorsToRemove.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  });

  // Extract title
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="title"]')?.getAttribute('content') ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('title')?.textContent?.trim() ||
    new URL(sourceUrl).hostname;

  // Extract author
  const author =
    doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
    doc.querySelector('[rel="author"]')?.textContent?.trim() ||
    doc.querySelector('.author')?.textContent?.trim();

  // Extract publish date
  const publishDate =
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    doc.querySelector('time')?.getAttribute('datetime') ||
    undefined;

  // Extract site name
  const siteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
    new URL(sourceUrl).hostname;

  // Find the main content
  const content = extractMainContent(doc);

  if (!content || content.length < 50) {
    throw new Error('Could not extract meaningful content from the page');
  }

  return {
    title: cleanText(title),
    content: cleanText(content),
    author: author ? cleanText(author) : undefined,
    publishDate,
    siteName,
  };
}

/**
 * Find and extract the main article content
 */
function extractMainContent(doc: Document): string {
  // Try common article selectors
  const articleSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '.post-body',
    '.article-body',
    '#content',
    '.story-body',
  ];

  for (const selector of articleSelectors) {
    const element = doc.querySelector(selector);
    if (element) {
      const text = extractTextFromElement(element);
      if (text.length > 200) {
        return text;
      }
    }
  }

  // Fallback: find the element with the most paragraph text
  const body = doc.body;
  if (!body) return '';

  let bestElement: Element | null = null;
  let maxScore = 0;

  const candidates = body.querySelectorAll('div, section, article');
  candidates.forEach((element) => {
    const paragraphs = element.querySelectorAll('p');
    const score = Array.from(paragraphs).reduce((sum, p) => {
      const text = p.textContent || '';
      return sum + text.length;
    }, 0);

    if (score > maxScore) {
      maxScore = score;
      bestElement = element;
    }
  });

  if (bestElement && maxScore > 200) {
    return extractTextFromElement(bestElement);
  }

  // Last resort: get all paragraph text
  const allParagraphs = doc.querySelectorAll('p');
  return Array.from(allParagraphs)
    .map((p) => p.textContent?.trim())
    .filter((text) => text && text.length > 20)
    .join('\n\n');
}

/**
 * Extract text from an element, preserving paragraph structure
 */
function extractTextFromElement(element: Element): string {
  const paragraphs: string[] = [];

  // Get text from paragraphs and headings
  const textElements = element.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

  textElements.forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      // Add heading markers
      if (el.tagName.match(/^H[1-6]$/)) {
        paragraphs.push(`\n${text}\n`);
      } else {
        paragraphs.push(text);
      }
    }
  });

  // If no structured content, fall back to innerText
  if (paragraphs.length === 0) {
    return element.textContent?.trim() || '';
  }

  return paragraphs.join('\n\n');
}

/**
 * Clean and normalize text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')   // Max 2 consecutive newlines
    .replace(/^\s+|\s+$/g, '')    // Trim
    .replace(/\u00A0/g, ' ');     // Replace non-breaking spaces
}
