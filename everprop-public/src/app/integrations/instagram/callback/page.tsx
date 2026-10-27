import type { Metadata } from "next";
import { InstagramCallback } from "@/components/admin/InstagramCallback";

export const metadata: Metadata = { title: "Conectar Instagram | EverProp", robots: { index: false, follow: false }, referrer: "origin" };

export default function InstagramCallbackPage() {
  return <InstagramCallback />;
}
