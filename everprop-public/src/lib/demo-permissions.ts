import type { UserProfile } from "@/data/auth-sample";

export function canManageInventory(user: UserProfile | null) {
  return !!user && (user.permissions.includes("full_access") || user.permissions.includes("manage_inventory"));
}

export function canManageWebsite(user: UserProfile | null) {
  return !!user && user.permissions.includes("full_access");
}
