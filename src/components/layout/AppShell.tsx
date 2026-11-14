"use client";

import { Leaf, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "../../lib/auth";

const links = [
  { to: "/crop-care", label: "Crop Care" },
  { to: "/market", label: "Market" },
  { to: "/consultation", label: "Consultation" },
  { to: "/alerts", label: "Alerts" },
  { to: "/assistant", label: "Assistant" },
];

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-paddy-900/8 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-paddy-900 text-paddy-50">
              <Leaf className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold leading-none text-paddy-950">
                Govi Isuru
              </p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-paddy-800/60">
                Farmer&apos;s fortune
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                href={l.to}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === l.to
                    ? "bg-paddy-100 text-paddy-900"
                    : "text-ink/70 hover:bg-paddy-50 hover:text-paddy-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-ink">{user.fullName}</p>
                <p className="text-xs capitalize text-ink/50">
                  {user.role} · {user.district || "Set location"}
                </p>
              </div>
            )}
            <button
              type="button"
              className="btn-secondary !px-3"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-secondary !px-3 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-paddy-900/8 px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  href={l.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink/80 hover:bg-paddy-50"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-8">
        {title && (
          <h1 className="font-display mb-5 text-3xl font-semibold text-paddy-950">
            {title}
          </h1>
        )}
        {children}
      </main>
    </div>
  );
}
