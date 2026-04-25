'use strict';

const { validateInput }            = require('../security/validator');
const { assertCan }                = require('../security/rbac');
const { assertReadOnly }           = require('../security/readOnly');
const { logToolInvocation,
        logSecurityEvent,
        logDataInconsistency }     = require('../audit/logger');
const { getArticulo }              = require('../services/articulos.service');
const { getTotalAvailableBySku,
        getTotalReservedBySku,
        getAvailableStockBySku }   = require('../services/stock.service');
const { getReliableOrdersBySku,
        getUnreliableOrdersBySku } = require('../services/orders.service');
const { getSchemaVersion }         = require('../mappers/semantic.mapper');

const TOOL_NAME = 'stockCommitment';

function buildTimeline(availableNow, reliableOrders, requiredQty) {
  const today = new Date().toISOString().split('T')[0];
  const timeline = [];
  let cumulative = availableNow;

  timeline.push({
    fecha: today, evento: 'stock_actual',
    cantidad_sumada: availableNow, acumulado: cumulative,
    isPastDue: false, inconsistencia: null,
  });

  let commitmentDate    = cumulative >= requiredQty ? today : null;
  let commitmentReached = cumulative >= requiredQty;

  for (const order of reliableOrders) {
    cumulative += order.cantidad_pendiente;
    timeline.push({
      fecha: order.fecha_esperada_reposicion, evento: 'reposicion_proveedor',
      proveedor: order.proveedor, estado_pedido: order.estado_pedido,
      cantidad_sumada: order.cantidad_pendiente, acumulado: cumulative,
      isPastDue: order.isPastDue, inconsistencia: order.inconsistency || null,
    });

    if (!commitmentReached && cumulative >= requiredQty) {
      commitmentReached = true;
      commitmentDate    = order.isPastDue ? null : order.fecha_esperada_reposicion;
    }
  }

  return { timeline, commitmentDate, commitmentReached };
}

function resolveStatus(availableNow, requiredQty, commitmentReached, commitmentDate) {
  if (availableNow >= requiredQty)         return 'AVAILABLE';
  if (!commitmentReached)                   return 'INSUFFICIENT';
  if (commitmentReached && commitmentDate)  return 'COMMITTABLE';
  return 'INCONSISTENT_DATA';
}

function buildMessage(status, { sku, quantity, client_name }, availableNow, commitmentDate, nInconsistencias) {
  switch (status) {
    case 'AVAILABLE':
      return `Hay stock suficiente para entregar ${quantity} unidades de '${sku}' a '${client_name}' de forma inmediata (${availableNow} uds disponibles).`;
    case 'COMMITTABLE':
      return `Stock actual insuficiente (${availableNow} uds). Con las reposiciones confirmadas, se podrán entregar ${quantity} unidades de '${sku}' a '${client_name}' a partir del ${commitmentDate}.`;
    case 'INCONSISTENT_DATA':
      return `No se puede emitir una fecha de compromiso confiable para '${sku}'. ${nInconsistencias} orden(es) con fecha vencida aún no han sido recibidas. Se requiere validación manual con los proveedores antes de confirmar al cliente '${client_name}'.`;
    case 'INSUFFICIENT':
      return `Demanda no cubierta: no hay stock ni órdenes confiables suficientes para comprometer ${quantity} unidades de '${sku}' a '${client_name}'.`;
    default:
      return 'Estado no determinado. Revisar manualmente.';
  }
}

async function stockCommitmentTool({ agentId, sku, quantity, client_name }) {
  const startTime = Date.now();

  try {
    assertReadOnly('query');
  } catch (err) {
    logSecurityEvent({ agentId, event: 'WRITE_ATTEMPT_BLOCKED', reason: err.message });
    throw err;
  }

  const validation = validateInput({ sku, quantity, client_name });
  if (!validation.valid) {
    logSecurityEvent({ agentId, event: 'INVALID_INPUT', reason: validation.errors.join('; '), context: { sku, quantity, client_name } });
    return { status: 'VALIDATION_ERROR', errors: validation.errors };
  }

  const input = validation.sanitized;

  try {
    assertCan(agentId, 'can_query_stock');
    assertCan(agentId, 'can_query_orders');
  } catch (err) {
    logSecurityEvent({ agentId, event: 'RBAC_DENIED', reason: err.message, context: { tool: TOOL_NAME } });
    return { status: 'ACCESS_DENIED', error: err.message };
  }

  try {
    const articulo = getArticulo(input.sku);

    if (!articulo) {
      logToolInvocation({ agentId, tool: TOOL_NAME, input, status: 'error', result: 'SKU no encontrado', durationMs: Date.now() - startTime });
      return { status: 'PRODUCT_NOT_FOUND', sku: input.sku, message: `El producto '${input.sku}' no existe en el catálogo del ERP.` };
    }

    if (articulo.obsoleto) {
      logToolInvocation({ agentId, tool: TOOL_NAME, input, status: 'error', result: 'Producto obsoleto', durationMs: Date.now() - startTime });
      return { status: 'PRODUCT_OBSOLETE', sku: input.sku, descripcion: articulo.descripcion, message: `'${input.sku}' (${articulo.descripcion}) está marcado como obsoleto y no puede comprometerse.` };
    }

    const availableNow     = getTotalAvailableBySku(input.sku);
    const reservedStock    = getTotalReservedBySku(input.sku);
    const stockByWarehouse = getAvailableStockBySku(input.sku);
    const reliableOrders   = getReliableOrdersBySku(input.sku);
    const unreliableOrders = getUnreliableOrdersBySku(input.sku);

    const inconsistentOrders = reliableOrders.filter((o) => o.isPastDue);
    if (inconsistentOrders.length > 0) {
      logDataInconsistency({ agentId, tool: TOOL_NAME, inconsistencies: inconsistentOrders.map((o) => o.inconsistency) });
    }

    const { timeline, commitmentDate, commitmentReached } = buildTimeline(availableNow, reliableOrders, input.quantity);
    const status = resolveStatus(availableNow, input.quantity, commitmentReached, commitmentDate);

    const result = {
      status,
      sku:                     input.sku,
      descripcion:             articulo.descripcion,
      client_name:             input.client_name,
      cantidad_solicitada:     input.quantity,
      stock_disponible_actual: availableNow,
      stock_reservado:         reservedStock,
      stock_por_almacen:       stockByWarehouse,
      commitment_date:         commitmentDate,
      timeline,
      inconsistencias: inconsistentOrders.map((o) => ({
        fecha_estimada: o.fecha_esperada_reposicion,
        cantidad:       o.cantidad_pendiente,
        estado:         o.estado_pedido,
        proveedor:      o.proveedor,
        detalle:        o.inconsistency,
      })),
      ordenes_no_confiables: unreliableOrders.map((o) => ({
        fecha_estimada: o.fecha_esperada_reposicion,
        cantidad:       o.cantidad_pendiente,
        estado:         o.estado_pedido,
        proveedor:      o.proveedor,
      })),
      mensaje: buildMessage(status, input, availableNow, commitmentDate, inconsistentOrders.length),
      metadata: { evaluated_at: new Date().toISOString(), schema_version: getSchemaVersion(), agentId },
    };

    logToolInvocation({
      agentId, tool: TOOL_NAME, input,
      status:     status === 'INCONSISTENT_DATA' ? 'warning' : 'success',
      result:     { status, commitment_date: commitmentDate, available_now: availableNow },
      durationMs: Date.now() - startTime,
    });

    return result;

  } catch (err) {
    logToolInvocation({ agentId, tool: TOOL_NAME, input, status: 'error', result: err.message, durationMs: Date.now() - startTime });
    throw err;
  }
}

module.exports = { stockCommitmentTool };
