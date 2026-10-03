import type { Metadata } from "next";
import Link from "next/link";
import { LAST_UPDATED, PrivacyContact } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos se tratan cuando escribís a una inmobiliaria por el chat web o WhatsApp, para qué y cómo ejercer tus derechos.",
};

export default function PrivacyPage() {
  return (
    <>
      <header className="space-y-2">
        <h1>Política de privacidad</h1>
        <p>Última actualización: {LAST_UPDATED}</p>
      </header>

      <p>
        Esta política explica qué datos se tratan cuando escribís a una inmobiliaria que usa <strong>EverProp</strong> por el chat de su sitio web o por WhatsApp, y cuando su equipo comercial usa el panel de gestión.
      </p>

      <h2>Quién es responsable</h2>
      <p>
        El responsable de tus datos es la <strong>inmobiliaria con la que te comunicás</strong> (por ejemplo, Bellomo Desarrollos). EverProp provee el software y trata los datos por cuenta de esa inmobiliaria, solo para prestarle el servicio.
      </p>

      <h2>Qué datos se tratan</h2>
      <ul>
        <li>Los mensajes que enviás y recibís, con su fecha y su estado de entrega.</li>
        <li>Los datos que decidas compartir: nombre, teléfono, correo y las propiedades que te interesan.</li>
        <li>Si escribís por WhatsApp: tu número y el nombre de perfil que WhatsApp informa a la inmobiliaria.</li>
        <li>Pedidos de visita y el seguimiento comercial que registre el equipo de la inmobiliaria.</li>
        <li>Datos técnicos necesarios para que el chat funcione y sea seguro: un identificador de sesión guardado en tu navegador y la dirección IP, usada para limitar abusos.</li>
      </ul>

      <h2>Para qué se usan</h2>
      <ul>
        <li>Responder tus consultas y coordinar visitas.</li>
        <li>Registrar tu interés para que un asesor pueda darte seguimiento.</li>
        <li>Prevenir abusos y mantener el servicio seguro.</li>
      </ul>
      <p>
        No vendemos tus datos ni los usamos para publicidad. Si la inmobiliaria activa un asistente automático, el texto de la conversación se procesa con un proveedor de inteligencia artificial para proponer respuestas. El asistente no confirma visitas ni precios por su cuenta, y un asesor puede tomar la conversación en cualquier momento.
      </p>

      <h2>Con quién se comparten</h2>
      <ul>
        <li>El equipo comercial de la inmobiliaria, según el rol de cada persona.</li>
        <li>Meta (WhatsApp), cuando la conversación ocurre por WhatsApp, para entregar los mensajes.</li>
        <li>Proveedores de infraestructura en la nube que alojan el servicio, bajo obligaciones de confidencialidad y seguridad.</li>
      </ul>
      <p>Los datos de cada inmobiliaria están separados de los de las demás.</p>

      <h2>Cuánto tiempo se conservan</h2>
      <p>
        Mientras sean necesarios para atender tu consulta y el seguimiento comercial, y según la política de conservación acordada con la inmobiliaria. Después se eliminan o se anonimizan, salvo que una ley obligue a conservarlos.
      </p>

      <h2>Cómo se protegen</h2>
      <ul>
        <li>Conexiones cifradas y credenciales de proveedores guardadas cifradas.</li>
        <li>Acceso del equipo según su rol.</li>
        <li>Separación estricta entre inmobiliarias.</li>
      </ul>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación, actualización o supresión de tus datos según la Ley 25.326 de Protección de los Datos Personales. Para hacerlo, <PrivacyContact />. Los pasos están en <Link href="/eliminacion-de-datos" className="font-semibold text-foreground underline">Eliminación de datos</Link>.
      </p>
      <p>
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
      </p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, se actualiza en esta página con su fecha.</p>
    </>
  );
}
