import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/*
  Two voices, deliberately unrelated. Manrope is warm and tightly-set — it
  carries anything a person said, and takes the heavy display weights the
  headlines need. JetBrains Mono carries anything the machine produced: scores,
  counts, statuses, timestamps, provenance. The contrast between them is the
  whole signal, so it has to be visible at a glance.
*/
const sans = Manrope({
  variable: "--font-sans-src",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
  weight: ["400", "500"],
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
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
