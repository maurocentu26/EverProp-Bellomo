# Investigación de mercado y evidencia — Eversys AI SaaS

Fecha de consulta: **2026-09-29**. Responsable: agente de producto/mercado. Alcance: fuentes primarias públicas; no se abrieron cuentas, probaron productos ni contrataron servicios. No es ranking de ventas ni auditoría de arquitecturas privadas. La fecha de consulta no es necesariamente fecha de publicación ni garantía contractual de vigencia.

## Conclusión para decidir

La referencia funcional adecuada es atención comercial con bandeja compartida, conocimiento, herramientas y transferencia humana. Darwin y respond.io son comparables por recorrido comercial; Intercom aporta ingeniería publicada de RAG y atención; Glean aporta recuperación con permisos; Chatwoot permite evaluar una base abierta. Esta selección no demuestra que sean las empresas de mayor rentabilidad ni que un algoritmo explique su éxito.

La oportunidad propuesta para Eversys es especialización inmobiliaria verificable: inventario vigente, moneda explícita, interés persistido, solicitud de visita distinta de confirmación, y contexto transferido al asesor. La disposición a pagar y el ahorro efectivo todavía requieren entrevistas/piloto; no hay evidencia de mercado local suficiente para estimar TAM o prometer conversiones.

La captura muestra la cuenta `darwinai.es`. **No se verificó su relación corporativa con getdarwin.ai**. Este documento utiliza getdarwin.ai como referencia funcional independiente, sin afirmar que corresponda al anuncio.

## Matriz competitiva

| Producto | Capacidad acreditada y tipo de evidencia | Nativo / intermediado | Lectura para Eversys y límite |
|---|---|---|---|
| Darwin AI | Sitio inmobiliario promociona calificación e integración CRM/canales; documentación describe pausa, intervención y reanudación IA; API pública documentada. Comercial + funcionalidad documentada [D1–D4]. | Intervención pertenece al producto. Albato media una familia de automatizaciones; no presentar todo su catálogo como conectores nativos Darwin. | Copiar el recorrido comercial, no identidad ni promesas de conversión. Modelo, vector DB, estrategia RAG, colas y aislamiento internos no verificados. |
| Intercom Fin | Publica un flujo de refinamiento de consulta, recuperación de contenido/datos/acciones, generación, validación y escalamiento. Arquitectura publicada por proveedor [I1]. | Motor y helpdesk propios; acciones alcanzan sistemas externos. No se auditó cada conector. | Referencia para separar recuperación, acciones y evaluación. Publicación no certifica ausencia de alucinaciones. |
| Glean | Conectores normalizan contenido/permisos; recuperación indexada, en vivo o combinada; herramientas habilitadas para acciones. Arquitectura publicada [G1]. | Catálogo distingue conectores nativos, partners y personalizados. | Aprender aislamiento y frescura. Su Knowledge Graph no acredita implementación del algoritmo Microsoft GraphRAG. No es sustituto directo de bandeja comercial B2C. |
| respond.io | Bandeja, agentes IA, workflows, API y canales documentados en oferta; catálogo separa canales y herramientas [R1–R2]. Comercial/funcional. | Canales listados incluyen WhatsApp, Instagram, Messenger. Zapier, Make y n8n son mediadores externos. Compartir link de Calendly no implica agendar por API. | Referencia de omnicanal y costo por contacto activo. Arquitectura interna RAG y mecanismo de aislamiento no divulgados en fuentes revisadas. |
| Chatwoot | Bandeja y canales en oferta cloud; repositorio permite revisar licencia. Alternativa autohospedada con CE y planes pagos [C1–C5]. | Canales son integraciones del producto; redes y proveedores conservan requisitos propios. CE no incluye todas las prestaciones de planes comerciales. | Evaluar como adaptador de bandeja, sin convertir su modelo de cuenta en autoridad automática sobre tenants Eversys. Requiere operación y adaptación propias. |

## Tarifas comprobadas y unidades

Precios publicados en USD; no son cotizaciones, no incluyen estimación de impuestos argentinos/cambio ni toda integración. Revalidar condiciones al comprar. Un contacto activo, un outcome, una conversación y un asiento son unidades distintas.

| Producto | Vista observada | Exclusiones / incertidumbre |
|---|---|---|
| Darwin | No se obtuvo tarifa utilizable; `/pricing` no pudo recuperarse [D5]. | Mantener variable `P_Darwin`, no inferir precio por sesión. |
| Intercom | Desde USD 0,99 por outcome Fin; asientos Essential 29, Advanced 85, Expert 132 por mes en vista de tarifas [I2]. | Página ofrece ciclo anual/mensual; validar selección y compromiso en cotización. WhatsApp, SMS, campañas y teléfono tienen consumo adicional. Outcome no equivale a visita comercial. |
| Glean | Sin precio comprobado en fuentes revisadas. | Cotización y derechos contractuales pendientes. |
| respond.io | Vista anual: Starter 79/mes (948/año), Growth 159/mes (1.908/año), Advanced 279/mes (3.348/año) [R1]. | Growth/Advanced comienzan con 1.000 MAC; WhatsApp se paga aparte. Sobreconsumo MAC publicado: USD 12/100 Growth, USD 15/100 Advanced. IA tiene créditos y sobreconsumo, no presupuestar IA ilimitada. |
| Chatwoot cloud | Startups USD 19, Business USD 39, Enterprise USD 99 por agente/mes [C1]. | Verificar ciclo/fair use y créditos IA. No usar cloud como si fuera licencia de reventa. |
| Chatwoot self-hosted | CE USD 0; Premium Support USD 19 y Enterprise USD 99 por agente/mes [C2]. | Hosting, operación y consumo propio no desaparecen. CE no incluye Captain AI, custom branding, roles avanzados/SSO de la tabla comercial. |

Ejemplo meramente aritmético: 5 asientos Intercom Essential y 1.000 outcomes a tarifa inicial => `5×29 + 1.000×0,99 = USD 1.135/mes`, antes de canales y extras. Cinco asientos Chatwoot Cloud Business => USD 195/mes antes de extras. No son ofertas equivalentes ni demuestran TCO menor que desarrollo propio.

## Licencias, reventa y marca

**Chatwoot:** el LICENSE raíz exceptúa `enterprise/` y componentes de terceros; el resto está bajo MIT, con conservación de avisos [C3]. La licencia Enterprise requiere acuerdo/suscripción válida para producción y restringe redistribución/reventa [C4]. Los términos de suscripción incluyen restricciones a service bureau y reventa en §2.1 [C5]. La función comercial “custom branding” no equivale a autorización de reventa. Una implementación CE modificada exige inventario de archivos/licencias y avisos; no habilitar módulos Enterprise por quitar verificaciones. Para distribuir una versión, fijar commit y revisar sus licencias, no depender de la rama mutable `develop`. Marcas y activos requieren revisión separada.

**respond.io:** existe programa publicado de partners/resellers [R3]; ello no acredita derecho general de white-label ni sus términos particulares. Evaluar contrato de partner antes de comprometer reventa.

**Darwin, Intercom y Glean:** no se verificó una licencia pública que permita rebrandear y revender su software como plataforma Eversys. Tener API o multiworkspace no concede esos derechos. Pueden evaluarse como proveedores conectados o software contratado por el cliente, sujetos a sus contratos. Esta investigación delimita dependencias contractuales; no sustituye revisión legal del acuerdo concreto.

## Construir, comprar o integrar

| Ruta | Cuándo encaja | Costo de cambio y dependencia | Recomendación |
|---|---|---|---|
| Comprar SaaS comercial para Bellomo | Prioridad absoluta: comenzar atención con menor desarrollo propio. | Suscripción, unidades de consumo, exportación, funciones y contrato del proveedor. No crea automáticamente un SaaS propio. | Benchmark del piloto y alternativa si la capacidad de implementación es insuficiente. |
| Chatwoot CE + servicios Eversys | Se necesita bandeja madura temprano y hay capacidad para operar otro stack. | Integración, upgrades, divergencia del fork, seguridad y capacidades faltantes. | Spike acotado antes de elegir; no incorporar Enterprise sin derechos específicos. |
| Núcleo propio modular integrado a EverProp | Se busca producto Eversys con control de tenants, economía e inmobiliario. | Más trabajo inicial en bandeja y canales; aprovecha dominio existente si autorización está saneada. | Ruta estratégica propuesta. Piloto chat web + WhatsApp por decisión de Alvaro, herramientas limitadas y un coordinador, condicionado al alta del canal y techo operativo USD 150/mes. Selección final condicionada a inspección del repo en architecture.md. |

Ventaja defendible propuesta: integración profunda y verificable con operaciones inmobiliarias, onboarding repetible y trazabilidad. “Tenemos IA” o número de agentes no constituyen diferenciación demostrada. Validar con entrevistas a 5–8 inmobiliarias y piloto: tiempo del asesor, leads completos, visitas confirmadas, correcciones humanas, retención y costo operativo.

## Registro de fuentes

Todas consultadas el 2026-09-29. `F` funcionalidad documentada, `A` arquitectura publicada, `C` descripción comercial, `L` licencia/términos, `N` no verificado. Inferencias y recomendaciones pertenecen al equipo, no al proveedor.

| ID | URL primaria | Tipo / evidencia y fecha publicada cuando visible |
|---|---|---|
| D1 | https://www.getdarwin.ai/es/soluciones/inmobiliario | C. Casos inmobiliarios; cifras promocionales excluidas de proyecciones. |
| D2 | https://help.getdarwin.ai/en/articles/11160566-how-does-human-intervention-works-in-darwin-ai | F. Pausa/manual/reanudación, incluido manejo de pendientes; publicada 2025-10-15. No explica carreras concurrentes internas. |
| D3 | https://help.getdarwin.ai/en/articles/13485666-how-to-create-integrations-using-albato | F. Integración mediada; publicada 2026-01-23; artículo contiene indicación de acceso beta. |
| D4 | https://api.getdarwin.ai/ | F. Documentación pública API. No se ejecutaron llamadas autenticadas. |
| D5 | https://www.getdarwin.ai/pricing | N. Falló recuperación; no se concluye que no exista precio público. |
| I1 | https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine | A. Flujo RAG/validación/escalamiento; fecha mostrada 2026-05-14. |
| I2 | https://www.intercom.com/pricing | C. Asientos y outcomes; tarifa y unidad observadas. |
| G1 | https://docs.glean.com/connectors/connectors-power-glean | A/F. Índice, permisos, live retrieval y herramientas; actualización mostrada 2026-09-29. |
| R1 | https://respond.io/pricing | C/F. Planes, MAC, créditos y exclusión de tasas WhatsApp. |
| R2 | https://respond.io/integrations | C/F. Catálogo de canales e integraciones; no auditado individualmente. |
| R3 | https://respond.io/reseller | C. Programa de partners; contrato y white-label pendientes. |
| C1 | https://www.chatwoot.com/pricing | C/F. Planes cloud, canales y prestaciones por plan. |
| C2 | https://www.chatwoot.com/pricing/self-hosted-plans | C/F. CE versus planes autohospedados pagos. |
| C3 | https://raw.githubusercontent.com/chatwoot/chatwoot/develop/LICENSE | L. MIT con excepciones explícitas; rama mutable observada. |
| C4 | https://raw.githubusercontent.com/chatwoot/chatwoot/develop/enterprise/LICENSE | L. Condiciones Enterprise separadas. |
| C5 | https://www.chatwoot.com/terms-of-service/ | L. Términos FOSS y suscripción diferenciados; §2.1 relevante a reventa. |

## Desconocidos y próximas comprobaciones

| ID | Pregunta pendiente | Dueño / criterio de cierre |
|---|---|---|
| M01 | ¿La cuenta del anuncio pertenece a getdarwin.ai? | Producto: vínculo oficial verificable. No bloquea diseño independiente. |
| M02 | ¿Qué volumen corresponde a web y WhatsApp? Ambos están decididos para el piloto. | Producto: métricas anonimizadas por canal, horarios y volumen para fijar cuotas bajo USD 150/mes. |
| M03 | ¿Qué SaaS permitiría reventa/white-label bajo contrato? | Comercial/legal: texto firmado aplicable, costos y exportación. No asumir por material comercial. |
| M04 | ¿Chatwoot CE acelera frente a construir bandeja mínima? | Arquitectura: spike sintético de handoff, webhook y aislamiento; inventario de licencias del commit. |
| M05 | ¿Qué disponibilidad y moneda puede divulgar el asistente? | Bellomo/backend: política versionada y API autorizada. |
| M06 | ¿Qué tasas y requisitos Meta aplican al país/cuenta/versión? | Integraciones: documentación directa Meta y checklist de alta; ver evaluación de canales en entregable de seguridad. Las ofertas de intermediarios no sustituyen esa verificación. |
| M07 | ¿Cuál es el precio aceptable por tenant? | Producto/FinOps: entrevistas y costo real del piloto; propuesta comercial inicial es hipótesis. |

No hubo benchmark de productos ni validación independiente de resultados comerciales. Los diseños internos no publicados permanecen desconocidos. La investigación sustenta patrones, riesgos y alternativas; la preparación para producción depende de los gates técnicos del proyecto.

## Actualización de decisión de Alvaro: piloto web + WhatsApp, techo USD 150/mes

Ambos canales forman parte del piloto. El techo operativo declarado es **USD 150 mensuales para el piloto completo**, no USD 150 por proveedor; todavía debe precisarse si incluye impuestos y soporte humano. Adoptar prudencialmente presupuesto total de servicios y consumo, con reserva, sin asumir que financia desarrollo, onboarding ni remuneración del equipo. No se contrataron servicios.

| Alternativa | Encaje dentro del techo con tarifas antes verificadas | Decisión de investigación |
|---|---|---|
| respond.io Growth | USD 159/mes con facturación anual ya supera USD 150, antes de WhatsApp y extras. | Descartar como base del piloto bajo este techo. Starter79 no acredita agentes autónomos incluidos; agregar desarrollo IA externo cambia alcance/costo. |
| Intercom Essential | 2 asientos serían USD 58/mes; deja USD 92 antes de canales/extras, equivalentes a aproximadamente92 outcomes a USD 0,99 si no hubiera ningún otro costo. | Encaje muy limitado; no vender como piloto de consumo amplio por 150. El ciclo y precio contratado siguen sujetos a validación. |
| Chatwoot Cloud Startups | 2 asientos serían USD 38/mes; quedarían USD 112 para IA, WhatsApp e integraciones. | Puede servir como software de Bellomo sujeto a funciones/consumo y contrato; no acredita producto SaaS white-label Eversys ni incluye backend propio. |
| Chatwoot CE autohospedado | Licencia CE USD 0; infraestructura, IA, WhatsApp y operación son costos adicionales. | Candidato solo si evita trabajo neto; requiere spike y licencias. No sumar módulos pagos sin presupuesto/derechos. |
| Núcleo Eversys propio | No hay suscripción de bandeja comercial, pero sí cómputo, almacenamiento, IA, backups, observabilidad y Meta. | Preferencia condicionada a escenario económico completo con topes y volumen reducido. USD 150 es restricción de operación, no precio de implementación. |
| Darwin / Glean | No hay tarifa pública utilizable verificada aquí. | No afirmar encaje; mantener fuera del presupuesto comprometido hasta cotización autorizada. |

La restricción de gasto debe limitar número de conversaciones, pasos/tokens y mensajes facturables; alertar antes del techo y degradar a atención humana o respuesta estática cuando sea necesario. Derivar a humanos tampoco vuelve gratuitos los envíos de canal. Evitar compromisos anuales para aparentar un desembolso mensual pequeño: un valor equivalente mensual no es el cargo mensual efectivo.

Se actualiza M02: ambos canales ya están decididos para el piloto; las métricas de volumen y distribución siguen pendientes para fijar cuotas. El alta de WhatsApp, permisos y propiedad de cuenta/número continúan siendo dependencias externas. La aprobación de alcance no autoriza contratar, enviar mensajes ni desplegar en esta fase.

