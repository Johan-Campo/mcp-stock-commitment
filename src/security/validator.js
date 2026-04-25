'use strict';

const SKU_PATTERN    = /^[A-Z0-9\-]{1,20}$/;
const CLIENT_PATTERN = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.]{1,100}$/;

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all)\s+instructions/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b|\bEXEC\b/i,
  /<script/i,
  /\$\{.*?\}/,
  /--\s/,
  /;\s*(DROP|SELECT|INSERT|DELETE)/i,
];

function containsInjection(value) {
  return INJECTION_PATTERNS.some((p) => p.test(value));
}

function validateInput({ sku, quantity, client_name }) {
  const errors = [];

  if (!sku || typeof sku !== 'string') {
    errors.push('SKU es requerido');
  } else if (!SKU_PATTERN.test(sku.trim())) {
    errors.push('SKU inválido: solo letras mayúsculas, números y guiones (máx. 20 caracteres)');
  } else if (containsInjection(sku)) {
    errors.push('SKU contiene patrones no permitidos');
  }

  if (quantity === undefined || quantity === null) {
    errors.push('Cantidad es requerida');
  } else {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.push('Cantidad debe ser un entero positivo');
    } else if (qty > 1_000_000) {
      errors.push('Cantidad excede el límite permitido (máx. 1,000,000)');
    }
  }

  if (!client_name || typeof client_name !== 'string') {
    errors.push('Nombre de cliente es requerido');
  } else if (!CLIENT_PATTERN.test(client_name.trim())) {
    errors.push('Nombre de cliente contiene caracteres no permitidos');
  } else if (containsInjection(client_name)) {
    errors.push('Nombre de cliente contiene patrones no permitidos');
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    sanitized: valid
      ? { sku: sku.trim().toUpperCase(), quantity: Number(quantity), client_name: client_name.trim() }
      : null,
  };
}

module.exports = { validateInput };
