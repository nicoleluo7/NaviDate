import type { Metadata } from "next";
import { Bodoni_Moda, Pinyon_Script } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./controls.css";
import "./theme.css";
import PixelAmbience from "@/components/brand/PixelAmbience";

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bodoni",
});

const pinyonScript = Pinyon_Script({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pinyon",
});
export const metadata: Metadata = {
  title: "Navidate · A little closer",
  description:
    "Turn “What should we do?” into a date. Thoughtful date plans around Cornell and Ithaca.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bodoniModa.variable} ${pinyonScript.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <PixelAmbience />
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
