# EVP-47 — Mostrar/ocultar contraseña en login

Rama `ticket/EVP-47-mostrar-password` desde `develop` · 2026-10-19 · Codex con Mauro.

## 1. Pedido
Permitir comprobar la contraseña escrita desde PC mediante un botón de mostrar/ocultar. Usuario autoriza trabajo urgente en paralelo al ticket anterior. No recuperar contraseñas almacenadas ni corregir el rechazo 422.

## 2. Implementación
- `everprop-public/src/app/login/page.tsx`: estado local inicialmente oculto, botón de tipo `button`, iconos existentes Eye/EyeOff, nombre accesible, estado y control asociado; área táctil de 48 × 44 px como mínimo.
- `everprop-public/tests/login-password.test.mjs`: prueba ejecutable del estado inicial, ambas transiciones, conservación del valor y ausencia de llamadas a login al alternar.
- Sin cambios de esquema, API, credenciales, persistencia ni logs.

## 3. Solución
Se reutilizan React, lucide-react y el patrón de prueba Node/TypeScript existente. Un único estado booleano local; sin nuevas dependencias.

## 4. Verificación
- `node --test tests/login-password.test.mjs`: 1 prueba aprobada.
- `npx eslint src/app/login/page.tsx tests/login-password.test.mjs`: aprobado.
- `npm run build`: aprobado (compilación, TypeScript y generación).
- `npm run lint`: falló por archivos de skills Remotion locales sin seguimiento ajenos al cambio (92 errores y 161 avisos en total). No se modificaron.
- Sin cambios de queries, aislamiento de tenant ni IA: revisores especializados no aplican.
- Pendiente verificación visual y publicación. La prueba simula hooks, no sustituye un navegador real.

## 5. Riesgos y entrega
El botón muestra únicamente lo escrito en el navegador. No prueba que las credenciales sean válidas ni soluciona por sí solo el HTTP 422. Preparar hotfix desde `main` con solo estos archivos, sin trasladar IA/conversaciones desde `develop`. Dejar PR abierto según política de merges del repositorio.
