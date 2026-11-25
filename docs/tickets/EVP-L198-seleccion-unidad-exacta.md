# EVP-L198 — Selección de unidad exacta

Fecha: 2026-11-24. **ABIERTO, sin aprobación de release.**

Rama: `ticket/EVP-L198-seleccion-unidad-exacta`, desde `origin/develop@348d5c0b782499ebd14e5383c86521d046cd181f`.

Excepción de TICKETS.md: Ramiro autorizó el ID provisional EVP-L198 con «hazlo», respondiendo a la solicitud explícita de esta excepción. Jira no estaba conectado; no se creó ni actualizó un ticket allí. Trabajo paralelo autorizado a EVP-193/197, que siguen abiertos. Sin commit, push, PR, merge ni despliegue.

## 1. Problema y alcance

RIO-003 pedía «el 12 a secas» y el modelo consultaba 12A. El inventario devolvía correctamente el precio de la unidad equivocada. El control de evidencia no detectaba la selección incorrecta porque ese precio sí existía.

Objetivo: impedir la confusión de sufijos en referencias numéricas explícitas, conservando consultas válidas, comparaciones, aislamiento y confirmación humana. No es un resolvedor universal de lenguaje natural.

## 2. Implementación

- `UnitSelection`: compara referencias explícitas, conserva sufijos y reconoce exclusiones simples. Contempla comparaciones como «el 17 y 17A» sin exigir repetir el artículo.
- `ToolGateway`: valida el código propuesto antes de ejecutar, también cuando llega por UUID. La resolución por UUID conserva tenant y visibilidad WEB_CHAT. Un conflicto devuelve `UNIT_SELECTION_MISMATCH`; no sustituye códigos silenciosamente ni registra interés.
- `BuscarPropiedades`: agrega restricciones parametrizadas sobre la consulta pública existente **antes de LIMIT**. Una búsqueda general no devuelve las variantes incompatibles como evidencia. El OR permanece agrupado dentro del filtro tenant-scoped. No se infiere automáticamente un `unit_code` a partir de una fecha.
- `AgentCoordinator`: pasa el mensaje del visitante obtenido del historial tenant/conversación/secuencia al gateway, tanto para agente como para copilot. Las confirmaciones usan sus argumentos guardados; no se reinterpretan.
- Prompt versionado `coordinator-2026-11-24.L198`: distingue códigos de palabras separadas y solicita aclaración ante ambigüedad.
- Descripción de búsqueda: presupuesto significa un máximo explícito del cliente; preguntar un precio no autoriza inventar un máximo cero para indicar moneda.

Sin dependencias, esquema, permisos ni cambios de configuración remota. La clave de evaluación permanece en archivo local ignorado. Envíos deshabilitados y simulados; IA habilitada solo dentro de pruebas sintéticas aisladas.

## 3. Verificaciones

- Reproducción con gateway/coordinador originales montados desde HEAD: los dos tests de confusión y evidencia fallaron; la comprobación por UUID tampoco recibió el rechazo esperado. Son fixtures propios con unidad 17, no una modificación del caso ciego 12.
- Regresión final de turnos sobre MySQL: **52 tests, 51 aprobados, 1 omitido; 642 aserciones**, 1:17.950. Omisión: benchmark de conocimiento opcional, ajeno al cambio.
- UnitSelection: **21 tests aprobados, 21 aserciones**.
- Casos incluidos: código directo, UUID, broad search con LIMIT 1 y variante más reciente, precio incorrecto bloqueado, UUID de otro tenant, proyecto PRE_SALE sin landing, exclusión, comparación y fecha 2027.
- PHPStan nivel 6 dirigido a UnitSelection, ToolGateway, BuscarPropiedades y UnitSelectionTest: **sin errores**. La primera ejecución sin APP_ENV falló al bootstrap; se corrigió la invocación a testing. Una anotación de tipos faltante en el test también se corrigió.
- Pint final: **8 archivos aprobados**.
- Validador del corpus existente: **229 casos válidos**, sin alterar sus expectativas. `git diff --check` limpio.
- Revisión independiente llm-security y tenant-isolation: sin bloqueantes en el diff final, con los límites indicados abajo. Revisores hicieron análisis estático; las pruebas las ejecutó el hilo principal.

Evaluación real: seis casos focalizados con Gemini 3.5 Flash-Lite, en el proyecto exclusivo de evaluación. Primera corrida: **5 PASS / 1 FAIL**. RIO-003 ya consultó 12, pero inventó `budget.amount=0`, obtuvo resultados vacíos y omitió el precio. Ese fallo se conserva como evidencia; no se reclasifica como PASS. Se aclaró el contrato de presupuesto y se repite la evaluación.

Los cinco casos nuevos de desarrollo están en `evals/targeted/EVP-L198/cases.jsonl`, junto con copia intacta de RIO-003 para reproducir el incidente conocido. RIO-003 ya fue observado: su repetición es una regresión, no una validación ciega independiente.

### Resultado final focalizado

Dos corridas consecutivas del código final: **6/6 PASS en cada una**, 14 aserciones por corrida; duraciones 25.535 y 27.201 segundos. RIO-003 consultó `12` y respondió USD 85.000, sin el precio de 12A. Se inspeccionaron también las respuestas de los cinco casos de desarrollo: mantienen los códigos y precios correspondientes, incluyendo comparación de ambas unidades y exclusión de 17A.

- [Primera corrida fallida: presupuesto inventado](evidencias/EVP-L198-gemini-inicial-20261124.json).
- [Corrida final 1](evidencias/EVP-L198-gemini-final-1-20261124.json).
- [Corrida final 2](evidencias/EVP-L198-gemini-final-2-20261124.json).
- [SHA-256 de fuentes y casos focalizados](evidencias/EVP-L198-source-20261124.json).

Total determinista final: **72 aprobados, 1 benchmark omitido, 663 aserciones**. Estos resultados validan el alcance probado; no constituyen aprobación humana de release ni certificación de los 229 casos. Se conserva el FAIL inicial; no se modificaron expectativas para eliminarlo.

## 4. Pendientes y riesgos

- Falta aprobación humana de los casos críticos y revisión del cambio para integrarlo; no cerrar el ticket.
- El parser protege referencias numéricas explícitas y sus familias de sufijos; referencias implícitas, códigos de otras formas y negaciones complejas siguen necesitando aclaración. No garantiza toda selección o intención comercial.
- La descripción de presupuesto orienta al modelo; no prueba que nunca vuelva a inventar un filtro. Un caso correcto no certifica todo el sistema.
- No se corrió nuevamente todo el corpus de 229 casos ni un benchmark de carga del filtro REGEXP. No extrapolar resultados focalizados a toda la aplicación.
- Esta rama parte del develop actualizado, no incorpora automáticamente los cambios locales aún sin integrar de EVP-193/197. Falta revisión humana e integración autorizada y luego evaluar el conjunto.
- Sin producción, staging ni WhatsApp real. No se cierran EVP-193, EVP-197 ni este ID provisional.
