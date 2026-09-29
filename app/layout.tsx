import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  variable: "--font-source-sans",
});

const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: "Vezetéknév-változtatás kereső",
  description:
    "1800-tól 1955-ig keres régi és új vezetéknévre. Forrás: Szentiványi Zoltán könyve (1800–1893) és a MACSE listája (1815–1955).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hu" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
