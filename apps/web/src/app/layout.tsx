import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';

import './globals.css';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-outfit', display: 'swap' });

const description =
  'Meet Pip, the jar that plans your week. Tell Kelmi who you cook for and what you spend, and Pip fills the week with meals that fit, plus one grocery list to shop from.';

export const metadata: Metadata = {
  metadataBase: new URL('https://usekelmi.com'),
  title: 'Kelmi: Meal Plans on a Budget',
  description,
  openGraph: { title: 'Kelmi: Meal Plans on a Budget', description, url: 'https://usekelmi.com', siteName: 'Kelmi', images: ['/social-card.png'], type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Kelmi: Meal Plans on a Budget', description, images: ['/social-card.png'] },
  alternates: { canonical: '/' },
  icons: { icon: '/favicon.png', apple: '/apple-icon.png' },
};


const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': 'https://usekelmi.com/#org', name: 'Kelmi', legalName: 'LOGICBAKER COMPANY LIMITED', url: 'https://usekelmi.com', logo: 'https://usekelmi.com/apple-icon.png' },
    { '@type': 'WebSite', '@id': 'https://usekelmi.com/#site', url: 'https://usekelmi.com', name: 'Kelmi', publisher: { '@id': 'https://usekelmi.com/#org' } },
    { '@type': 'MobileApplication', name: 'Kelmi', description, applicationCategory: 'LifestyleApplication', operatingSystem: 'iOS, Android', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@id': 'https://usekelmi.com/#org' } },
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7FAF5' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1712' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <head>
        {/* Sets the theme before first paint: the saved choice, else the device setting. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('kavi-theme');if(t!=='dark')t='light';document.documentElement.dataset.theme=t}catch(e){}var w=innerWidth;document.documentElement.style.setProperty('--z',w>1500?Math.min(1.5,1+(w-1500)/2500).toFixed(3):'1');` }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
