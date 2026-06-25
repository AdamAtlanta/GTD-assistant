import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Executive Assistant',
  applicationName: 'Executive Assistant',
  description: 'GTD dashboard for lists, calendar review, and inbox triage',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/app-icon.svg',
    apple: '/app-icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Executive Assistant',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#46585b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-[var(--background)] text-[var(--foreground)]">
        <main className="min-h-screen text-[var(--foreground)] w-full max-w-7xl mx-auto relative px-3 sm:px-5 lg:px-8">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
