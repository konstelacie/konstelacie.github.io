const { ApiError } = require('../middleware/apiError');
const locksRepo = require('../db/repositories/locksRepo');
const reservationsRepo = require('../db/repositories/reservationsRepo');

/**
 * Reject email if it already has an active reservation or another slot's active lock.
 * @param {string} email validated format
 * @param {{ exceptSlotId?: number, exceptLockToken?: string }} [opts] current hold — excluded from lock duplicate check
 */
async function ensureEmailAvailableForBooking(email, opts = {}) {
  if (await reservationsRepo.hasActiveReservationForEmail(email)) {
    throw new ApiError(
      'EMAIL_HAS_RESERVATION',
      'Email already has an active reservation',
      409
    );
  }
  const { exceptSlotId, exceptLockToken } = opts;
  if (
    await locksRepo.hasActiveLockForEmailExcept(email, exceptSlotId ?? null, exceptLockToken ?? null)
  ) {
    throw new ApiError('EMAIL_HAS_LOCK', 'Email already holds another slot', 409);
  }
}

module.exports = { ensureEmailAvailableForBooking };
