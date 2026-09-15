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

El entorno local fue actualizado el 15/09/2026 desde `Downloads/tablas_prop_bellomo_real.xlsx`: contiene 27 proyectos y 3.577 registros de inventario, junto con los catálogos originales de tipos, estados y localidades. Se eliminaron los clientes potenciales, contactos, visitas y seguimientos de demostración y QA. Las cuatro cuentas, sus permisos y restricciones siguen vigentes. Los importes originales están conservados en los datos de origen; los precios de la aplicación quedan sin moneda hasta confirmarla. Ver [informe de importación y validación](everprop-api/docs/REAL-WORKBOOK-IMPORT-2026-09-15.md).

## Configuración de esta computadora

`everprop-public/.env.local` (ignorado por Git):

```dotenv
NEXT_PUBLIC_EVERPROP_API_URL=http://127.0.0.1:18082
NEXT_PUBLIC_API_URL=http://127.0.0.1:18082
NEXT_PUBLIC_EVERPROP_TENANT=bellomo
NEXT_PUBLIC_DATA_MODE=api
```

El arranque usa `everprop-api/.docker/collections-compose.yaml` y los secretos locales existentes. Estos archivos privados no se versionan. El script está preparado para este entorno ya provisionado; para otra computadora seguir primero el bootstrap/import del README de la API. Nunca ejecutar el importador del baseline sobre una base con datos.

Sólo para una base de demostración vacía: el comando siguiente carga los fixtures antiguos. No usarlo para actualizar el inventario real importado:

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
