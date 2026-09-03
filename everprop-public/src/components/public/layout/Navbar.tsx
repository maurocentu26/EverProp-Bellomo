"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type NavItem = {
  label: string;
  href: string;
};

type NavbarProps = {
  companyName?: string;
  logoSrc?: string;
  navItems?: NavItem[];
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  className?: string;
};

const defaultNavItems: NavItem[] = [
  { label: "Propiedades", href: "#propiedades" },
  { label: "Servicios", href: "#servicios" },
  { label: "Testimonios", href: "#testimonios" },
  { label: "Contacto", href: "#contacto" },
];

export function Navbar({
  companyName = "EverProp",
  logoSrc,
  navItems = defaultNavItems,
  primaryCtaLabel = "Solicitar demo",
  primaryCtaHref = "#contacto",
  secondaryCtaLabel = "Explorar",
  secondaryCtaHref = "#propiedades",
  className,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm shadow-slate-950/10">
            {logoSrc ? (
              <img src={logoSrc} alt={`${companyName} logo`} className="h-6 w-6 object-contain" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-slate-950">{companyName}</span>
            <span className="text-xs text-slate-500">Premium real estate SaaS</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <ThemeToggle compact />
          <Link
            href={secondaryCtaHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
          >
            {secondaryCtaLabel}
          </Link>
          <Link
            href={primaryCtaHref}
            className={cn(buttonVariants({ variant: "default", size: "default" }), "inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition-transform hover:-translate-y-0.5 hover:bg-slate-800")}
          >
            <Sparkles className="h-4 w-4" />
            {primaryCtaLabel}
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 lg:hidden"
          aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent fullScreen showCloseButton={false} className="flex bg-white lg:hidden">
          <DialogTitle className="sr-only">Menú principal</DialogTitle>
          <DialogDescription className="sr-only">Navegación principal de EverProp.</DialogDescription>

          <div className="flex h-dvh min-h-0 w-full flex-col">
            <div className="shrink-0 border-b border-slate-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
              <div className="mx-auto flex w-full max-w-[min(94vw,1800px)] items-center justify-between gap-4">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Sparkles className="size-5" aria-hidden="true" />
                  </span>
                  <span className="truncate text-xl font-bold text-slate-950">{companyName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                >
                  <X className="size-5" aria-hidden="true" />
                  Cerrar
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
              <nav className="mx-auto flex min-h-full w-full max-w-[min(94vw,1800px)] flex-col justify-center gap-6" aria-label="Navegación principal">
                <div className="grid gap-3 sm:grid-cols-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex min-h-16 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 text-lg font-semibold text-slate-900 transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 sm:min-h-20 sm:text-xl"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>

                <div className="grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
                  <Link
                    href={secondaryCtaHref}
                    className="flex min-h-14 items-center justify-center rounded-2xl border border-slate-300 px-5 text-center text-lg font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {secondaryCtaLabel}
                  </Link>
                  <Link
                    href={primaryCtaHref}
                    className="flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-5 text-center text-lg font-bold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {primaryCtaLabel}
                  </Link>
                </div>

                <ThemeToggle className="w-full justify-center sm:mx-auto sm:w-auto" />
              </nav>
            </div>

            <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <p className="mx-auto w-full max-w-[min(94vw,1800px)] text-center text-base text-slate-500">
                EverProp · Experiencia inmobiliaria Bellomo
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
