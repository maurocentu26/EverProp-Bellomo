import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";

import { cn } from "@/lib/utils";

type FooterLink = {
  label: string;
  href: string;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

type FooterProps = {
  companyName?: string;
  description?: string;
  columns?: FooterColumn[];
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  className?: string;
};

const defaultColumns: FooterColumn[] = [
  {
    title: "Producto",
    links: [
      { label: "Publicar propiedad", href: "#publicar" },
      { label: "Captación de leads", href: "#leads" },
      { label: "Automatización", href: "#automatizacion" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { label: "Blog", href: "#blog" },
      { label: "Guías", href: "#guias" },
      { label: "Soporte", href: "#soporte" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Nosotros", href: "#nosotros" },
      { label: "Privacidad", href: "#privacidad" },
      { label: "Términos", href: "#terminos" },
    ],
  },
];

export function Footer({
  companyName = "EverProp",
  description = "La plataforma SaaS para inmobiliarias que necesitan una presencia digital más clara, más rápida y más rentable.",
  columns = defaultColumns,
  contactEmail = "hola@everprop.com",
  contactPhone = "+54 11 5555-5555",
  address = "Buenos Aires, Argentina",
  className,
}: FooterProps) {
  return (
    <footer className={cn("border-t border-slate-200 bg-slate-50", className)}>
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <div className="max-w-xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              SaaS premium para inmobiliarias
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                {companyName}
              </h2>
              <p className="max-w-lg text-sm leading-6 text-slate-600 sm:text-base">
                {description}
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Mail className="h-4 w-4 text-blue-600" />
                <span>{contactEmail}</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Phone className="h-4 w-4 text-blue-600" />
                <span>{contactPhone}</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <MapPin className="h-4 w-4 text-blue-600" />
                <span>{address}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title} className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-950">
                  {column.title}
                </h3>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1 text-sm text-slate-600 transition-colors hover:text-slate-950"
                      >
                        {link.label}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
          <p>Diseñado para una experiencia mobile-first, clara y de alto rendimiento.</p>
        </div>
      </div>
    </footer>
  );
}
