import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RiskGuardian — AI Prop Firm Risk OS',
  description: 'Real-time AI that prevents prop firm account violations before they happen. Risk calculator, behavioral AI, Monte Carlo simulator and live bridge for DXTrade, MT5, and MatchTrader.',
  keywords: ['prop firm risk management', 'trading risk calculator', 'position size calculator', 'stop loss calculator', 'forex risk management', 'trading discipline', 'FTMO', 'Tradeify', 'FundedNext'],
  authors: [{ name: 'RiskGuardian' }],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'RiskGuardian — AI Prop Firm Risk OS',
    description: 'Stop blowing accounts. Real-time AI risk protection for prop firm traders.',
    type: 'website',
    images: [{ url: '/apple-touch-icon.png', width: 640, height: 640, alt: 'RiskGuardian' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RiskGuardian',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#090909',
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
