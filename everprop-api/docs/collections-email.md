# Cobranzas por correo para Bellomo

## Resultado

El módulo previo guarda acuerdos, cuotas, pagos y notificaciones internas a asesores. `NotifyCollections` no enviaba emails al cliente. Se agregó una vista previa en Cobranzas y un comando para enviar una sola cuota mediante SMTP de la empresa, sin rehacer el módulo financiero. Se utiliza el transporte de Laravel ya instalado; no se agregaron proveedores ni dependencias.

El panel muestra destinatario tomado de la ficha, saldo pendiente actualizado, asunto y texto. Permite descargar un borrador. No tiene un botón de envío ni registra un borrador como correo enviado. Las cuotas pagadas, canceladas, futuras o sin correo válido no son elegibles. No se calcula mora adicional ni se incluyen instrucciones de pago no aprobadas.

`GET /api/v1/admin/installments/{uuid}/email-preview` usa el tenant de la sesión, la query scoped y CollectionsPolicy. Un asesor solo accede a sus clientes; READ_ONLY no prepara comunicaciones. Respuesta `no-store`. No acepta tenant, destinatario, importe ni remitente suministrados por el navegador.

## Configuración pendiente de Bellomo

Confirmar remitente autorizado, correo de respuesta, proveedor/servidor SMTP, puerto/TLS y método de autenticación. Las credenciales nuevas se provisionan en secretos del despliegue; no se pegan en documentación ni se recuperan credenciales históricas. Si el proveedor exige OAuth, esta primera integración SMTP usuario/contraseña no lo implementa: hace falta adaptador y consentimiento específicos.

Variables para un único tenant explícitamente provisionado por despliegue:

```dotenv
COLLECTIONS_MAIL_ENABLED=false
COLLECTIONS_MAIL_TENANT=bellomo
COLLECTIONS_MAIL_FROM_ADDRESS=
COLLECTIONS_MAIL_FROM_NAME=Bellomo Desarrollos
COLLECTIONS_MAIL_REPLY_TO=
COLLECTIONS_MAIL_SCHEME=smtp
COLLECTIONS_MAIL_HOST=
COLLECTIONS_MAIL_PORT=587
COLLECTIONS_MAIL_USERNAME=
COLLECTIONS_MAIL_PASSWORD=
```

`smtp` usa negociación TLS del transporte; para TLS implícito usar `smtps` y puerto indicado por el proveedor. No desactivar validación de certificados. No usar un fallback a log para afirmar entrega. Configuración por tenant adicional y OAuth quedan pendientes; el remitente de Bellomo nunca se reutiliza automáticamente para otra empresa.

## Prueba y uso

Usar PHP 8.4 dentro de Docker y MySQL de pruebas. La preparación siguiente se niega a tocar una base que no termine en `_test` o un ambiente distinto de testing:

```text
docker exec -e APP_ENV=testing everprop-collections-php php scripts/apply-collection-email-test.php
docker exec everprop-collections-php php artisan test --filter=CollectionEmail
```

La vista previa del comando no escribe ni envía:

```text
php artisan everprop:collections:email bellomo UUID_DE_CUOTA
```

Después de aprobar texto/destinatario, aprovisionar SMTP, aplicar el forward y autorizar una prueba con un destinatario controlado:

```text
php artisan everprop:collections:email bellomo UUID_DE_CUOTA --send
```

No existe envío masivo ni tarea programada nueva. La frecuencia de contacto y automatización deben acordarse con Bellomo antes de incorporarlas al scheduler. No se ejecutó un envío real durante el desarrollo.

## Auditoría y fallos

Aplicar solamente `database/schema/forward/2026-10-07.001_collection_email_attempts.sql` sobre el esquema existente, mediante la conexión de migración autorizada. No reimportar baseline. La tabla tiene FK compuesta tenant/cuota y clave única por tenant/cuota/día comercial. El forward añade una tabla, una tabla tenant y una FK. El verificador fue actualizado para todos los forwards ya presentes: 51 tablas, 48 tenant y 113 FK sin importación de inventario; con datos importados exige además las dos relaciones legacy (115 FK). No se añaden esas relaciones ni se importa inventario al preparar esta tabla de correo.

Antes de reclamar un intento, se bloquea el tenant como hacen los pagos y se vuelve a consultar el saldo y el estado. `SENDING` persiste antes de contactar SMTP; una repetición el mismo día no vuelve a enviar. `SENT` significa aceptación SMTP, no lectura ni entrega en bandeja. Timeout/error/supresión del mailer produce `UNKNOWN`; un intento UNKNOWN o SENDING bloquea también los días siguientes hasta revisión operativa. No se registra el mensaje de excepción porque puede contener datos/credenciales del proveedor.

Una caída después de aceptación y antes de guardar SENT deja SENDING y requiere conciliación. Revisar logs del proveedor y del intento antes de cualquier corrección autorizada. No borrar auditoría para forzar un reenvío. Un pago concurrente posterior a la reclamación puede llegar antes del email: el texto dice “según nuestros registros” y solicita verificar pagos ya realizados. No prometer saldo congelado ni entrega exactamente una vez en SMTP.

Los registros contienen datos de contacto e importes: definir acceso y retención antes de producción. La reversión de código debe mantener la auditoría y el libro de pagos; deshabilitar `COLLECTIONS_MAIL_ENABLED` para detener nuevas entregas.

## Facturación de Bellomo a sus clientes

Alvaro confirmó el 7/10 que la tarea corresponde a Bellomo facturando a sus clientes. La inspección de los dominios, rutas, configuración, esquemas, dependencias y frontend de este checkout no encontró emisión fiscal, tablas de facturas/CAE, credenciales configurables ARCA, cliente SOAP WSAA/WSFE ni conexión SQL Server. `Integrations` recibe webhooks del CRM; no es un conector contable. La interoperabilidad legacy existente identifica proyectos/unidades, no factura ni sincroniza pagos. Las notas del 27/8 describen un sistema GeneXus/C++/SQL Server, pero no identifican su interfaz de facturación.

Conclusión de implementación: comenzar con un intercambio auditable de pagos con el sistema actual, sin reemplazar el sistema fiscal ni asumir su API. Se agregó `GET /api/v1/admin/collections/billing-export?paidFrom=YYYY-MM-DD&paidTo=YYYY-MM-DD` y “Exportar pagos” en Cobranzas. Solo administradores y gerentes del tenant pueden usarlo. Devuelve una consulta consistente acotada a 5000 filas; si supera el límite exige reducir fechas, sin truncar silenciosamente. El panel descarga CSV UTF-8, conserva importes decimales y protege campos textuales de fórmulas de planilla.

Exporta UUID de pago/cliente/acuerdo/cuota, fecha, importe/moneda, medio, referencia, proyecto y claves legacy de unidad cuando existen. Incluye anulaciones con REVERSED y fecha/motivo; no sumarlas como cobros vigentes. El período filtra fecha del pago original: para conciliar una reversión posterior hay que repetir el período del pago original. No hay marca de “facturado”, subida automática, cambio de libro ni emisión fiscal. Es un formato de intercambio propuesto, no un layout de importación confirmado por el software de Bellomo. Clientes/leads eliminados no se exportan, siguiendo el alcance de acceso del módulo.

Faltan evidencia del software fiscal actual y su contrato de entrada, mapeo del UUID de cliente al código legacy, identificación/condición fiscal de receptor y emisor, conceptos/impuestos, disparador aprobado (no asumir que pago = factura), numeración, conciliación de comprobantes ya emitidos y tratamiento de anulaciones. `contacts.profile_json` es genérico, no una ficha fiscal validada; no inferir DNI/CUIT desde nombre, teléfono o UUID.

La documentación oficial vigente consultada enlaza el manual WSFEv1 4.7 y distingue WSFEv1 sin detalle de ítems de WSMTXCA con detalle. WSAA requiere certificado X.509 y asociación al servicio, con homologación y producción separadas. Una integración directa necesitaría ese circuito, adapter, validaciones y reconciliación de autorizaciones inciertas antes de reenviar. No se conectó ARCA ni se emitieron documentos. La propuesta original excluye la integración fiscal: si se decide incorporarla, dejar explícito el alcance adicional.

Fuentes oficiales: [servicios de factura electrónica](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp) y [autenticación WSAA](https://www.arca.gob.ar/ws/documentacion/wsaa.asp), consultadas el 7/10/2026.

## Revisión local y validación

El proyecto ocultaba Cobranzas con `FINAL_DELIVERY_ENABLED=false`. Ahora conserva el valor seguro por defecto y admite `NEXT_PUBLIC_FINAL_DELIVERY_ENABLED=true` para una compilación de revisión local/staging. El indicador original afecta también Settings; no activarlo en producción sin aceptación de esos módulos. La entrega de código no cambia la configuración ni publica la funcionalidad.

Resultados finales: suite completa PHP 8.4/MySQL aprobada con 97 pruebas y 569 aserciones, usando CACHE_STORE=array para aislar el caché de las pruebas. Las 6 pruebas frontend, build de producción, TypeScript, lint de archivos cambiados, Pint y PHPStan de backend cambiado pasaron. La verificación de contrato de esquema pasó y el SHA256 del baseline permaneció sin cambios. El lint general detectó los seis errores CommonJS ya documentados en `everprop-public/docs/audit/frontend-audit.cjs`, archivo sin seguimiento previo. No se verificó visualmente el panel ni la entrega SMTP real: las pruebas de correo simulan el transporte. La migración se aplicó únicamente en bellomo_crm_test; no se modificó inventario real ni se enviaron correos, emitieron facturas o desplegaron cambios.

Fuentes: notas de [Meet 6/10](https://docs.google.com/document/d/1PoHTeplKvSdOlQN6I-IDgdRFEGn88ZyDlF0X1AUojM4/edit), propuesta local del 12/8 y [documentación oficial de Mail de Laravel 13](https://laravel.com/framework/docs/13.x/mail).
