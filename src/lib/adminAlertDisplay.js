function formatDateTimeSk(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Europe/Bratislava',
  }).format(d);
}

function formatMetadataJson(raw) {
  if (raw == null) return '—';
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(raw);
  }
}

function mapAdminAlertRow(row) {
  return {
    id: row.id,
    severity: row.severity,
    type: row.type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    title: row.title,
    message: row.message,
    status: row.status,
    createdAtLabel: formatDateTimeSk(row.created_at),
    updatedAtLabel: formatDateTimeSk(row.updated_at),
    acknowledgedAtLabel: formatDateTimeSk(row.acknowledged_at),
    resolvedAtLabel: formatDateTimeSk(row.resolved_at),
    metadataFormatted: formatMetadataJson(row.metadata_json),
    canAcknowledge: row.status === 'open',
    canResolve: row.status === 'open' || row.status === 'acknowledged',
  };
}

module.exports = {
  mapAdminAlertRow,
  formatDateTimeSk,
  formatMetadataJson,
};
