// Mirrors backend/partsible/auth/password_policy.py; login is deliberately exempt.
export const validNewPassword = (password) => (
  [...password].length >= 8
  && new TextEncoder().encode(password).length <= 72
  && /[A-Z]/.test(password)
  && /[a-z]/.test(password)
  && /\p{Decimal_Number}/u.test(password)
  && /[^\p{L}\p{N}_\p{White_Space}\u001c-\u001f]/u.test(password)
);
