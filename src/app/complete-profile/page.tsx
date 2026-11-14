"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CompleteProfilePage from "@/screens/CompleteProfilePage";

export default function CompleteProfileRoute() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      if (!user?.needsGoogleOnboarding) {
        router.replace("/");
        return;
      }
      setAllowed(true);
    } catch {
      router.replace("/");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready || !allowed) {
    return (
      <div className="min-h-screen grid place-items-center bg-green-900 text-white">
        Loading…
      </div>
    );
  }

  return (
    <CompleteProfilePage
      onDone={(nextUser) => {
        localStorage.setItem("user", JSON.stringify(nextUser));
        router.replace("/");
        window.location.reload();
      }}
    />
  );
}
