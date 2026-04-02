const { ApiError } = require('../middleware/apiError');

/** Slovak copy for public API; clients map by `error` code in booking.js. */
const BOOKING_REQUEST_CANNOT_COMPLETE_MSG =
  'Požiadavku nebolo možné dokončiť. Skús to prosím znova alebo vyber iný termín.';

/**
 * Generic failure for booking flows where the response must not reveal whether a slot exists,
 * invalid tokens, or internal state (see docs/security/booking.md).
 * @param {number} [statusCode]
 */
function bookingCannotCompleteError(statusCode = 409) {
  return new ApiError('REQUEST_CANNOT_COMPLETE', BOOKING_REQUEST_CANNOT_COMPLETE_MSG, statusCode);
}

module.exports = {
  BOOKING_REQUEST_CANNOT_COMPLETE_MSG,
  bookingCannotCompleteError,
};
