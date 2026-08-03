import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/*
  One super-family, two voices. IBM Plex was drawn for institutions that have
  to be believed — which is the whole job here. Sans carries anything a person
  said; Mono carries anything the machine produced. Same skeleton, different
  register, so the distinction reads as deliberate rather than decorative.
*/
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans-src",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Apply4You — AI applies, you approve",
  description:
    "Upload your resume once. AI finds matching jobs, fills every application with your real experience, and submits after you approve.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
