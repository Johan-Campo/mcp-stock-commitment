'use strict';

const { stockCommitmentTool } = require('./tools/stockCommitment.tool');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BLUE   = '\x1b[34m';

function header(text) {
  const line = '─'.repeat(60);
  console.log(`\n${CYAN}${BOLD}${line}\n  ${text}\n${line}${RESET}`);
}

function section(label) {
  console.log(`\n${BLUE}${BOLD}▶ ${label}${RESET}`);
}

function row(label, value, color = RESET) {
  console.log(`  ${DIM}${label.padEnd(28)}${RESET}${color}${value}${RESET}`);
}

function warn(text) { console.log(`  ${YELLOW}⚠  ${text}${RESET}`); }
function info(text) { console.log(`  ${DIM}${text}${RESET}`); }

const STATUS_COLOR = {
  AVAILABLE: GREEN, COMMITTABLE: GREEN,
  INCONSISTENT_DATA: YELLOW,
  INSUFFICIENT: RED, PRODUCT_NOT_FOUND: RED,
  PRODUCT_OBSOLETE: RED, VALIDATION_ERROR: RED, ACCESS_DENIED: RED,
};

async function run() {
  header('SERVIDOR MCP — Asistente de Compromiso de Stock');

  section('CAPA 1 · Pregunta del usuario');
  console.log(`\n  "${BOLD}¿Cuándo podré entregar 500 unidades del producto 'ZAP-001' al cliente 'GARCIA SA'?${RESET}"\n`);

  section('CAPA 2 · Agente Orquestador — Extracción de entidades');
  const agentId   = 'agent-orchestrator';
  const toolInput = { sku: 'ZAP-001', quantity: 500, client_name: 'GARCIA SA' };
  info('El orquestador interpreta la intención y extrae los parámetros estructurados:');
  row('agentId',     agentId);
  row('tool',        'stockCommitment');
  row('sku',         toolInput.sku);
  row('quantity',    String(toolInput.quantity));
  row('client_name', toolInput.client_name);

  section('CAPA 3 · Servidor MCP — Ejecutando tool: stockCommitment');
  info('Pipeline: [1] Read-only  [2] Validación  [3] RBAC  [4] ATP  [5] Auditoría');

  console.log();
  const result = await stockCommitmentTool({ agentId, ...toolInput });

  section('CAPA 4 · Resultado de la tool');
  const sc = STATUS_COLOR[result.status] || RESET;
  row('status',             result.status, sc);
  row('sku',                result.sku);
  row('descripcion',        result.descripcion);
  row('cantidad solicitada',String(result.cantidad_solicitada));
  row('stock disponible',   `${result.stock_disponible_actual} uds`);
  row('stock reservado',    `${result.stock_reservado} uds (ALM-RESERVADO, no comprometible)`);
  row('commitment_date',    result.commitment_date ?? 'null — no determinable');

  console.log(`\n  ${DIM}Stock por almacén:${RESET}`);
  result.stock_por_almacen.forEach((s) =>
    info(`    ${s.almacen.padEnd(16)} ${s.stock_actual} uds  (${s.ubicacion})`)
  );

  console.log(`\n  ${DIM}Timeline de inventario acumulativo:${RESET}`);
  result.timeline.forEach((step) => {
    const flag  = step.isPastDue ? `${YELLOW}⚠ VENCIDA${RESET}` : `${GREEN}✓${RESET}`;
    const label = step.evento === 'stock_actual' ? 'Stock actual hoy' : `Reposición (${step.proveedor})`;
    info(`    ${step.fecha}  ${flag}  +${String(step.cantidad_sumada).padStart(4)} uds  →  acumulado: ${step.acumulado} uds  [${label}]`);
  });

  if (result.inconsistencias.length > 0) {
    console.log(`\n  ${YELLOW}${BOLD}Inconsistencias detectadas:${RESET}`);
    result.inconsistencias.forEach((i) => warn(i.detalle));
  }

  if (result.ordenes_no_confiables.length > 0) {
    console.log(`\n  ${DIM}Órdenes no confiables (excluidas del cálculo ATP):${RESET}`);
    result.ordenes_no_confiables.forEach((o) =>
      info(`    ${o.fecha_estimada}  ${o.cantidad} uds  Estado: ${o.estado}  Proveedor: ${o.proveedor}`)
    );
  }

  section('CAPA 5 · Agente Orquestador — Validación y respuesta final');
  const contract  = require('./tools/stockCommitment.contract.json');
  const statusDef = contract.status_definitions[result.status];
  info('Regla del contrato aplicada:');
  info(`  "${statusDef.agent_action}"`);
  console.log(`\n  ${BOLD}Respuesta al usuario:${RESET}`);
  console.log(`  ${sc}${BOLD}"${result.mensaje}"${RESET}`);

  section('Auditoría');
  row('Log file',       'logs/audit.jsonl');
  row('Schema version', result.metadata.schema_version);
  row('Evaluated at',   result.metadata.evaluated_at);

  console.log(`\n${CYAN}${'─'.repeat(60)}${RESET}\n`);
}

run().catch((err) => {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
});
