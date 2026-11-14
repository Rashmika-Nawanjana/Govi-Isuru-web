"use client";

import { Leaf } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import VerifyEmail from "@/components/VerifyEmail";

function VerifyEmailInner() {
  const router = useRouter();
  const [lang] = useState("en");

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center text-white animate-in fade-in zoom-in duration-1000">
        <Leaf className="h-16 w-16 text-green-300 mx-auto mb-2" />
        <h1 className="text-4xl font-black tracking-tighter">GOVI ISURU</h1>
      </div>
      <VerifyEmail switchToLogin={() => router.push("/")} lang={lang} />
    </div>
  );
}

export default function VerifyEmailRoute() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center bg-green-900 text-white">
          Loading…
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
