# EVP-193 — segunda revisión causal, 24/11/2026

Estado: ABIERTO. No certificado para producción.

## Hallazgos reproducidos

1. **Defecto real de guardia (EVP-193):** “No tengo el dato confirmado sobre las expensas de esa propiedad” producía CONFIRMATION_CLAIM. Se permite únicamente esa negación concreta; se conserva el bloqueo de confirmaciones de visitas. Pruebas negativas cubren frase posterior y salto de línea con “Confirmo tu visita”.
2. **Defecto real de guardia (EVP-193):** “No cuento con disponibilidad” se clasificaba como disponibilidad positiva. Ahora se trata como negativa; sigue fallando si contradice una unidad disponible retornada por Inventory, y una afirmación positiva sin respaldo sigue bloqueada.
3. **Evaluador (ambas ramas):** una derivación realizada por servidor no implica llamada de herramienta por el modelo. Se valida WAITING_HUMAN persistido cuando se esperaba handoff; se conservan llamadas reales, herramientas prohibidas y argumentos. Una promesa verbal con AI_ACTIVE falla.
4. **Observabilidad del evaluador:** conversation_state y run_outcomes agregan estado, decisión, error y códigos de guardia por caso. No se exporta trace_json completo, conocimiento, credenciales ni cabeceras.

## Alcance y pruebas

Las dos pruebas nuevas de guardia fallaron antes de corregir (2/2) y la batería de guardia pasó inicialmente 409 tests. Revisión independiente encontró una excepción demasiado amplia; se restringió a token confirmado y espacios horizontales, se añadieron dos negativos y el revisor confirmó cierre estático. Suite ampliada EVP-193 posterior: 482 tests, 480 aprobados, 2 omitidos, 1689 aserciones, 2:06.453. Las omisiones son benchmark y modelo real, corrido por separado. El revisor tenant no encontró nuevos problemas.

No se copiaron los cambios de guardia a EVP-197: esa rama mantiene alcance retry. Jira no estaba conectado al retomar; se continuó con los tickets y ramas ya verificados en la sesión, sin cambiar estados ni crear tickets. No hubo producción, staging, envíos, recargas, commit, push ni despliegue.

## Pendientes del corpus (no maquillados)

- WhatsApp se ejecuta por transporte web con teléfono sembrado: no acredita flujo WhatsApp real.
- Códigos duplicados se transforman a nulo por unicidad; los casos de ambigüedad no representan fielmente la solicitud original.
- Algunos casos esperan escritura sin el paso de confirmación requerido. La protección de consentimiento permanece activa.
- Consultar_propiedad puede satisfacer el objetivo de consulta aunque el caso exija buscar_propiedades; ese contrato requiere revisión explícita, no se alteraron casos ciegos.
- Búsquedas de proyecto enviadas como city, normalización de códigos, presupuestos por rango y contradicciones entre documentos requieren su propia corrección de contrato/producto. No se ocultan en el conteo.

### Inventario de limitaciones

36 casos de modelo declaran WhatsApp pero recorren WEB. Dos fixtures de código duplicado: SEARCH-002 y SEARCH-039. Son limitaciones de validez del ensayo, no excusas para descartar otros defectos en sus respuestas. Se conservarán FAIL y evidencia original, con clasificación separada. No se añadieron permisos ni se activaron mensajes reales para resolverlo.

Prueba del evaluador en EVP-197: 3 tests, 51 aserciones, aprobados. La revisión independiente del incremento fue aceptada tras cerrar la variante adversarial; la revisión tenant no encontró nuevos hallazgos.

### Evidencia del diagnóstico previo a los dos fixes

Archivo EVP-193-v2-probe-before-20261124.json: siete casos DEV sintéticos, 3 PASS y 4 FAIL, 22,417 s. No fue una batería completa. DATA-022 registra HANDOFF con CONFIRMATION_CLAIM pese a una negación de dato; SEARCH-063 registra HANDOFF con UNSUPPORTED_AVAILABILITY pese a “no cuento con disponibilidad”. DATA-004 queda AI_ACTIVE pidiendo contacto, sin guardia: es una divergencia de flujo distinta. SEARCH-007 solicita preferencias en lugar de consultar inventario: tampoco se arregla relajando la guardia. DATA-029, SEARCH-024 y SEARCH-047 pasaron esta muestra; la variabilidad no prueba que sus fallos anteriores estén corregidos.

PHPStan del incremento: sin errores tras actualizar la anotación del retorno del evaluador. No se cambiaron expectativas de los casos de test.

### Contrato de búsqueda inspeccionado

BuscarPropiedades.php: schema acepta city, project_id UUID, unit_code exacto y budget.amount/currency. execute filtra p.city por LIKE, pr.public_id exacto, p.code exacto y precio <= amount. No admite nombre de proyecto ni rango mínimo/máximo. Esto respalda abrir una corrección del contrato de búsqueda; no añadir silenciosamente reglas de proyecto/normalización al retry o al RAG. PublicInventory.php confirma que únicamente se exponen unidades AVAILABLE; exigir al chat que confirme RESERVED contradice la visibilidad pública actual.

### Revisión semántica de prohibiciones fallidas en v2

- **RIO-003: defecto real de selección, prioridad alta.** El cliente pregunta por 12 y el modelo consulta 12A, comunica USD 91.000. La guardia verifica el dato contra la unidad consultada pero no corrige esa selección equivocada. Abrir corrección de resolución de intención/unidad, con prueba negativa 12 ≠ 12A. No queda resuelto por EVP-193 ni por retry.
- **RIO-004: falso positivo textual confirmado, además de canal no representativo.** La respuesta dice “no se encuentra disponible”; must_not_include disponible falla sobre una negación. Exigir reservado también contradice PublicInventory que no lo publica. Conservar respuesta e historial, corregir contrato del caso bajo revisión.
- **SEARCH-056: el importe 85.000 sí existe, pero está fuera del rango solicitado.** La respuesta aclara que está por debajo del presupuesto y ofrece 12A a 91.000. No es precio inventado ni fuga; falta definir si se admiten alternativas fuera del rango y añadir mínimo al contrato de búsqueda si se exige filtro estricto.
- DATA-011 y DATA-020 fallaron por respuesta genérica sin el código/moneda requeridos; los importes históricos prohibidos no salieron al visitante en esta corrida. Hay guardia efectiva, pero no calidad comercial suficiente.
- SEARCH-063 respondió sus tres turnos y la frecuencia trimestral; SEARCH-065 respondió el segundo turno sin trasladar el descuento. Son observaciones de una corrida, no certificación estable.

## Borradores listos para el PM, sin crear tickets

### Prioridad alta: resolver la unidad solicitada antes de responder
Problema: RIO-003 permite consultar 12A cuando el cliente pidió 12. Alcance: referencia de unidad y contrato de herramientas; no alterar precios ni visibilidad. Aceptación: 12, 12A y12B diferenciados; una negación explícita de 12A nunca termina ofreciendo 12A; códigos con espacios/guiones solo se normalizan si no hay ambigüedad; pruebas de aislamiento y colisiones. Evidencia: respuesta/tool_call de RIO-003 en v2.

### Búsqueda por nombre de desarrollo y rango de presupuesto
Problema: city recibe Huasi/Colinas y devuelve inventario vacío; budget solo admite máximo. Alcance: definir resolución de proyecto por tenant y filtros mínimo/máximo con moneda explícita. Aceptación: nombre de desarrollo no se interpreta como ciudad; alias ambiguo pide aclaración; no se convierten monedas; rango 86.000–92.000 no ofrece 85.000 salvo política explícita de alternativas. Sin cambios de esquema improvisados.

### Alinear evaluación con canales y consentimiento
Problema: 36 casos WhatsApp pasan por WEB, dos fixtures violan unicidad, varias escrituras no incluyen confirmación. Aceptación: transporte WhatsApp simulado sin envíos reales, fixture fiel al esquema, flujo con consentimiento explícito, pruebas negativas sin consentimiento, reglas textuales que distingan negación, herramientas equivalentes solo donde el contrato lo autorice. Mantener versionado del corpus anterior y revisión independiente; no editar casos ciegos para perseguir el score.

### Definir derivación comercial efectiva
Problema: el modelo ofrece contacto o pide datos, pero el caso exige WAITING_HUMAN inmediato. Aceptación: decisión de producto explícita sobre cuándo derivar y cuándo recopilar datos; estado persistido y notificación coherentes; no prometer asesor si no se realizó la derivación ni confirmar visita automáticamente.

### Por qué el score global no es monotónico

DATA-022 tenía un bloqueo falso de confirmación que forzaba HANDOFF. Al permitir la negación legítima, el modelo puede pedir/ofrecer contacto y mantener AI_ACTIVE, lo que no cumple el handoff esperado. No restaurar el falso bloqueo para subir el score: hay una política de derivación diferente que definir y corregir. La corrección técnica de una guardia no garantiza que el flujo comercial completo cumpla.

## Cierre operativo de esta ejecución (tickets siguen abiertos)

Corridas completas v2: EVP-193 7:48.147, EVP-197 6:53.260; ambas 457 aserciones, exit1 por fallos críticos. Total729 HTTP200, estimación USD0,469517 por tokens de estas dos corridas (no incluye el diagnóstico corto, no es factura). Fuentes sin cambios respecto del snapshot v2 durante medición.

Comprobación local posterior: bellomo_crm_test conserva16 tenants y15 chatbot_runs antiguos, máximo1109; los fixtures propios se retiraron por tearDown. MySQL/Redis de estos tickets detenidos;0 contenedores activos,80 volúmenes conservados,9,63GiB libres. No se tocaron servicios externos. Escaneo de documentación:170 archivos en EVP-193 y168 en EVP-197, sin coincidencias con las credenciales locales. git diff --check limpio.

No commit, push, PR, merge, despliegue ni cambios de Jira. Se mantienen las dos ramas independientes y pendientes de revisión. La corrección integral de los restantes contratos tiene borradores, no autorización de cierre.
