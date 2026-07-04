import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Roboto } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers.js";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: 'Kasun — Kapruka Shopping Assistant',
  description: 'AI shopping assistant for Kapruka.com',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-white dark:bg-[#17141F] text-gray-900 dark:text-[#F2F0F5] antialiased transition-colors duration-200">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
