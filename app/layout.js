import './globals.css';

export const metadata = { title: 'PlacementOS — Preparation Workspace', description: 'A focused workspace for placement preparation, company roadmaps, and study sessions.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
