import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'DEGEMS | Everyday Living. Made Better.',
  description: 'Everyday Living. Made Better.',
};

export default function StorefrontLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="storefront-shell min-h-full bg-stone-50 text-foreground">
        <SiteHeader />
        {children}
        <footer className="mt-10 border-t border-stone-200 bg-stone-50">
          <div className="mx-auto flex max-w-[88rem] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-12 lg:px-10">
            <div>
              <p className="storefront-editorial-heading text-2xl tracking-tight text-stone-900">DEGEMS.</p>
              <p className="mt-1 text-xs text-stone-600">Everyday Living. Made Better.</p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.12em] text-stone-600">
              <Link href="/products" className="transition-colors hover:text-degems-brand">Shop</Link>
              <Link href="/cart" className="transition-colors hover:text-degems-brand">Your cart</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
