import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OPERAVIA Server App',
  description: 'Tableside ordering for OPERAVIA',
};

export default function ServerStandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className={`${inter.className} h-full bg-flo-bg text-flo-text`}>
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  );
}
