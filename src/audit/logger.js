'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_FILE = path.join(__dirname, '../../logs/audit.jsonl');

let prevHash = '0';

function writeEntry(entry) {
  const line = JSON.stringify({ ...entry, prevHash }) + '\n';
  prevHash = crypto.createHash('sha256').update(line).digest('hex');
  fs.appendFileSync(LOG_FILE, line, 'utf-8');
}

function logToolInvocation({ agentId, tool, input, status, result, durationMs }) {
  writeEntry({
    type:        'TOOL_INVOCATION',
    timestamp:   new Date().toISOString(),
    agentId,
    tool,
    input,
    status,
    result,
    duration_ms: durationMs,
  });
}

function logSecurityEvent({ agentId, event, reason, context = {} }) {
  writeEntry({
    type:      'SECURITY_EVENT',
    timestamp: new Date().toISOString(),
    agentId,
    event,
    reason,
    context,
  });
}

function logDataInconsistency({ agentId, tool, inconsistencies }) {
  writeEntry({
    type:            'DATA_INCONSISTENCY',
    timestamp:       new Date().toISOString(),
    agentId,
    tool,
    inconsistencies,
  });
}

module.exports = { logToolInvocation, logSecurityEvent, logDataInconsistency };
