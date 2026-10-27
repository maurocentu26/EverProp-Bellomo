# EVP-86 — WhatsApp sandbox y validación automática

Continuación: rama `ticket/EVP-86-automated-validation`, base develop `70ff6fc`, 2026-10-26. Álvaro con Codex. Commit, push y PR autorizados por Álvaro para revisión; sin merge ni despliegue de esta continuación.

## 1. Pedido y resultado esperado

Configurar tres destinatarios sandbox y validar respuestas en staging. PR77 y PR78 ya están integrados y desplegados. Los tres destinatarios recibieron pruebas de bandeja; Álvaro confirmó también una respuesta automática Gemini. Se observó Google HTTP503 seguido de HTTP200; el aviso de derivación también llegó.

Álvaro pidió continuar las pruebas manuales solo con su número y automatizar lo que no necesita teléfonos. Esta continuación agrega validación de colas, aislamiento, fallos, idempotencia y un reporte agregado. No exige nueva participación de Mauro/Ramiro.

## 2. Implementación

Ya desplegado:

- PR77: lista explícita META_WHATSAPP_SANDBOX_RECIPIENTS. Solo el Phone Number ID sandbox y texto libre usan la excepción. Valida 549 más diez dígitos y deriva el mismo número sin el 9 móvil; el par legacy conserva prioridad y validación. No cambia identidades persistidas ni destinatarios ajenos.
- PR78: ProductionCheck valida el binding real LlmClient y conserva gates de Gemini staging, credenciales, tarifas y presupuesto. No permite Gemini en producción.
- Staging: API/worker con IA global, Gemini y lista de tres; tenant ficticio en respuestas automáticas. Secretos cifrados y fuera del informe.

Nuevo en esta rama:

- WhatsAppGeminiFlowTest.php: cinco pruebas del webhook firmado → receipt durable → cola MySQL → Gemini → outbox → estados Meta. Verifica tool roundtrip/thoughtSignature, retry503, duplicados, estados fuera de orden, fallo persistente/handoff, reservas UNKNOWN, contención Redis, entrega incierta sin reenvío y ráfaga de 50 chats entre dos tenants.
- WhatsAppParallelQueueTest.php: 200 chats sintéticos con duplicados y dos tenants; cuatro procesos PHP independientes sobre MySQL/Redis, al menos dos deben consumir. Verifica una respuesta correcta por chat y cero jobs fallidos. Gemini/Meta simulados y tráfico externo bloqueado en cada hijo. Antes de fixtures, el padre exige testing y DB bellomo_crm_test o bellomo_crm_evpNN_qa; los hijos exigen testing y la misma DB. Finally detiene hijos y limpia script temporal, cola y tenants propios.
- ConversationKpis.php: agrega automatic al comando existente: turnos, estados, errores, entrega actual de respuestas generadas y costo estimado. Tenant y fechas filtran runs y mensajes; excluye suggest:. Sin textos, teléfonos, payloads ni secretos.
- ConversationKpisTest.php y las pruebas de flujo verifican JSON vacío, filtros de tenant/fechas/copiloto y generación frente a entrega.

Sin dependencias, esquema, flags adicionales ni cambios al comportamiento del runtime.

## 3. Motivo y límites

Se reutilizan PHPUnit/Laravel, ConversationTestSupport, adaptador Gemini, ledger, coordinador, transportes, MySQL/Redis y Symfony Process instalados. El workflow .github/workflows/api.yml descubre los tests automáticamente una vez publicado el cambio. No necesita una automatización programada adicional.

Los proveedores simulados hacen la regresión determinista y sin consumo de cuota ni mensajes a personas. Los procesos y el almacenamiento del ensayo paralelo son reales; los límites y latencias de Google/Meta no están simulados como evidencia de producción.

## 4. Verificación y repetición

Docker PHP8.4/MySQL8.4/Redis, copia /tmp/evp80 en el contenedor existente. DB dedicada bellomo_crm_evp86_qa creada con baseline SHA256 canónico 4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D verificado y todos los forwards en orden. No se modificaron bases existentes ni se inició/detuvo otro stack. everprop:schema:verify pasó.

- TDD reporte: primero falló por ausencia de automatic, luego pasó.
- Flujos nuevos y KPI: 7 tests /344 aserciones antes de añadir el paralelo.
- Paralelo inicial: 1 test /1014 aserciones, 16,73 s; luego se incorporaron guarda previa del padre y canales aleatorios sugeridos en revisión.
- Regresión final AgentRuntime + Conversations + Integrations + ProductionEnvironment: **259 tests /3088 aserciones, 34,47 s**, todos aprobados.
- Pint: cuatro PHP aprobados. PHPStan global: sin errores. Dataset: 202 casos válidos. git diff --check aprobado.
- Negativo de seguridad adicional: DB ficticia no permitida rechazada antes de fixtures/acceso SQL.
- Revisiones independientes de aislamiento e IA: sin bloqueos pendientes; la guarda previa a fixtures quedó corregida. Los revisores no ejecutaron tests; los resultados anteriores fueron ejecutados por Codex.
- Primera regresión amplia sobre la DB local antigua: 13 fallos por project_landing ausente. Se repitió en QA completa y pasó; no se ocultó ni parcheó el fallo en tests.

Desde everprop-api/, dentro del PHP de un entorno de tests con MySQL/Redis preparado:

```sh
php artisan test --filter='WhatsApp(GeminiFlow|ParallelQueue)Test'
php artisan test tests/Feature/AgentRuntime tests/Feature/Conversations tests/Feature/Integrations tests/Feature/ProductionEnvironmentTest.php --log-junit=storage/logs/conversations-junit.xml
```

El segundo comando produce JUnit para CI. Reporte de operación de solo lectura, después de desplegar esta continuación:

```sh
php artisan everprop:conversations:kpis --tenant=bellomito-staging --from=2026-10-26 --to=2026-10-28
```

Rango [from,to) UTC; el ejemplo cubre la prueba nocturna local. Entrega muestra el estado al ejecutar el reporte. Generación exitosa no equivale a entrega ni recepción humana. estimated_cost_usd suma estimaciones de runs, excluye reservas UNKNOWN y no es facturación definitiva ni máximo comprometido. El ledger mantiene reservas y límites.

## 5. Pendientes y riesgos

- Continuación preparada para revisión mediante PR autorizado. Merge y deploy requieren una autorización posterior según CLAUDE.md. Las pruebas reales anteriores y esta regresión son evidencias distintas.
- Paralelo requiere procesos PHP/MySQL/Redis y una DB de tests aislada por ejecución. Timeout60s puede señalar runner lento; finally mantiene limpieza.
- 200 chats locales con procesos concurrentes y proveedores simulados no certifican mil usuarios simultáneos, capacidad de Railway ni cuotas/latencia de Meta/Gemini. Un ensayo de carga del destino requiere límites y medición propios.
- El 503 de Gemini puede reaparecer: se verifica retry acotado y handoff, sin cambiar disponibilidad de Google ni añadir reintentos ilimitados. El token temporal de WhatsApp requiere renovación al vencer.
- Producción, adjuntos y storage fuera de alcance. Antes de producción faltan verificar dominios/CORS/Sanctum/cookies/tenant_domains, schema_versions/forwards, credenciales/permisos, DB y storage.
