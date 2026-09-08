import { redirect } from "next/navigation";
import { FINAL_DELIVERY_ENABLED } from "@/lib/release-visibility";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!FINAL_DELIVERY_ENABLED) redirect("/admin");
  return children;
}
