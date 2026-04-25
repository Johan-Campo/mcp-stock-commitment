# Asistente de Compromiso de Stock — Servidor MCP

Simulación de la capa **Servidor MCP** dentro de una arquitectura multiagente integrada con ERP. Implementa el cálculo de fecha de compromiso de entrega (ATP — Available to Promise) considerando stock actual, órdenes de compra, seguridad por roles y auditoría trazable.

```
Interfaz → Agente Orquestador → MCP Tool → Capa Semántica → ERP Mock → Auditoría
```

Pregunta resuelta por el sistema:
> "¿Cuándo podré entregar 500 unidades del producto 'ZAP-001' al cliente 'GARCIA SA'?"

## Cómo ejecutar

```bash
npm start
```

No requiere instalar dependencias. Node.js 18 o superior.

---

## Cuestionario teórico

**¿Cuáles son las ventajas de un API Gateway en una arquitectura de agentes distribuidos?**

El API Gateway es la puerta de entrada única a todos los servicios. Centraliza autenticación, límites de uso y registros en un solo punto, evitando que cada agente tenga que implementarlo por separado. Si un agente se comporta mal o consume demasiados recursos, se controla desde ahí sin tocar el resto del sistema.

---

**¿Por qué mapear el ERP a una Capa Semántica antes de pasarle los datos al agente?**

El ERP guarda los datos con nombres técnicos internos como `STK_ACT_01`. Un modelo de lenguaje no puede interpretar eso con certeza. La capa semántica los convierte a términos de negocio como `stock_actual`, eliminando ambigüedad. Además, si el ERP cambia un nombre de columna, solo se actualiza el mapper, no todo el sistema.

---

**¿Cómo garantizarías trazabilidad y auditoría de las acciones de un agente autónomo?**

Registrando cada acción en un log estructurado con: fecha y hora, identidad del agente, herramienta ejecutada, parámetros usados, resultado y duración. Cada entrada lleva un hash que encadena con la anterior, de forma que si alguien modifica el log queda evidencia. En este proyecto está implementado en `src/audit/logger.js`.

---

**¿Cómo diseñarías el mecanismo de retry ante fallos o timeouts?**

Máximo 3 reintentos con espera exponencial: 500ms, 1s, 2s, más un valor aleatorio pequeño para evitar que varios agentes reintenten al mismo tiempo. Solo se reintenta ante errores temporales (red caída, timeout). Errores definitivos como "producto no encontrado" no se reintentan porque el resultado no cambiará.

---

**Si el agente encadena 4 tools y la tercera falla, ¿cómo se protege el trabajo anterior?**

Guardando el resultado de cada tool en el contexto de la sesión antes de invocar la siguiente. Si la tercera falla, el agente tiene los resultados de las dos primeras disponibles y puede responder con información parcial, reintentar solo la tercera, o escalar sin perder lo ya procesado.

---

**¿Cómo evitar que el agente invente datos cuando una tool devuelve vacío?**

Con una regla explícita en el contrato de la tool y en el prompt del orquestador: si el campo `commitment_date` es `null`, la respuesta nunca puede mencionar una fecha. El agente solo puede usar datos que estén literalmente en la respuesta de la tool. Cualquier dato que cite sin fuente se descarta antes de responder al usuario.

---

**¿Cómo distinguir "el producto no existe" de "el producto existe pero sin stock"?**

Son dos consultas separadas en secuencia. Primero se busca el producto en el catálogo: si no aparece, es `PRODUCT_NOT_FOUND`. Si aparece pero el stock es cero, es `INSUFFICIENT`. La diferencia importa porque en el primer caso el usuario puede haber escrito mal el código; en el segundo, el producto es válido pero temporalmente sin inventario.

---

**Si el ERP usa paginación en su API REST, ¿cómo se obtiene el dataset completo?**

La tool maneja la paginación internamente con un bucle que va pidiendo páginas hasta que la API indica que no hay más. El agente recibe siempre el resultado completo, nunca datos parciales. Se agrega un límite máximo de páginas para evitar bucles infinitos si la API responde mal.

---

**¿Cómo versionar el esquema semántico para que cambios en el ERP no rompan el agente?**

El archivo `mock_schema_semantic.json` tiene un campo `version`. Los cambios siguen semver: si se agrega un campo nuevo, la versión menor sube y el agente sigue funcionando. Si se elimina o renombra un campo existente, la versión mayor sube y se coordina la migración antes de borrar el campo antiguo. Cada respuesta registra qué versión del schema se usó.

---

**¿Cómo implementar RBAC para que el agente solo vea los datos autorizados?**

Cada agente tiene un rol asignado (en este proyecto: `ADMIN`, `SALES_AGENT`, `VIEWER`). Antes de consultar cualquier dato, la tool verifica si ese rol tiene permiso para la operación solicitada. Si no lo tiene, la petición se bloquea y se registra en auditoría. En producción los roles vienen del token de autenticación del sistema.

---

**¿Cómo mitigar prompt injection?**

Con tres capas: validación de formato estricta (el SKU solo acepta letras mayúsculas, números y guiones, nada más), detección de patrones conocidos de ataque en los campos de texto libre, y separación estructural (los valores del usuario nunca se insertan dentro de una consulta, siempre son parámetros de filtro separados). Está implementado en `src/security/validator.js`.

---

**¿Cómo garantizar que el agente nunca ejecute escrituras?**

Dos capas independientes: en el código, la primera instrucción de cada tool verifica que la operación sea de lectura y lanza un error si no lo es. En producción, el usuario de base de datos tiene permisos `SELECT` únicamente a nivel del motor de base de datos. Aunque hubiera un bug en el código, el motor rechazaría la escritura.

---

**¿Qué incluirías en los logs de auditoría y cómo los protegerías?**

Cada entrada registra: fecha y hora, identidad del agente, herramienta ejecutada, parámetros de entrada, resultado, duración y un hash encadenado con la entrada anterior. No se registran datos personales del usuario final. La protección viene de escribir en modo append-only y enviar los logs en tiempo real a un sistema externo inmutable, de forma que ni el propio servidor pueda modificarlos después.

## Resultado esperado

Al ejecutar `npm start` se simula el flujo completo:

1. El agente orquestador recibe la pregunta y extrae las entidades (`sku`, `quantity`, `client_name`)
2. El servidor MCP valida permisos y sanitiza los inputs
3. La tool ejecuta el cálculo ATP en modo solo lectura
4. Detecta que la única orden confiable (400 uds, GLOBAL-SUPPLY) tiene fecha vencida sin recibirse
5. Registra la inconsistencia en auditoría
6. Devuelve `INCONSISTENT_DATA` con `commitment_date: null` — el sistema no puede comprometer una fecha basada en datos desactualizados y escala a validación humana
