import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '../globals.css';
import { Toaster } from 'react-hot-toast';
import { KdsHtmlLang } from '@/components/kds/KdsHtmlLang';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OPERAVIA KDS - Kitchen Display',
  description: 'Kitchen Display System',
};

/**
 * Standalone kitchen shell — no AppShell/sidebar.
 * Aligns Flo typography tokens (Geist) while keeping full operational layout.
 */
export default function KdsStandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full bg-flo-bg text-flo-text antialiased`}
      >
        <KdsHtmlLang />
        <Toaster position="top-right" />
        <div className="h-full flex flex-col border-flo-border p-[length:var(--flo-page-pad-x)]">
          {children}
        </div>
      </body>
    </html>
  );
}
