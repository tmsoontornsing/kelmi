import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy. Everything the site loads is its own (next/font serves the Google font from this origin, the
// images are in public/), so most sources are 'self'.
//
// script-src keeps 'unsafe-inline': Next.js writes its own inline <script> tags on every page (the React Server
// Components payload, self.__next_f.push(...)), whose contents change with every build and page, so they cannot be
// listed by hash. The other way is a per-request nonce set in middleware, which makes every page dynamic (no static
// pages, no CDN cache) for a site that has no user content and no third-party scripts to defend against. Adding a hash
// for the theme script in layout.tsx alongside 'unsafe-inline' would switch 'unsafe-inline' off in current browsers and
// break those Next.js scripts, so it is not done. The JSON-LD block is data (type application/ld+json) and is not run.
// What the policy still gives: no scripts, frames, plugins or form targets from other origins, no <base> hijack, no framing.
// 'unsafe-eval' and ws: are for the development server's hot reload only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const config: NextConfig = {
  poweredByHeader: false,
  // Browser source maps would publish the original source of every page. Off by default; stated so nobody turns it on.
  productionBrowserSourceMaps: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    }];
  },
};

export default config;
