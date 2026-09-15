import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Bellomo · Panel", short_name: "Bellomo", start_url: "/admin", scope: "/", display: "standalone", background_color: "#0c1520", theme_color: "#0c1520", icons: [{ src: "/brand/bellomo/symbol.png", type: "image/png", sizes: "any" }] };
}
