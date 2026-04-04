import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTD Assistant',
  description: 'Your Personal GTD Brain Dump and Alignment System',
};

export const viewport: Viewport = {
  themeColor: '#0f1115',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased bg-[var(--background)] text-[var(--foreground)] selection:bg-blue-500/30">
        {/* Ambient background glow */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-screen max-w-lg h-[40vh] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />
        <main className="min-h-screen text-[var(--foreground)] w-full max-w-md mx-auto relative px-4 sm:px-6 pb-24">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
