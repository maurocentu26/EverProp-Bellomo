# Discovery: cotización técnica B2B (cliente de diseño Hierros La Quiaca SRL)

Primer vertical de EverSys según ADR D21. Esta ficha guía dos semanas de discovery con el cliente de diseño. **Todo lo que dice sobre Hierros La Quiaca son hipótesis a confirmar**: no tenemos todavía datos de su operación.

## Objetivo

Decidir con números si vale la pena construir el MVP. Al terminar el discovery tenemos que poder responder:

1. ¿Cuánto les cuesta hoy cotizar? (tiempo, personas, ventas perdidas)
2. ¿Qué parte de una cotización es interpretación (IA) y qué parte es cálculo y precio (código)?
3. ¿Podemos acceder, de forma segura y sostenida, a precios, stock y cotizaciones históricas?
4. ¿Cuál es la línea base contra la que vamos a medir el piloto?

## Hipótesis a validar

| # | Hipótesis | Cómo se valida |
|---|---|---|
| H1 | Gran parte de los pedidos de cotización llega por WhatsApp, en texto, audio, foto o PDF | Conteo de una semana real por canal y por formato |
| H2 | Cotizar tarda lo suficiente para perder ventas (el cliente le pide precio a varios) | Tiempo medido de pedido a respuesta, y motivo de las ventas perdidas |
| H3 | El cálculo (kilos, cortes, barras, merma) sigue reglas fijas que se pueden programar | Revisar 20 cotizaciones con el vendedor y escribir las reglas |
| H4 | Precio y stock están en un sistema o planilla accesible y actualizada | Ver el sistema, la frecuencia de actualización y quién la mantiene |
| H5 | El vendedor aceptaría aprobar una cotización armada por el sistema en lugar de hacerla desde cero | Entrevista y prueba con 5 casos en papel |

## Participantes

- **Cliente:** dueño o gerente (decide), 1 o 2 vendedores (operan), quien mantiene precios y stock, y quien maneja los sistemas, si existe.
- **EverSys:** tech lead (datos, integración, reglas de cálculo) y responsable comercial (dolor, precio, decisión).
- Duración: un relevamiento presencial de 2 a 3 horas, una semana de medición y una devolución.

## Preguntas por bloque

### 1. Negocio
- ¿Qué venden? Familias de producto, cantidad aproximada de artículos, unidades de venta (barra, kg, m², unidad).
- ¿A quién venden? Mostrador, constructoras, herrerías, particulares, revendedores. ¿Qué peso tiene cada uno?
- ¿Cuántas cotizaciones hacen por día o por semana? ¿Qué porcentaje termina en venta?
- ¿Por qué pierden ventas? Precio, demora, falta de stock, no se respondió.
- ¿Cuánto vale una venta típica y una grande?

### 2. Proceso actual de cotización (observarlo, no solo preguntar)
- ¿Por dónde llega el pedido? WhatsApp (¿número de la empresa o personal del vendedor?), teléfono, email, mostrador.
- ¿En qué formato? Texto, audio, foto de una lista a mano, plano, PDF de cómputo de un ingeniero.
- Pasos desde que llega hasta que se responde. ¿Quién lo hace y con qué herramientas?
- ¿Cómo se calcula? Kilos por metro según el diámetro, cortes, barras de 12 m, merma, descuentos por volumen, flete.
- ¿Cómo se manda la cotización? Mensaje, PDF, foto de una planilla. ¿Cuánto dura vigente?
- ¿Hacen seguimiento de las cotizaciones que no contestaron? ¿Cómo?
- ¿Qué errores son frecuentes y cuánto cuestan? (precio viejo, cuenta mal hecha, producto sin stock)

### 3. Precios y stock
- ¿Dónde vive la lista de precios? Sistema de gestión (cuál: Tango, Bejerman, propio), Excel o Google Sheets.
- ¿Cada cuánto cambian los precios y quién los actualiza? ¿Hay precio en pesos y en dólares?
- ¿Hay listas distintas por tipo de cliente o descuentos negociados?
- ¿El stock está en un sistema confiable? ¿Hay mercadería en camino o productos que se piden a fábrica?
- ¿Qué no se puede prometer nunca sin consultar? (por ejemplo, precio de un pedido grande o plazo de entrega)

### 4. Sistemas y acceso
- ¿El sistema de gestión tiene API, exportaciones automáticas o una base accesible?
- ¿Quién lo administra? ¿Un proveedor externo?
- ¿Usan WhatsApp Business App o API? ¿Cuántos números? ¿A nombre de quién?
- ¿Hay restricciones internas de seguridad o de confidencialidad?

### 5. Equipo y adopción
- ¿Cuántos vendedores cotizan? ¿Alguno es "el que sabe" y es un cuello de botella?
- ¿Qué le daría miedo al vendedor de un sistema así? ¿Qué le ahorraría?
- ¿Quién aprobaría las cotizaciones grandes?

### 6. Decisión y presupuesto
- ¿Qué resultado haría que valga la pena? Por ejemplo, "responder en menos de 10 minutos" o "vender X más por mes".
- ¿Quién decide la compra y con qué presupuesto mensual se compara? (un vendedor, una herramienta actual)

## Datos a pedir

| Dato | Cantidad | Para qué | Cuidado |
|---|---|---|---|
| Pedidos de cotización reales (texto, audio, foto, PDF) con la cotización que se respondió | 200 a 500 | Dataset de evaluación: interpretación y cálculo | **Anonimizar** nombre, teléfono y CUIT del cliente final antes de procesar. Sin acuerdo de confidencialidad firmado, no salen del cliente |
| Lista de precios vigente y una de hace 3 a 6 meses | 2 | Conector de precios y frecuencia de cambio | Confidencial: solo en el entorno de EverSys, nunca en prompts de prueba públicos |
| Catálogo con unidades, pesos y medidas | Completo | Motor de cálculo determinista | — |
| Reglas de cálculo y descuentos escritas por el vendedor experto | Todas las que haya | Motor de cálculo y validador | — |
| Ventas cerradas vs. cotizadas del último trimestre | Agregado | Línea base de conversión | Solo agregados, sin datos de clientes |
| Exportación o acceso al stock | Muestra | Viabilidad del conector | — |

Antes de recibir datos: acuerdo de confidencialidad firmado y decisión sobre dónde se guardan. Hasta que la sociedad de EverSys esté formalizada, ese acuerdo hay que firmarlo con una persona responsable identificada.

## Línea base (medir una semana real antes de construir)

| Métrica | Cómo se mide | Meta del piloto (hipótesis) |
|---|---|---|
| Pedidos de cotización por día, por canal y formato | Planilla simple que llena el vendedor, o conteo en WhatsApp | — |
| Tiempo de pedido a respuesta (p50 y p95) | Hora del pedido y hora de la respuesta en el chat | De horas a minutos |
| Conversión de cotización a venta | Cotizaciones vs. ventas cerradas | +X puntos, a definir con el cliente |
| Errores de cotización (precio, cuenta, stock) | Revisión de una muestra de 30 | 0 errores de precio |
| Tiempo de vendedor dedicado a cotizar por día | Estimación del vendedor y observación | −50% o más |
| Cotizaciones sin seguimiento | Cotizaciones sin respuesta del cliente y sin recontacto | Seguimiento automático del 100% |

## Criterios para avanzar al MVP (go / no-go)

- **Go:** se confirman H1, H2 y H4; las reglas de cálculo se pueden escribir (H3); hay al menos 200 casos reales para evaluar; y el cliente acepta el piloto en modo sombra con un responsable nombrado.
- **No-go o pivot:** los precios no se pueden obtener de forma confiable y sostenida; los pedidos llegan sobre todo por otro canal; o el cálculo depende de criterio humano que no se puede escribir.

## Entregable del discovery

Un documento de una página, con: la línea base medida, las reglas de cálculo escritas, el mapa de sistemas y accesos, el dataset anonimizado con su tamaño, el alcance del MVP y la decisión go o no-go firmada por las dos partes.

## Fuera de alcance del discovery

Construir código, conectar el WhatsApp real del cliente o procesar datos sin acuerdo de confidencialidad. Tampoco prometer precio ni plazos del producto antes de tener la línea base.
