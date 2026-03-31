function formatAmount(amountCents, currency = 'eur') {
  const amount = (Number(amountCents) / 100).toFixed(2);
  const symbol = String(currency).toUpperCase() === 'EUR' ? '€' : String(currency).toUpperCase();
  return `${amount} ${symbol}`;
}

function formatDateTimeSk(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(d);
}

const INTERNAL_TYPE_LABELS = {
  deposit: 'Záloha / rezervácia',
  full: 'Plná platba',
  topup: 'Doplatok',
  final: 'Finálne',
  correction: 'Oprava',
  refund: 'Vratka',
};

function mapBillingListRow(row) {
  return {
    ...row,
    amountLabel: formatAmount(row.amount_gross_cents, row.currency),
    createdAtLabel: formatDateTimeSk(row.created_at),
    paidAtLabel: formatDateTimeSk(row.paid_at),
    internalTypeLabel: INTERNAL_TYPE_LABELS[row.internal_type] || row.internal_type,
  };
}

function mapBillingDetailRow(row) {
  if (!row) return null;
  return {
    ...row,
    amountLabel: formatAmount(row.amount_gross_cents, row.currency),
    netLabel: formatAmount(row.amount_net_cents, row.currency),
    vatLabel: formatAmount(row.amount_vat_cents, row.currency),
    createdAtLabel: formatDateTimeSk(row.created_at),
    paidAtLabel: formatDateTimeSk(row.paid_at),
    issuedAtLabel: formatDateTimeSk(row.issued_at),
    pdfGeneratedAtLabel: formatDateTimeSk(row.pdf_generated_at),
    emailSentAtLabel: formatDateTimeSk(row.email_sent_at),
    internalTypeLabel: INTERNAL_TYPE_LABELS[row.internal_type] || row.internal_type,
    vatPercentLabel: `${Math.round(Number(row.vat_rate) * 100)} %`,
  };
}

module.exports = {
  mapBillingListRow,
  mapBillingDetailRow,
  formatAmount,
  csvEscape(field) {
    if (field == null) return '';
    const s = String(field);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  },
};
