import type { Metadata } from "next";
import { Geist_Mono, Montserrat, Roboto } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers.js";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${geistMono.variable} ${montserrat.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-white dark:bg-[#17141F] text-gray-900 dark:text-[#F2F0F5] antialiased transition-colors duration-200">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
