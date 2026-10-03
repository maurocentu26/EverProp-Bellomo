import type { Metadata } from "next";
import Link from "next/link";
import { LAST_UPDATED, PrivacyContact } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: "Cómo pedir que se eliminen tus datos de conversaciones con una inmobiliaria que usa EverProp.",
};

export default function DataDeletionPage() {
  return (
    <>
      <header className="space-y-2">
        <h1>Eliminación de datos</h1>
        <p>Última actualización: {LAST_UPDATED}</p>
      </header>

      <h2>Si escribiste a una inmobiliaria</h2>
      <p>Para pedir que se eliminen tus datos, <PrivacyContact />.</p>
      <ul>
        <li>Indicá el medio por el que escribiste (chat del sitio o WhatsApp) y, si fue por WhatsApp, tu número.</li>
        <li>Para proteger tus datos, la inmobiliaria puede pedirte que confirmes que sos el titular.</li>
        <li>Se eliminan tus mensajes, tus datos de contacto y el registro de tu interés comercial. Solo se conserva lo que una ley obligue a guardar, y te lo informamos.</li>
        <li>La Ley 25.326 fija un plazo de cinco días hábiles para la supresión y de diez días corridos para responder un pedido de acceso. Te avisamos cuando esté hecho.</li>
      </ul>
      <p>Hoy cada pedido lo procesa una persona del equipo. No hace falta crear ninguna cuenta.</p>

      <h2>Si sos una empresa que conectó su cuenta de WhatsApp Business</h2>
      <p>
        Para desconectar tu cuenta, <PrivacyContact />. Al desconectarla se deja de usar el acceso que otorgaste y se borran las credenciales de conexión. Esto no elimina automáticamente los mensajes y contactos ya guardados. La eliminación de esos datos se solicita por separado y hoy la procesa una persona del equipo, previa verificación del pedido.
      </p>

      <p>Más información en la <Link href="/privacidad" className="font-semibold text-foreground underline">Política de privacidad</Link>.</p>
    </>
  );
}
