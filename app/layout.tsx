import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lunatic Eyes",
  description: "AI that watches where your eyes go, and shuts down what steals your attention.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} dark`}>
      <body className="bg-black text-zinc-100 min-h-screen antialiased font-mono">
        {children}
      </body>
    </html>
  );
}
