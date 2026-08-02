"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const HEATHER_AUTH_RETURN_KEY = "heather.auth.returnTo";

/** Keeps the current Heather screen available across an external OAuth round trip. */
export function AuthReturnTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/auth/")) return;
    const returnTo = `${pathname}${window.location.search}${window.location.hash}`;
    window.sessionStorage.setItem(HEATHER_AUTH_RETURN_KEY, returnTo);
  }, [pathname]);

  return null;
}
