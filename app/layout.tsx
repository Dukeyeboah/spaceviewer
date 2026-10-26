import type { Metadata } from "next";
import "./spaceviewer.css";

export const metadata: Metadata = {
  title: "SpaceViewer",
  description: "Upload LCC / LCC2 / PLY and walk your space — Experiences toolkit, shareable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
