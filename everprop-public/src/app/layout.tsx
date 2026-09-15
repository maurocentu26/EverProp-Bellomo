import type { Metadata } from "next";
import "./globals.css";
import "./admin-design.css";
import "./panel-text-size.css";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

const avenir = localFont({ src: [
  { path: "./fonts/AvenirNextLTPro-Regular.otf", weight: "400", style: "normal" },
  { path: "./fonts/AvenirNextLTPro-Bold.otf", weight: "700", style: "normal" },
], variable: "--font-bellomo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bellomo · Panel de gestión", template: "%s · Bellomo" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Bellomo", statusBarStyle: "default" },
  description: "Panel de gestión de desarrollos, inventario y atención comercial de Bellomo.",
  icons: { icon: "/brand/bellomo/symbol.png" },
};

import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const themeScript = `
  try {
    const savedTheme = localStorage.getItem("everprop-color-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : (prefersDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={cn("h-full antialiased", "font-sans", avenir.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={cn("theme-root min-h-full flex flex-col", avenir.className)}>
        <ThemeProvider>
          <AuthProvider>
            <main className="flex-1">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
