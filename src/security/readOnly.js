'use strict';

const WRITE_OPERATIONS = new Set([
  'insert', 'update', 'delete', 'drop', 'truncate',
  'create', 'alter', 'exec', 'execute', 'write', 'patch',
]);

function assertReadOnly(operation) {
  const op = (operation || '').trim().toLowerCase();
  if (!op || WRITE_OPERATIONS.has(op)) {
    throw new Error(
      `READ-ONLY: operación '${operation}' bloqueada — este servidor MCP es de solo lectura`
    );
  }
}

module.exports = { assertReadOnly };
