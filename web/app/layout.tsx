import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlamSanct — Chef",
  description: "Chef interface for FlamSanct",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-forge text-parchment min-h-screen">{children}</body>
    </html>
  );
}
