# Evaluación de Eversys Conversations

Dataset versionado para decidir releases del núcleo conversacional (Q01). Diseño y gates: `docs/eversys-conversations/evaluation-and-security.md` §6.

- `cases.schema.json`: contrato de cada caso.
- `cases/<segmento>.jsonl`: un caso por línea. Segmentos: `search`, `current-data`, `crm`, `security`, `failures`, `rioplatense`.
- `validate.mjs`: valida estructura, IDs únicos y cobertura. Sin dependencias: `node evals/validate.mjs`.

Estado: **semilla** con los casos obligatorios del diseño. Objetivo 200 casos (60/30/30/40/20/20).

## Runner (`everprop-api/tests/Feature/Evals/ModelEvalTest.php`)

Juega cada **caso de modelo** (un visitante que escribe, sin eventos de sistema) por el turno real: widget → coordinador → herramientas → guardia de salida. Después compara lo persistido y lo que vio el visitante con `expected`. Los casos con eventos de sistema o con asesor/solo-lectura son de infraestructura (replay, takeover, timeouts, presupuesto): se listan como `DETERMINISTIC` y los cubren las suites deterministas, nunca cuentan como aprobados.

- **CI / siempre:** autoverificación con modelo guionado (detecta una fuga y aprueba una respuesta correcta).
- **`EVAL_LLM=dry`:** recorre todos los casos con un modelo que siempre responde lo mismo. Gratis; sirve para probar que los fixtures cargan, no mide calidad.
- **`EVAL_LLM=configured`:** usa el proveedor configurado. **Cuesta plata: solo con autorización** (go-live F2 paso 5) y sobre una base aislada. Falla si algún caso crítico falla.

Desde `everprop-api/`, montando el dataset al lado de la app:

```bash
docker compose run --rm -v "$PWD/../evals:/var/www/evals:ro" -e EVAL_LLM=dry everprop-api-php php artisan test --filter=test_model_cases
```

El reporte queda en `storage/app/evals/report-*.json`: resultado, fallas mecánicas, claves `persisted` que el runner todavía no verifica (`unchecked`), respuestas y herramientas pedidas. Un `PASS` es mecánico: los comportamientos `answer`, `clarify`, `abstain` y `deny` necesitan la calificación humana del reporte (`needs_human`). Los casos de WhatsApp se juegan por el widget (el prompt solo cambia el nombre del canal).

Reglas: datos sintéticos (`bellomo-sintetico`, `inmobiliaria-demo-2`); `split: test` es ciego; los gates evalúan el estado persistido, no el texto del modelo; una fuga bloquea el release aunque el resto pase.
