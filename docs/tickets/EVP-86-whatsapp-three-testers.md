# EVP-86 — Tres destinatarios sandbox y prueba automática

Rama `ticket/EVP-86-whatsapp-three-testers`, base develop f42017a, 2026-10-26. Álvaro con Codex. Commit/push/PR autorizados por Álvaro; despliegue pendiente.

## 1. Pedido y evidencia

Los tres destinatarios ya aparecen en la lista de prueba de Meta. EVP-80 conserva un único par FROM/TO, por lo que los otros dos wa_id no reciben la excepción de formato. Develop y el worker de staging ya ejecutan EVP-81 (f42017a). Proveedor runtime confirmado: Gemini gemini-3.1-flash-lite, clave presente, presupuesto compartido USD10 y tasas 0.25/1.50; sin mostrar la clave. Runtime observado: `conversations.ai_enabled=false`, copiloto y gate Gemini habilitados. Las tres conversaciones WhatsApp están en atención humana. No confundir copiloto con respuesta automática.

## 2. Implementación

Nueva variable opcional `META_WHATSAPP_SANDBOX_RECIPIENTS`: lista separada por comas de wa_id entrantes aprobados. Se compara estrictamente, solo en el Phone Number ID sandbox configurado y solo texto libre. Para cada coincidencia, valida `549` más diez dígitos y deriva exactamente el mismo número sin el 9 móvil. No permite configurar un destino arbitrario. El par legacy conserva prioridad y validación; no se cambian identidades persistidas, outbox, tokens, esquema ni canales restantes. Sin dependencias.

## 3. Motivo y límites

La lista explícita satisface los tres testers sin normalización universal. No es una regla general de telefonía argentina. No guardar números personales en Git/Jira. Producción fuera de alcance; adjuntos y plantillas conservan su comportamiento.

## 4. Verificación

Rojo: prueba del segundo destinatario falla sin la corrección. Verde: nueve pruebas específicas /36 aserciones. Regresión inicial Conversations + Integrations: 191 pruebas /1273 aserciones pasan; posteriormente se añadió un negativo de destinatario malformado y se probó lista con legacy vacío. Pint/PHPStan pasan. Entorno: Docker PHP8.4/MySQL8.4, copia aislada /tmp/evp80, base local de pruebas con transacciones. Sin tocar el stack de preview ni esquema. Revisión independiente de aislamiento sin bloqueos; sugerencias de cobertura incorporadas.

## 5. Pendientes y riesgos reales

Publicar corrección mediante commit/PR revisado y despliegue autorizado. Configurar la nueva lista de tres wa_id únicamente en API/worker de bellomito-staging, mantener el Phone Number ID actual y la excepción legacy para compatibilidad. Verificar config efectiva.

Para probar automático: verificar proveedor/modelo, clave presente sin exponerla, presupuesto y límites; activar CONVERSATIONS_AI_ENABLED en API/worker de staging y modo del tenant si procede. Usar la acción existente de devolver a IA en las tres conversaciones de prueba. Los testers deben enviar mensajes nuevos; comprobar generación, aceptación Meta, delivery webhook y recepción humana por separado para los tres números. No se da por aprobado ningún E2E automático aún. No reenviar mensajes UNKNOWN ni disparar retroactivamente respuestas a conversaciones reales. Reversión: vaciar la lista y desactivar automático mediante despliegue de configuración.
