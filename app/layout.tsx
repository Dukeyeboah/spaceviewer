import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./spaceviewer.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "SpaceViewer",
  description: "Upload LCC / LCC2 / PLY and walk your space — Experiences toolkit, shareable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body>{children}</body>
    </html>
  );
}
