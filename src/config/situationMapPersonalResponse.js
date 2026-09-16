/**
 * Copy for the free personal-response email.
 * Working placeholder — do not lock “rada” / “poradenstvo” into status or schema.
 * Personal response is service delivery, not marketing nurture.
 */

const TEMPLATE_ID = 'situation-map-personal-response';
const ENTITY_TYPE = 'situation_map_response';

const emailCopy = {
  subject: 'Osobná odpoveď k tvojej situácii',
  greeting: 'Ahoj {displayName},',
  intro:
    'Ďakujem, že si mi opísal/a svoju situáciu. Tu je moja osobná odpoveď.',
  signoff: 'Michal',
  footerNote:
    'Táto správa je súčasťou bezplatnej odpovede k tvojej Mape situácie. Nie je to marketingový e-mail.',
};

function fillDisplayName(template, displayName) {
  const name = String(displayName || '').trim() || 'tebe';
  return String(template || '').replace(/\{displayName\}/g, name);
}

module.exports = {
  TEMPLATE_ID,
  ENTITY_TYPE,
  emailCopy,
  fillDisplayName,
};
