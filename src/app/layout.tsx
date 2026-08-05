import type { Metadata } from "next";
import "./globals.css";

// This app is served publicly at https://www.cyberussell.com/tms via a multi-zone rewrite —
// noindex here so search engines don't index this deployment's own raw Vercel domain as a
// duplicate of the canonical cyberussell.com/tms URL.
export const metadata: Metadata = {
  title: "Territory Management System",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
