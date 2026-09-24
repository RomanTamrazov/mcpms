import type { Metadata, Viewport } from 'next';
import './globals.css';
import './premium.css';

export const metadata: Metadata = {
  title: 'МосКоллектор — Предиктивный мониторинг',
  description:
    'Система мониторинга и прогнозирования инцидентов городской инженерной инфраструктуры Москвы',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fb' },
    { media: '(prefers-color-scheme: dark)', color: '#111318' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
