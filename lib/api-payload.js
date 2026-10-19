// The settings page posts `{ op, args }` (see `api()` in client.js), while the
// route handlers read operation fields directly. Accept both shapes so the
// bundle and the host cannot drift apart again — and so a hand-written probe
// or a future client that flattens the body still lands on the same fields.
export function requestArgs(payload) {
  if (!payload || typeof payload !== 'object') return {}
  const args = payload.args
  return args && typeof args === 'object' && !Array.isArray(args) ? args : payload
}

