'use strict';

const fs = require('fs');
const path = require('path');

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/mock_schema_semantic.json'), 'utf-8')
);

const { mappings, policies } = schema.semantic_layer;

const technicalToSemantic = {};
for (const entry of mappings) {
  technicalToSemantic[entry.technical_name] = entry;
}

const csvFieldMap = {
  Cantidad_Disponible: 'stock_actual',
  Fecha_Estimada:      'fecha_esperada_reposicion',
  Cantidad_Pendiente:  'cantidad_pendiente',
  SKU:                 'sku',
  Almacen:             'almacen',
  Ubicacion:           'ubicacion',
  Descripcion:         'descripcion',
  Obsoleto:            'obsoleto',
  Proveedor:           'proveedor',
  Estado_Pedido:       'estado_pedido',
  CLIENT_ID_ERP:       'id_cliente',
};

const PII_FIELDS = new Set(['id_cliente', 'client_name', 'cliente']);

function maskValue(value) {
  const str = String(value);
  return str.length <= 2 ? '***' : str.slice(0, 2) + '***';
}

function coerceType(value, type) {
  if (value === undefined || value === null || value === '') return null;
  if (type === 'decimal') return parseFloat(value);
  if (type === 'integer') return parseInt(value, 10);
  if (type === 'date')    return String(value).trim();
  if (type === 'boolean') return String(value).toLowerCase() === 'true';
  return value;
}

function mapRecord(record) {
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const semanticKey =
      csvFieldMap[rawKey] ||
      technicalToSemantic[rawKey]?.semantic_name ||
      rawKey;

    const schemaEntry = Object.values(technicalToSemantic).find(
      (m) => m.semantic_name === semanticKey
    );
    const coerced = schemaEntry ? coerceType(rawValue, schemaEntry.type) : rawValue;

    result[semanticKey] =
      policies.mask_pii && PII_FIELDS.has(semanticKey) ? maskValue(coerced) : coerced;
  }
  return result;
}

function mapRecords(records) {
  return records.map(mapRecord);
}

function getSchemaVersion() {
  return schema.semantic_layer.version;
}

module.exports = { mapRecords, getSchemaVersion };
