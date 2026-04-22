import './globals.css';

export const metadata = {
  title: 'ProFix Parts Finder',
  description:
    'Search appliance model numbers to find likely OEM parts, pricing guidance, and supporting source links.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
