// Why a call to a group function (start, join, new password) failed, as the
// key of a text the person can act on. No DOM here, so it can be tested.

/** err: what callFunction threw (code 'functions/...', message = the server's reason, as in "wrong [403]"). */
export function groupErrorKey(err, fallback = 'start.err.failed') {
  const code = String(err?.code || '').replace('functions/', '');
  // The Firebase library adds the HTTP status to the reason.
  const reason = String(err?.message || '').replace(/ \[\d+\]$/, '');
  if (reason === 'too-many-groups') return 'start.err.tooManyGroups';
  if (reason === 'wrong') return 'start.err.wrongCode';
  if (reason === 'locked') return 'start.err.locked';
  // Our own check of the sign in says "signin"; any other refusal comes from App Check.
  if (code === 'unauthenticated') return reason === 'signin' ? 'start.err.signin' : 'start.err.check';
  // Without a reason of ours: the function is not deployed or not open to the website.
  if (code === 'not-found' || (code === 'permission-denied' && reason === code)) return 'start.err.server';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'common.offline';
  return fallback;
}
