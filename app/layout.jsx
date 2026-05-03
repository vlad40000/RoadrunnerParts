import './globals.css';

export const metadata = {
  title: 'Road Runner Parts',
  description: 'Professional appliance parts and pricing explorer.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
