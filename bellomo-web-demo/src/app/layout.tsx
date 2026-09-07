import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AIChatBubble } from "@/components/ai/AIChatBubble";

const manrope = localFont({
  display: "swap",
  src: "./fonts/manrope.woff2",
  variable: "--font-manrope",
  weight: "400 600",
});

const cormorantGaramond = localFont({
  display: "swap",
  src: [
    {
      path: "./fonts/cormorant-garamond-roman.woff2",
      style: "normal",
      weight: "300 500",
    },
    {
      path: "./fonts/cormorant-garamond-italic.woff2",
      style: "italic",
      weight: "300 400",
    },
  ],
  variable: "--font-cormorant",
});

export const metadata: Metadata = {
  title: "Bellomo | Desarrollos inmobiliarios y construcción en Jujuy",
  description:
    "Bellomo desarrolla, comercializa y construye proyectos inmobiliarios con visión de largo plazo en Jujuy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${manrope.variable} ${cormorantGaramond.variable}`}
      lang="es-AR"
    >
      <body>
        {children}
        <AIChatBubble />
      </body>
    </html>
  );
}
