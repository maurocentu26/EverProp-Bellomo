# Runbook de rollback — EverProp Bellomo

Este procedimiento debe ensayarse antes del uso real.

## Disparadores

- `/readyz` deja de ser 200 por más de dos minutos.
- login/me/logout o resolución tenant fallan.
- acceso cross-tenant, autorización incorrecta o exposición de secretos.
- mutación central produce falso éxito, pérdida/corrupción o error sostenido.
- tasa de 5xx o latencia supera el umbral provisional acordado.
- worker acumula jobs sin recuperación.

## Procedimiento

1. Declarar incidente, detener nuevas cargas y registrar hora/SHA/versiones. No borrar evidencias.
2. Si hay riesgo de escritura incorrecta, colocar la aplicación en modo mantenimiento o cortar sólo las rutas mutantes preservando health/observabilidad.
3. Revertir primero Vercel a la última deployment inmutable conocida y compatible.
4. Revertir Railway a la imagen anterior conocida. Web y worker deben usar versiones compatibles entre sí.
5. Para SQL forward-only, **no ejecutar rollback destructivo improvisado**. Aplicar un forward fix revisado. Restaurar backup sólo si existe corrupción confirmada y con aprobación del responsable de datos.
6. Si se restaura MySQL, aislar el destino, validar checksum, registrar RPO/RTO, reconciliar escrituras posteriores y recién después reconectar la app.
7. Revertir cambios de variables de entorno al snapshot anterior sin imprimir valores.
8. Ejecutar smoke reducido: readiness, login, tenant, lectura catálogo, propiedad, lead, RBAC y queue.
9. Mantener tráfico cerrado si cualquier gate crítico sigue fallando.

## Verificación de rollback

- SHA frontend/backend y digest de imagen coinciden con la versión elegida.
- `/healthz` y `/readyz` 200 en directo y proxy.
- Sesión, CORS, cookies y tenant funcionan con el dominio final.
- Conteos e integridad de tablas críticas reconciliados.
- Worker sin backlog creciente; storage accesible.
- Logs no muestran errores repetitivos ni datos sensibles.

## Cierre del incidente

Documentar causa, línea temporal, datos afectados, recuperación, RPO/RTO reales y acciones preventivas. El sistema vuelve a producción sólo con aprobación explícita del release owner y QA.
