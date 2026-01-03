import type { Metadata } from 'next';
import Script from 'next/script';
import { Open_Sans } from 'next/font/google';

import { MessagesProvider } from '@/contexts/MessageContext';

import './globals.scss';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  display: 'swap',
  variable: '--font-open-sans', // CSS variable
});

export const metadata: Metadata = {
  title: "ISIA Instructor Card App",
  description: "",
  manifest: "/manifest.webmanifest", // used to be: "/manifest.ts"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={openSans.variable}>
      <head>
        {/* Capture beforeinstallprompt BEFORE React hydrates */}
        {/* This inline script runs synchronously and catches the event immediately,
        storing it globally for React to pick up later. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__pwaInstallPromptEvent = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                console.log('Global: beforeinstallprompt captured early!');
                e.preventDefault();
                window.__pwaInstallPromptEvent = e;
              });
            `,
          }}
        />
      </head>
      <body className={`${openSans.className} antialiased`}>
        <MessagesProvider>
          <Script src="/service-worker.js" />
          {children}
        </MessagesProvider>
      </body>
    </html>
  );
}
