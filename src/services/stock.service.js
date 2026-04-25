'use strict';

const path = require('path');
const { parseCSV } = require('./csv.parser');
const { mapRecords } = require('../mappers/semantic.mapper');

const DATA_PATH = path.join(__dirname, '../../data/mock_stocks.csv');
const RESTRICTED_WAREHOUSES = new Set(['ALM-RESERVADO']);

function _loadAll() {
  return mapRecords(parseCSV(DATA_PATH)).map((r) => ({
    ...r,
    stock_actual: Number(r.stock_actual) || 0,
  }));
}

function getAvailableStockBySku(sku) {
  return _loadAll().filter((r) => r.sku === sku && !RESTRICTED_WAREHOUSES.has(r.almacen));
}

function getTotalAvailableBySku(sku) {
  return getAvailableStockBySku(sku).reduce((sum, r) => sum + r.stock_actual, 0);
}

function getTotalReservedBySku(sku) {
  return _loadAll()
    .filter((r) => r.sku === sku && RESTRICTED_WAREHOUSES.has(r.almacen))
    .reduce((sum, r) => sum + r.stock_actual, 0);
}

module.exports = { getAvailableStockBySku, getTotalAvailableBySku, getTotalReservedBySku };
