import Link from "next/link";

/** Public legal pages (no session): required URLs for the Meta app and for clients who write to us. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <article className="space-y-6 text-[15px] leading-7 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_strong]:text-foreground">
        {children}
      </article>
      <nav aria-label="Páginas legales" className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link href="/privacidad" className="font-semibold underline-offset-4 hover:underline">Política de privacidad</Link>
        <Link href="/eliminacion-de-datos" className="font-semibold underline-offset-4 hover:underline">Eliminación de datos</Link>
      </nav>
    </main>
  );
}
