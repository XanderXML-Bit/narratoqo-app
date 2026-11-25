import type { Plugin } from 'vite';

const SITE_URL = 'https://narratoqo.vercel.app';

export function siteMetadata(): Plugin {
  const crawlFiles = [
    {
      fileName: 'robots.txt',
      contentType: 'text/plain; charset=utf-8',
      source: `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`,
    },
    {
      fileName: 'sitemap.xml',
      contentType: 'application/xml; charset=utf-8',
      source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
  </url>
  <url>
    <loc>${SITE_URL}/privacy</loc>
  </url>
</urlset>
`,
    },
  ];

  return {
    name: 'site-metadata',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
    generateBundle() {
      for (const { fileName, source } of crawlFiles) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        const file = crawlFiles.find(({ fileName }) => pathname === `/${fileName}`);
        if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
        res.setHeader('Content-Type', file.contentType);
        res.end(req.method === 'HEAD' ? undefined : file.source);
      });
    },
  };
}
