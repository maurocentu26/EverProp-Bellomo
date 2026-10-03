/** Contact for privacy requests; without it, the chat itself is the channel (it exists today). */
export function PrivacyContact() {
  const email = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim();
  return email
    ? <>escribinos a <strong>{email}</strong>, o pedilo en el mismo chat</>
    : <>pedilo en el mismo chat por el que te comunicaste (por ejemplo, &quot;quiero que borren mis datos&quot;)</>;
}

export const LAST_UPDATED = "2 de octubre de 2026";
