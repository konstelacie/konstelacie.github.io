/**
 * Best-effort mailbox provider id for deep-linking to webmail (success page CTA).
 * Keys must match entries in `/email-subscribe-success/config.js` → `providerMap`.
 */
export function guessEmailProviderId(email) {
  const raw = email.split('@')[1];
  if (!raw) return undefined;
  const domain = raw.toLowerCase().trim();
  if (!domain) return undefined;

  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'gmail';

  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com' ||
    domain.endsWith('.outlook.com') ||
    domain.endsWith('.hotmail.com')
  ) {
    return 'outlook';
  }

  if (
    domain === 'yahoo.com' ||
    domain === 'ymail.com' ||
    domain === 'rocketmail.com' ||
    domain.endsWith('.yahoo.com')
  ) {
    return 'yahoo';
  }

  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return 'icloud';

  if (domain === 'proton.me' || domain === 'protonmail.com' || domain === 'pm.me') return 'proton';

  if (domain === 'seznam.cz' || domain.endsWith('.seznam.cz')) return 'seznam';

  if (domain === 'centrum.sk' || domain === 'centrum.cz' || domain.endsWith('.centrum.cz')) return 'centrum';

  if (domain === 'azet.sk' || domain.endsWith('.azet.sk')) return 'azet';

  if (domain === 'zoznam.sk' || domain.endsWith('.zoznam.sk')) return 'zoznam';

  return undefined;
}
