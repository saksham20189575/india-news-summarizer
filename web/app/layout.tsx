import {
  Merriweather,
  Playfair_Display,
  Public_Sans,
} from "next/font/google";
import type { ReactNode } from "react";
import { ReadingProgress } from "@/components/ReadingProgress";
import { SoftRefresh } from "@/components/SoftRefresh";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-body",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata = {
  title: "Bharat Brief",
  description: "India’s hourly news briefing, summarized from major public sources.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${merriweather.variable} ${publicSans.variable}`}
    >
      <body>
        <ReadingProgress />
        <SoftRefresh />
        {children}
      </body>
    </html>
  );
}
