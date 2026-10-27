# EVP-66 — Cierre del guiado acorde a lo guardado

Rama `ticket/EVP-66-cierre-honesto` desde develop `11d14796a17207f08a6e6e04940f8593f73865d8` · 2026-10-27 · Codex para Álvaro.

## 1. Qué pedía el ticket

El criterio6 de EVP-66 exige un cierre que distinga resultados y contactos saltados, sin atribuir gestiones que no ocurrieron. En staging se verificó una ronda de4 prioridades/6 pendientes: cancelar el editor conserva el paso; saltar4 no guarda seguimientos y conserva6 pendientes. Sin embargo, el texto final afirmaba que los resultados habían quedado en el historial.

## 2. Qué se implementó

`AdvisorDayGuide.tsx` muestra «No se guardaron seguimientos en esta ronda» si registrados=0. Si hubo registros exitosos, remite al historial del cliente correspondiente. El enlace verbal de pendientes ahora menciona la sección real «A quién llamar», reemplazando el nombre antiguo «Tu próximo paso».

`advisor-day-guide.test.mjs` amplía las pruebas existentes del componente para verificar cierre sin guardados y cierre mixto de un guardado exitoso/un saltado. `.github/workflows/web.yml` incorpora las28 pruebas de guiado, cola y conformidad a CI.

## 3. Por qué esta solución

Se reutiliza recordedCount, que solo aumenta después de resolver onSave. No se agregan estados ni se modifican guardado, cola, permisos, prioridades, envíos ni persistencia. Solo cambia un mensaje condicionado al resultado real y se protege con las pruebas existentes.

## 4. Cómo se verificó

* Antes: dos aserciones nuevas fallan por el texto incorrecto. Log `/tmp/evp66-cierre-red.log`.
* Después: suite completa190/190 aprobadas. `/tmp/evp66-cierre-tests.log`.
* Lint de componente y pruebas aprobado sin salida. `/tmp/evp66-cierre-lint.log`.
* Build webpack con NEXT_PUBLIC_DATA_MODE=mock aprobado con TypeScript. `/tmp/evp66-cierre-build.log`.
* Navegador local sobre build de producción: saltar dos contactos muestra0 seguimientos/2 saltados/2 pendientes y declara que no se guardaron seguimientos. A320 con Grande no hay recorte horizontal; captura despejada revisada. No se guardaron resultados ni se enviaron mensajes. Servidor temporal detenido.
* Caso positivo de guardado/negativo de fallo/cancelación comprobados por pruebas del componente con persistencia controlada; no se produjo una escritura remota para demostrar el mensaje.
* Evidencia fuera de Git: cierre-meta/evp66-cierre-honesto-local-320.png; antecedente remoto cierre-meta/evp66-cierre-sin-resultados-antes.png.

## 5. Pendientes y riesgos

Álvaro autorizó commit, push, PR y, si CI aprueba, merge y despliegue exclusivamente en staging el27/10/2026. La prueba remota queda pendiente de integrar este seguimiento. Producción fuera de alcance.

La auditoría encontró una discrepancia independiente: Jira todavía pide apertura automática una vez al día, pero la revisión de conformidad25/10 y commit06b4912 establecen apertura manual. No se restauró el popup ni se reescribió el criterio; comentario10202 solicita conciliación de Producto. La prueba aislada de claimDayGuide no demuestra autoapertura real del componente. No se certifica todo EVP-66 ni el objetivo global de usabilidad.
