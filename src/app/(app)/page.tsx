"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Route-group root redirect for authenticated app routes.
 */
export default function AppPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inbox");
  }, [router]);

  return null;
}
