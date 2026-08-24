import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthGate } from "@/components/auth/AuthGate";
import { ClientErrorProbe } from "@/components/ClientErrorProbe";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Отправки | CASHER Admin",
  description: "Панель сборки и отправки заказов",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ClientErrorProbe>
          <AuthGate>{children}</AuthGate>
        </ClientErrorProbe>
      </body>
    </html>
  );
}
