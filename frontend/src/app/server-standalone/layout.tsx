import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '../globals.css';
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OPERAVIA Server App',
  description: 'Tableside ordering for OPERAVIA',
};

/**
 * Standalone server/tableside shell — no AppShell/sidebar.
 * Aligns Flo typography tokens (Geist) with the main product.
 */
export default function ServerStandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full bg-flo-bg text-flo-text antialiased`}
      >
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  );
}
