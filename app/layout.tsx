import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skyla Engineering Dashboard',
  description: 'Internal Engineering Ops dashboard for Skyla Collective',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
