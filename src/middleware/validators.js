const { ApiError } = require('./apiError');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 255;
const MAX_RANGE_DAYS = 31;

function validateSlotId(slotId) {
  const id = parseInt(slotId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'slotId must be a positive integer', 400, { slotId });
  }
  return id;
}

function validateDateRange(from, to) {
  if (!from || !to) {
    throw new ApiError('VALIDATION_ERROR', 'from and to are required (YYYY-MM-DD)', 400);
  }
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new ApiError('VALIDATION_ERROR', 'from and to must be ISO dates (YYYY-MM-DD)', 400);
  }
  const fromDate = new Date(from + 'T00:00:00.000Z');
  const toDate = new Date(to + 'T00:00:00.000Z');
  if (fromDate > toDate) {
    throw new ApiError('VALIDATION_ERROR', 'from must be <= to', 400);
  }
  const days = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new ApiError('VALIDATION_ERROR', `Date range max ${MAX_RANGE_DAYS} days`, 400);
  }
  return { from, to };
}

function validateEmail(email, required = true) {
  if (!email) {
    if (required) throw new ApiError('VALIDATION_ERROR', 'email is required', 400);
    return null;
  }
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LEN) {
    throw new ApiError('VALIDATION_ERROR', 'email must be a valid string up to 255 chars', 400);
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new ApiError('VALIDATION_ERROR', 'email format invalid', 400);
  }
  return email;
}

function validateLockToken(lockToken) {
  if (!lockToken || typeof lockToken !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 'lockToken is required', 400);
  }
  if (lockToken.length !== 36) {
    throw new ApiError('VALIDATION_ERROR', 'lockToken must be 36 chars (UUID)', 400);
  }
  const dashPositions = [8, 13, 18, 23];
  for (const i of dashPositions) {
    if (lockToken[i] !== '-') {
      throw new ApiError('VALIDATION_ERROR', 'lockToken must be UUID format', 400);
    }
  }
  return lockToken;
}

module.exports = {
  validateSlotId,
  validateDateRange,
  validateEmail,
  validateLockToken,
};
