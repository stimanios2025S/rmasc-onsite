import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RMASC OnSite — Centre de Commandement',
  description: 'Tableau de bord de commandement RMASC OnSite',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
