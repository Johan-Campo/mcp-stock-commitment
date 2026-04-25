'use strict';

const path = require('path');
const { parseCSV } = require('./csv.parser');
const { mapRecords } = require('../mappers/semantic.mapper');

const DATA_PATH = path.join(__dirname, '../../data/mock_articulos.csv');

function _loadAll() {
  return mapRecords(parseCSV(DATA_PATH)).map((r) => ({
    ...r,
    obsoleto: String(r.obsoleto).toLowerCase() === 'true',
  }));
}

function getArticulo(sku) {
  return _loadAll().find((r) => r.sku === sku) || null;
}

module.exports = { getArticulo };
