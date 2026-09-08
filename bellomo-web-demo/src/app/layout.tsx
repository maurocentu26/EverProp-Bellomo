import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AIChatBubble } from "@/components/ai/AIChatBubble";
import { WebsiteProvider } from "@/components/WebsiteProvider";
import { bellomoContact } from "@/data/bellomo";

const avenir = localFont({
  display: "swap",
  src: [
    {
      path: "./fonts/AvenirNextLTPro-Regular.otf",
      style: "normal",
      weight: "400",
    },
    {
      path: "./fonts/AvenirNextLTPro-Demi.otf",
      style: "normal",
      weight: "600",
    },
    {
      path: "./fonts/AvenirNextLTPro-Bold.otf",
      style: "normal",
      weight: "700",
    },
  ],
  variable: "--font-avenir",
});

function productionUrl() {
  const value = process.env.SITE_URL?.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

const siteUrl = productionUrl();

export const metadata: Metadata = {
  applicationName: "Bellomo",
  metadataBase: siteUrl,
  title: "Bellomo | 50 años construyendo futuro en Jujuy",
  description:
    "Desarrollos inmobiliarios, loteos, propiedades y construcción pública y privada en Jujuy. Conocé la trayectoria y los proyectos de Bellomo.",
  keywords: [
    "Bellomo",
    "loteos en Jujuy",
    "terrenos en Jujuy",
    "desarrollos inmobiliarios",
    "constructora Jujuy",
    "urbanizaciones en Jujuy",
  ],
  alternates: siteUrl ? { canonical: "/" } : undefined,
  openGraph: {
    title: "Bellomo | Construimos presente. Proyectamos futuro.",
    description:
      "50 años de trayectoria en desarrollo inmobiliario, urbanización y construcción en Jujuy.",
    locale: "es_AR",
    siteName: "Bellomo",
    type: "website",
    url: siteUrl,
    images: siteUrl
      ? [{ alt: "Bellomo en Jujuy", height: 1080, url: "/images/official/los-perales/vista-aerea-1.webp", width: 1920 }]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: "Bellomo | 50 años construyendo futuro en Jujuy",
    description: "Desarrollo inmobiliario, urbanización y construcción en Jujuy.",
    images: siteUrl ? ["/images/official/los-perales/vista-aerea-1.webp"] : undefined,
  },
  robots: { follow: true, index: true },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  address: {
    "@type": "PostalAddress",
    addressCountry: "AR",
    addressLocality: bellomoContact.city,
    streetAddress: bellomoContact.address,
  },
  areaServed: "Jujuy, Argentina",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "Atención comercial",
    telephone: bellomoContact.whatsappDisplay,
  },
  description: "Desarrollo inmobiliario, urbanización y construcción en Jujuy.",
  foundingDate: "1976",
  name: "Bellomo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={avenir.variable} lang="es-AR">
      <body>
        <script type="application/ld+json">{JSON.stringify(organizationSchema)}</script>
        <WebsiteProvider>{children}<AIChatBubble /></WebsiteProvider>
        
      </body>
    </html>
  );
}
