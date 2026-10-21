import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VIZA HOME E.A.S - Panel de Ventas",
  description: "Sistema de cotización y presupuestos para vendedores VIZA HOME E.A.S - Muebles, Electrodomésticos y Motos.",
  keywords: ["VIZA HOME", "cotizador", "presupuestos", "muebles", "electrodomésticos", "motos"],
  authors: [{ name: "VIZA HOME E.A.S" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-stone-100 text-stone-900 min-h-screen`}
      >
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
