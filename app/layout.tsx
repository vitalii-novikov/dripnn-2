import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './tokens.css';

export const metadata: Metadata = {
  title: 'Гардероб',
  description: 'Карта пола с кучками одежды',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
