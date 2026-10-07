"use client";

import { useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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
      isReady: isLoaded,
    };
  }, [currentUser, isLoaded]);

  return session;
}
