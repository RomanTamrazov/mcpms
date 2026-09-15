import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'МосКоллектор — Предиктивный мониторинг',
  description:
    'Система мониторинга и прогнозирования инцидентов городской инженерной инфраструктуры Москвы',
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
