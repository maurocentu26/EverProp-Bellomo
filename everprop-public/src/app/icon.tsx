import { brandIcon } from "@/lib/brand-icon";

export const contentType = "image/png";

// Served as /icon/192, /icon/512 and /icon/maskable; referenced from manifest.ts.
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType },
    { id: "512", size: { width: 512, height: 512 }, contentType },
    { id: "maskable", size: { width: 512, height: 512 }, contentType },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const key = String(await id);
  return brandIcon(key === "192" ? 192 : 512, key === "maskable");
}
