'use strict';

const ROLE_PERMISSIONS = {
  ADMIN: {
    can_query_stock:         true,
    can_query_orders:        true,
    can_query_all_clients:   true,
    can_view_reserved_stock: true,
  },
  SALES_AGENT: {
    can_query_stock:         true,
    can_query_orders:        true,
    can_query_all_clients:   true,
    can_view_reserved_stock: false,
  },
  VIEWER: {
    can_query_stock:         true,
    can_query_orders:        false,
    can_query_all_clients:   false,
    can_view_reserved_stock: false,
  },
};

const AGENT_ROLES = {
  'agent-orchestrator': 'SALES_AGENT',
  'agent-admin':        'ADMIN',
  'agent-readonly':     'VIEWER',
};

function getRole(agentId) {
  return AGENT_ROLES[agentId] || 'VIEWER';
}

function can(agentId, permission) {
  const perms = ROLE_PERMISSIONS[getRole(agentId)];
  return perms ? perms[permission] === true : false;
}

function assertCan(agentId, permission) {
  if (!can(agentId, permission)) {
    throw new Error(
      `RBAC: acceso denegado — agente '${agentId}' (rol: ${getRole(agentId)}) no tiene permiso '${permission}'`
    );
  }
}

module.exports = { getRole, can, assertCan };
