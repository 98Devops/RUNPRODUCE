import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'RunProduce'
};

/** Light only (ui-context.md, Theme): the capture screen is read in direct sun. */
export const viewport: Viewport = {
  themeColor: '#f7f7f5',
  colorScheme: 'light'
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-[100dvh] font-sans antialiased">{children}</body>
    </html>
  );
}
