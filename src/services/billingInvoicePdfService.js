/**
 * MVP billing PDF (predbežné znenie — confirm layout and tax lines with accountant).
 * Embedded Noto Sans (variable TTF) so Slovak / Latin Extended and € render correctly;
 * PDFKit’s built-in Helvetica is WinAnsi-only.
 */

const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../config');

const BODY_FONT = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-VF.ttf');

const LINE_LABELS = {
  deposit: 'Rezervačný poplatok',
  full: 'Platba za sedenie',
  topup: 'Doplatok',
  final: 'Vyúčtovanie',
  correction: 'Oprava',
  refund: 'Vrátenie platby',
};

function formatMoney(cents, currency = 'eur') {
  const amount = (Number(cents) / 100).toFixed(2);
  const code = String(currency).toUpperCase() === 'EUR' ? '€' : String(currency).toUpperCase();
  return `${amount} ${code}`;
}

function formatDateSk(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

function vatRatePercent(row) {
  const r = Number(row.vat_rate);
  if (!Number.isFinite(r)) return '—';
  const percent = r <= 1 ? r * 100 : r;
  return `${Math.round(percent)} %`;
}

function supplierBlock() {
  const s = config.billing?.supplier || {};
  const lines = [];
  if (s.companyName) lines.push(s.companyName);
  if (s.companyAddress) {
    for (const part of s.companyAddress.split(/\r?\n/)) {
      if (part.trim()) lines.push(part.trim());
    }
  }
  if (s.ico) lines.push(`IČO: ${s.ico}`);
  if (s.dic) lines.push(`DIČ: ${s.dic}`);
  if (s.icDph) lines.push(`IČ DPH: ${s.icDph}`);
  if (lines.length === 0) {
    lines.push('Údaje dodávateľa: doplniť v prostredí (BILLING_INVOICE_*).');
  }
  return lines;
}

/**
 * @param {object} row - billing_documents row (with document_number set)
 * @returns {Promise<Buffer>}
 */
function renderBillingPdf(row) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font(BODY_FONT);

    const lineLabel = LINE_LABELS[row.internal_type] || row.internal_type;

    doc.fontSize(9).fillColor('#64748b').text('citimtedasom.sk — interný platobný doklad (MVP)', { align: 'right' });
    doc.fillColor('#000000');
    doc.moveDown(0.5);
    doc.fontSize(16).text('Platobný doklad', { align: 'center' });
    doc.fontSize(10).fillColor('#475569').text('Predbežné znenie — overiť s účtovníkom.', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    doc.fontSize(11).text('Dodávateľ', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    for (const line of supplierBlock()) {
      doc.text(line, { continued: false });
    }
    doc.moveDown(1);

    doc.fontSize(11).text('Odberateľ', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`E-mail: ${row.customer_email_snapshot}`);
    if (row.customer_name_snapshot) {
      doc.text(`Meno: ${row.customer_name_snapshot}`);
    }
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Číslo dokladu: ${row.document_number}`);
    doc.text(`Dátum úhrady: ${formatDateSk(row.paid_at)}`);
    doc.text(`Referencia platby (Stripe Checkout): ${row.stripe_checkout_session_id}`);
    if (row.stripe_payment_intent_id) {
      doc.text(`Stripe PaymentIntent: ${row.stripe_payment_intent_id}`);
    }
    doc.moveDown(0.8);

    doc.fontSize(11).text('Položka', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(`${lineLabel}`);
    doc.moveDown(0.8);

    const net = formatMoney(row.amount_net_cents, row.currency);
    const vat = formatMoney(row.amount_vat_cents, row.currency);
    const gross = formatMoney(row.amount_gross_cents, row.currency);

    doc.text(`Základ DPH: ${net}`);
    doc.text(`DPH (${vatRatePercent(row)}): ${vat}`);
    doc.fontSize(11).text(`Celkom: ${gross}`, { continued: false });
    doc.moveDown(1.5);

    doc.fontSize(8).fillColor('#64748b');
    doc.text(
      'Tento dokument slúži na internú evidenciu a komunikáciu so zákazníkom. Právna a účtovná klasifikácia musí byť potvrdená účtovníkom.',
      { align: 'left' }
    );
    doc.end();
  });
}

module.exports = { renderBillingPdf, formatMoney, LINE_LABELS };
