import type { Metadata } from 'next';
import { Manrope, Fraunces } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/app-providers';
import { ServiceWorkerRegister } from '@/components/service-worker-register';

const bodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
});

const accentFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-accent',
});

export const metadata: Metadata = {
  title: 'Aunti Ji AAC',
  description: 'A full-screen speech-to-text AAC assistant for fast Hinglish replies.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Aunti Ji AAC',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  themeColor: '#11100c',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${accentFont.variable} bg-ink-900 text-ink-50 antialiased`}>
        <AppProviders>
          <ServiceWorkerRegister />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
