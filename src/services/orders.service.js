'use strict';

const path = require('path');
const { parseCSV } = require('./csv.parser');
const { mapRecords } = require('../mappers/semantic.mapper');

const DATA_PATH = path.join(__dirname, '../../data/mock_ordenes_compra.csv');
const RELIABLE_STATES = new Set(['CONFIRMADO', 'TRANSITO']);

function _loadAll() {
  return mapRecords(parseCSV(DATA_PATH)).map((r) => ({
    ...r,
    cantidad_pendiente: Number(r.cantidad_pendiente) || 0,
  }));
}

function _getOrdersBySku(sku) {
  return _loadAll().filter((r) => r.sku === sku);
}

function getReliableOrdersBySku(sku) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return _getOrdersBySku(sku)
    .filter((r) => RELIABLE_STATES.has(r.estado_pedido))
    .map((r) => {
      const isPastDue = new Date(r.fecha_esperada_reposicion) < today;
      return {
        ...r,
        isPastDue,
        inconsistency: isPastDue
          ? `Orden vencida sin recibir: fecha estimada ${r.fecha_esperada_reposicion}, estado ${r.estado_pedido}`
          : null,
      };
    })
    .sort((a, b) => new Date(a.fecha_esperada_reposicion) - new Date(b.fecha_esperada_reposicion));
}

function getUnreliableOrdersBySku(sku) {
  return _getOrdersBySku(sku).filter((r) => !RELIABLE_STATES.has(r.estado_pedido));
}

module.exports = { getReliableOrdersBySku, getUnreliableOrdersBySku };
