'use strict';

const fs = require('fs');

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8')
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const record = {};
    headers.forEach((header, i) => {
      record[header] = values[i] !== undefined ? values[i] : null;
    });
    return record;
  });
}

module.exports = { parseCSV };
