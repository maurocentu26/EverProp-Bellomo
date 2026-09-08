# Pruebas locales con Docker

Desde esta carpeta, con Docker Desktop abierto:

```powershell
./start-local.ps1
```

Abrir http://localhost:3000/login. El frontend Next.js corre con Node en Windows y consume la API de Docker mediante el proxy del mismo origen. PHP 8.4, MySQL 8.4, Redis, Nginx, cola y scheduler corren en el proyecto Docker `everprop-collections`. La API está en http://127.0.0.1:18082. Los volúmenes conservan los cambios al reiniciar.

## Cuentas originales

Todas usan la contraseña de simulación original `password123`:

| Perfil | Correo |
| --- | --- |
| Marcos, administrador | admin@bellomo.com |
| Sofía, ingeniera / SALES_MANAGER | sofia@bellomo.com |
| Lucas, asesor | lucas.albarracin@bellomo.com |
| Valentina, asesora | valentina.morales@bellomo.com |

La carga inicial contiene 3 proyectos, 73 propiedades del archivo de información real, 10 clientes potenciales y 3 visitas originales. Se excluyen las propiedades adicionales de simulación. Los permisos y las restricciones de pantalla de cada perfil siguen vigentes. Cobranzas comienza vacía: crear un acuerdo fijo desde un cliente y registrar pagos para probar persistencia y saldos.

## Configuración de esta computadora

`everprop-public/.env.local` (ignorado por Git):

```dotenv
NEXT_PUBLIC_EVERPROP_API_URL=http://127.0.0.1:18082
NEXT_PUBLIC_API_URL=http://127.0.0.1:18082
NEXT_PUBLIC_EVERPROP_TENANT=bellomo
NEXT_PUBLIC_DATA_MODE=api
```

El arranque usa `everprop-api/.docker/collections-compose.yaml` y los secretos locales existentes. Estos archivos privados no se versionan. El script está preparado para este entorno ya provisionado; para otra computadora seguir primero el bootstrap/import del README de la API. Nunca ejecutar el importador del baseline sobre una base con datos.

Para cargar los fixtures originales en una base local vacía ya provisionada:

```powershell
docker exec everprop-collections-php php artisan everprop:local-demo
```

El comando mantiene las claves foráneas, usa una transacción y no borra datos. Repetirlo después de la carga no altera los registros. Rechaza bases no vacías sin el fixture esperado y ambientes distintos de `local`. No usar el antiguo cargador de simulación para reiniciar este entorno.

## Verificación

```powershell
./everprop-api/scripts/test-local-app.ps1
docker exec everprop-collections-php php artisan test
```

El primer script verifica las cuatro sesiones y nueve endpoints de módulos por usuario a través del frontend. La suite MySQL verifica además permisos, aislamiento y creación/cobro/reversión de cuotas. Estas comprobaciones no equivalen a una prueba manual de cada pantalla ni incorporan servicios externos de mensajería. Las funcionalidades que el proyecto mantiene como simulación conservan ese alcance; CAC y planes escalonados no registran acuerdos online. La programación de visitas desde `LeadDetailView` todavía guarda en el navegador: cargar las visitas originales en MySQL no convierte ese flujo en persistente por API.
