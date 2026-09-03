# EverProp API agent contract

- Trabajar exclusivamente dentro de este repositorio.
- No abrir ni utilizar credenciales históricas de Bellomo.
- Ejecutar Laravel y Composer con PHP 8.4 dentro de Docker.
- No modificar el baseline SQL; verificar siempre su SHA-256 antes de importarlo.
- No confiar en `tenant_id` recibido desde el cliente.
- Toda consulta operativa tenant-scoped debe combinar contexto, query explícita, policy y pruebas negativas.
- No instalar un paquete RBAC que cree tablas paralelas; el contrato usa `users.role_code` y scopes de inventario existentes.
- No usar SQLite para afirmar compatibilidad.
- No versionar `.env`, `.env.testing` ni `.docker/secrets`.
- No ejecutar commit, push, PR o deploy sin autorización expresa.
