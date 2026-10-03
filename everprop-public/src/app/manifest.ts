import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "Bellomo · Panel",
    short_name: "Bellomo",
    description: "Bandeja de conversaciones, leads y visitas de Bellomo.",
    lang: "es-AR",
    start_url: "/admin/conversaciones",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c1520",
    theme_color: "#0c1520",
    icons: [
      { src: "/icon/192", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon/512", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon/maskable", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Esperan asesor", url: "/admin/conversaciones", icons: [{ src: "/icon/192", sizes: "192x192", type: "image/png" }] },
      { name: "Solicitudes de visita", url: "/admin/solicitudes-visita", icons: [{ src: "/icon/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
