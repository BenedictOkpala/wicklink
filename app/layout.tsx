import type { Metadata } from 'next';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/components/theme';
export const metadata: Metadata = {
  title: 'WickLink | Market Dislocation Intelligence',
  description: 'WickLink finds price dislocations between tokenized US equities and their reference markets, then investigates what may be driving the difference.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'WickLink',
    description: 'find the weak link in the market.',
    siteName: 'WickLink',
  },
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}/>
      </head>
      <body>{children}</body>
    </html>
  );
}
