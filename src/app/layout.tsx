import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RiskGuardia — Trade With Rules, Not Emotions',
  description: 'The professional trading risk management OS. Calculate position sizes, enforce daily loss limits, and plan every trade before you place it. Used by 4,200+ prop firm traders.',
  keywords: ['trading risk calculator', 'position size calculator', 'stop loss calculator', 'forex risk management', 'trading discipline', 'prop firm tools'],
  authors: [{ name: 'RiskGuardia' }],
  openGraph: {
    title: 'RiskGuardia — Trade With Rules, Not Emotions',
    description: 'Stop blowing accounts. Calculate, plan, and enforce your trading risk in real time.',
    type: 'website',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RiskGuardia',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#080C18',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
