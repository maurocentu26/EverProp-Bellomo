import { redirect } from "next/navigation";

// Preserve previously opened local links without retaining a separate section.
export default function MaterialesRedirect() {
  redirect("/admin/desarrollos");
}
