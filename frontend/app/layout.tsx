import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RUET Central Fee Payment",
  description:
    "Rajshahi University of Engineering & Technology — central online fee payment and automated ledger system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
