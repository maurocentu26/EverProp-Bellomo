"use client";

import { useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { userHasCapability } from "@/data/auth-sample";

export function useCurrentSession() {
  const { currentUser, isLoaded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirect if initialized, no user found, and we are not already on the login page
    if (isLoaded && !currentUser && pathname !== "/login") {
      router.replace("/login");
    }
  }, [currentUser, isLoaded, pathname, router]);

  const session = useMemo(() => {
    return {
      user: currentUser,
      isAdmin: currentUser?.role === "ADMIN",
      isAdvisor: currentUser?.role === "ADVISOR",
      isEngineer: currentUser?.role === "ENGINEER",
      isReadOnly: currentUser?.source === "api" && currentUser.apiRole === "READ_ONLY",
      canCreate: userHasCapability(currentUser, "create"),
      canUpdate: userHasCapability(currentUser, "update"),
      canDelete: userHasCapability(currentUser, "delete"),
      canAssign: userHasCapability(currentUser, "assign"),
      canManageUsers: userHasCapability(currentUser, "manageUsers"),
      isReady: isLoaded,
    };
  }, [currentUser, isLoaded]);

  return session;
}
