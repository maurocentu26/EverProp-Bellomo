# EVP-51 - Semáforo de cobranzas

Rama `ticket/EVP-51-semaforo-cobranzas`, desde develop `6f8dfc9`. Fecha 2026-10-20. Álvaro / Codex. Implementación publicada en la rama del ticket para revisión por PR hacia develop.

## 1. Qué pedía el ticket
[Jira EVP-51](https://eversys.atlassian.net/browse/EVP-51): resumen financiero sobrio con corporate-design-system, estados claros, Lucide y contraste accesible. Fuera de alcance: cálculos, autorización, pagos o envío de mensajes.

## 2. Qué se implementó
`everprop-public/src/app/admin/cobranzas/page.tsx`: sección Resumen de cobranzas, superficies neutrales, borde semántico, iconos funcionales con aria-hidden, títulos y explicaciones. Mora en rose, vencimientos en amber, cobros acreditados en emerald. ARS y USD en líneas separadas incluyendo cero, sin sumar monedas. Grid de una, dos o cuatro columnas.

## 3. Por qué esta solución
Se conservan métricas y formateador monetario existentes. Una sola pantalla modificada, sin dependencias ni nuevas abstracciones. “Cobrado este mes” sigue significando importes acreditados, no se cambia a “al día” porque esas condiciones no son equivalentes.

## 4. Cómo se verificó
- npm run build: PASS.
- npm run lint completo: 0 errores, 153 advertencias del repositorio.
- npm run test:collections: 6/6 PASS.
- ESLint de pantalla: 0 errores, 9 advertencias en código previo no modificado.
- Navegador con cuenta demo y API local: cuatro grupos, importes cero por moneda, contadores y estado vacío. Temas claro/oscuro y texto habitual/grande revisados visualmente.
- No hay queries, policies, jobs, caché ni IA modificados: revisión tenant/LLM no aplica al diff de presentación.

## 5. Pendientes y riesgos
No hubo cambios en base ni cobros de prueba. Esta base no tiene cuotas: no se comprobó visualmente con importes positivos/grandes. Falta prueba en dispositivo móvil real y lector de pantalla. Sin merge ni deploy. CI remoto se registra en el PR. Evidencia en evidence/EVP-51/.
