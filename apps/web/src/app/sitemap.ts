import type { MetadataRoute } from 'next';

const pages = ['', '/terms', '/privacy', '/consumer-health-data', '/delete-account'];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((p) => ({ url: `https://usekelmi.com${p}`, lastModified: new Date('2026-11-05'), priority: p === '' ? 1 : 0.3 }));
}
