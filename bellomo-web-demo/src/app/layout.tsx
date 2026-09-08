import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AIChatBubble } from "@/components/ai/AIChatBubble";
import { WebsiteProvider } from "@/components/WebsiteProvider";

const avenir = localFont({
  display: "swap",
  src: [
    { path: "./fonts/avenir-regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/avenir-demi.otf", weight: "600", style: "normal" },
    { path: "./fonts/avenir-bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-avenir",
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
      className={avenir.variable}
      lang="es-AR"
    >
      <body>
        <WebsiteProvider>
        {children}
        <AIChatBubble />
        </WebsiteProvider>
      </body>
    </html>
  );
}
