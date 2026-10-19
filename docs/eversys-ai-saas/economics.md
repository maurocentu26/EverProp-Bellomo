# Economía y presupuesto de Eversys IA

Fecha consulta/cálculo: 2026-09-29. Los escenarios numéricos son USD netos, antes de impuestos/cambio y cargos no verificados; el **techo total USD 150 incorpora una reserva para esos conceptos** y debe respetarse con la factura final. Alvaro fijó USD 150/mes y ambos canales web+WhatsApp. Se interpreta como presupuesto operativo de software; trabajo humano y desarrollo separados, no gratis. Sin cuentas/proveedores contratados ni mediciones de carga; resultado de planificación, no promesa de factura o rendimiento.

## Decisión ajustada a USD 150

Piloto limitado a 500 conversaciones/mes en total entre ambos canales y promedio presupuestado de 6 turnos IA por conversación. Definición interna de conversación para cuota: sesión agrupada por contacto/canal durante 24h; no es la unidad de facturación Meta. Aplicar además límite de tokens/USD porque una conversación puede ser larga. Ajustar cupo a consumo observado; a tope, derivar a humano y conservar recepción. Sin campañas outbound, voz, vector store ni reranker de pago. No comprometer SLA comercial/HA antes de dimensionar.

| Sobre presupuestario | USD/mes máximo de planificación | Qué cubre |
|---|---:|---|
| Hosting compartido de aplicación/DB/Redis/worker/Next | 45 | Consumo de toda la pila atribuible al piloto, sujeto a carga; no presumir servicios existentes gratis |
| Modelo IA | 30 | Aproximadamente 500 conversaciones bajo mezcla/tokens piloto; corte por saldo real |
| WhatsApp/proveedor canal | 25 | Reserva, NO tarifa confirmada de Meta/BSP |
| Backups, almacenamiento adicional y observabilidad | 15 | Reserva operativa; validar restauración y costos antes de publicar |
| Contingencia, impuestos y desvíos | 35 | No disponible automáticamente para ampliar cuota IA |
| Total | 150 | Techo comprometido por el usuario |

Si el mínimo comercial del proveedor, impuestos o hosting real excede sobres, reducir volumen/renegociar proveedor o presupuesto antes de activar. No es válido fingir operación multicanal con USD 150 si las dependencias no caben. Si USD 150 debe incluir sueldo de desarrollo/soporte, este plan no demuestra viabilidad: falta financiar esos costos.

## Tarifas verificadas y supuestos separados

| Concepto | Valor usado | Tipo y fuente |
|---|---|---|
| Claude Haiku 4.5 | USD 1 entrada / USD 5 salida por millón tokens | Tarifa publicada consultada; ancla de cálculo, no modelo seleccionado por calidad [F1] |
| Claude Sonnet 4.6 | USD 3 entrada / USD 15 salida por millón tokens | Tarifa publicada; solo escenario de escalado con 10% de tokens en modelo superior [F1] |
| Railway RAM | 0.00000386 USD/GB/s | Tarifa publicada [F2] |
| Railway CPU | 0.00000772 USD/vCPU/s | Tarifa publicada [F2] |
| Railway volumen | 0.00000006 USD/GB/s | Tarifa publicada [F2] |
| Railway egress servicios | USD 0.05/GB | Tarifa publicada [F2] |
| Railway objetos | USD 0.015/GB-mes | Tarifa publicada [F2] |
| Railway Pro | USD 20 mínimo con consumo incluido | No sumar USD 20 encima de consumo que ya lo supera [F2] |
| Reranking futuro | USD 0.002 por consulta | **Supuesto**, no cotización Cohere; unidad precio a verificar [F3] |
| Embeddings futuros | USD 0.10 por millón tokens | **Supuesto**, proveedor no seleccionado |
| Canal Meta/BSP | M = suma mensajes entregados por categoría/país × tarifa + fee BSP | Tarifa exacta no obtenida; usar variable y sobre de USD 25 [F4] |
| Soporte humano | USD 25/h | **Supuesto interno**, no tarifa de mercado comprobada |

Fuentes consultadas: [F1 Pricing Claude](https://platform.claude.com/docs/en/about-claude/pricing); [F2 Railway](https://railway.com/pricing); [F3 unidades de Cohere](https://docs.cohere.com/docs/how-does-cohere-pricing-work); [F4 WhatsApp pricing](https://whatsappbusiness.com/products/platform-pricing/). No se infiere región contratada de una tarifa. Revalidar vigencia/model availability antes de comprar. Los descuentos por caché/batch no se descuentan del presupuesto base. Datos y cálculos propios siguientes.

## Fórmulas

```text
C_LLM = C * ((I * p_input + O * p_output) / 1_000_000) * (1 + r)
C_retrieval = C * q * p_rerank + E / 1_000_000 * p_embedding
C_infra = max(20, S*(RAM*0.00000386 + CPU*0.00000772 + GBvol*0.00000006)
                   + GBegress*0.05 + GBobjects*0.015)
C_software = C_LLM + C_retrieval + C_infra + observabilidad/backups + M
C_con_soporte = C_software + horas_soporte * tarifa_hora
C_tenant = C_total / N
C_conversacion = C_total / C
Precio_para_margen_g = C_tenant / (1-g)
```

S=2.592.000 segundos (30 días). I/O son tokens totales facturables sumando todas las llamadas de una conversación, incluido historial reenviado y schemas; no longitud de un mensaje. r=20% colchón de retries/resúmenes. C=conversaciones totales; N=tenants; E=tokens de ingestión/actualización mensual. CPU es uso medio facturable, no pico reservado. Cada proveedor puede medir/redondear distinto; reconciliar factura.

## Escenarios reproducibles

| Entrada mensual | Piloto restringido | Base comercial | Alto |
|---|---:|---:|---:|
| Tenants N | 1 | 10 | 50 |
| Conversaciones C | 500 | 20.000 | 150.000 |
| Turnos promedio / conversación | 6 | 8 | 10 |
| Tokens I/O por conversación | 24.000 / 1.800 | 40.000 / 3.000 | 70.000 / 5.000 |
| Mezcla tokens modelo | 100% Haiku | 90% Haiku +10% Sonnet | 90% Haiku +10% Sonnet |
| Reranks / conversación | 0 | 4 | 6 |
| Embeddings / mes | 0 | 20M | 100M |
| Documentos / chunks, hipótesis tamaño | 100 / 1.000 | 2.000 / 20.000 | 10.000 / 100.000 |
| RAM GB / CPU medio total | 2,5 / 0,25 | 24 / 6 | 96 / 24 |
| Volumen GB / egress GB / objetos GB | 20 / 10 / 5 | 200 / 300 / 200 | 1.000 / 2.000 / 2.000 |
| Observabilidad/backups reserva | 10 | 80 | 250 |
| Horas soporte atribuibles | 4 | 20 | 80 |

Piloto 2,5GB RAM es hipótesis ajustada para consolidación, no medición ni garantía de que Next+PHP+MySQL+Redis+workers soporten concurrencia. Gate obligatorio: medir memoria/CPU y restauración. No suponer que ese tamaño proporciona redundancia ni soporte 24/7. Escalado incorpora recursos de búsqueda, todavía necesita benchmark de carga; cifras no prometen capacidad.

| Salida USD/mes | Piloto | Base | Alto |
|---|---:|---:|---:|
| LLM con colchón 20% | 23,76 | 1.584,00 | 20.520,00 |
| Rerank + embeddings | 0,00 | 162,00 | 1.810,00 |
| Infra según fórmula | 33,70 | 409,29 | 1.726,26 |
| Observabilidad/backups | 10,00 | 80,00 | 250,00 |
| Software antes de canales | **67,46** | **2.235,29** | **24.306,26** |
| Soporte humano separado | 100,00 | 500,00 | 2.000,00 |
| Total con soporte, antes de canales | **167,46** | **2.735,29** | **26.306,26** |
| Software / conversación antes de canales | 0,1349 | 0,1118 | 0,1620 |
| Total con soporte / tenant antes de canales | 167,46 | 273,53 | 526,13 |

El piloto de software puede caber: 67,46 + hasta 25 de canal =92,46 antes de otros desvíos; presupuesto asigna reservas para llegar a 150. **Con cuatro horas de soporte a USD 25/h ya excede USD 150**, aun sin canales: operación humana debe financiarse aparte o aportarse por el equipo, explicitando costo económico. Desarrollo tampoco está incluido. Los escenarios base/alto son crecimiento futuro, no propuestas dentro del techo actual.

## Sensibilidad y punto de corte

- Duplicar tokens en piloto eleva IA de 23,76 a 47,52; software pasa a 91,22 antes de canales. Cabe en total solo redistribuyendo sobres, pero el límite IA 30 debe detener/derivar antes; no redistribuir sin decisión.
- Duplicar conversaciones a 1.000 produce el mismo costo IA 47,52 sin contar crecimiento infraestructura; cupo500 y límite USD 30 evitan asumirlo gratis.
- Cambiar 100% a Sonnet 4.6 multiplica tokens-modelo por 3: IA 71,28, software114,98 antes de canales. Añadir25 de canales deja 139,98 sin contingencia suficiente. No ofrecerlo en piloto sin recalcular.
- Si infraestructura real cuesta el doble de 33,70, software101,16 antes de canales. Con 25 y reservas operativas extra podría exceder techo. Benchmark manda, no el número estimado.
- Mensaje canal facturable: costo marginal desconocido p; USD 25 permite como máximo floor(25/p) mensajes, descontando fees. No confundir con 500 conversaciones o6 turnos. Un mismo cliente puede tener varios mensajes cobrados.
- Precio mínimo teórico para margen70% con soporte incluido, antes de canales: piloto 558,20/tenant; base911,76; alto1.753,75. Son cocientes de escenarios con uso distinto, **no precios de venta recomendados ni evidencia de disposición a pagar**. Debe incluir también cobro/comisiones/impuestos/onboarding y contribución a desarrollo.

## Control técnico del gasto

Entitlements por tenant para conversaciones/tokens/acciones; cap global USD 150 descontando costos fijos comprometidos, reservas de impuestos/canal y cargos pendientes. Reservar costo máximo de llamada antes de enviarla, transacción bloqueando saldo global+tenant en orden estable. Conciliar usage real por run/operación y liberar sobrante; costo UNKNOWN conserva reserva. No sumar dos veces retries/idempotencia. Alertas70/85%, corte antes de autorizar sobre100%. El corte IA no bloquea recepción ni lectura/handoff. Envíos humanos siguen sujetos a cuota/costo y reglas Meta; no asumirlos gratis. Proveedor sin control duro/factura en tiempo real requiere colchón y conciliación diaria.

Configuración piloto sugerida: 2 llamadas normales +1 retry como máximo por turno, 8k entrada/600 salida por llamada; rótulo de límite coherente con arquitectura. Volumen promedio del escenario es menor que máximos; el ledger reserva máximos. Agotamiento produce cola humana y muestra razón, no error silencioso. Costo por conversación incluye fallos, no solo éxitos.

## Comercialización y trabajo inicial

Propuesta para validar: setup separado (horas reales de integración/datos/formación) + mensualidad con canales/usuarios/cuota IA claramente definidos + excedente autorizado o bloqueo. Sin plan ilimitado. Bellomo como design partner con límite 500; evitar prometer a otros sectores antes de segundo tenant inmobiliario. Entitlements y ledger desde MVP; facturación inicialmente manual y auditada, sin integrar pasarela todavía.

Esfuerzo de construcción: ver backlog en jornadas-persona. Costo de desarrollo = jornadas × tarifa acordada; tarifa/equipo no proporcionados. Onboarding supuesto8–16h/tenant y soporte4h/mes piloto se tratan separados y se validan con tiempos reales. Costos de proveedores comerciales comparados en research.md: suscripción barata no concede reventa ni elimina integración propia.

## Decisión go/no-go económica

Go condicionado a benchmark del tamaño candidato, tarifa/fees canal verificados dentro de 25, restore probado, proveedor/modelo aprobado y presupuesto automatizado. No-go si costos fijos exceden sobres, calidad requiere modelo más caro sin margen o no hay financiamiento de implementación. Alternativas: reducir volumen/corpus, atención asistida con humano, infraestructura propia ya disponible documentando costo incremental real, o aumentar presupuesto. Nunca eliminar gates de seguridad para acomodar el precio.
