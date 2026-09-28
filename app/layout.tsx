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
  title: "Névkereső",
  description:
    "Laza keresés eredeti és felvett vezetéknévre a MACSE élő névjegyzékében és Szentiványi Zoltán 1800–1893-as kötetében.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hu" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
