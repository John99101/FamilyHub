// Tests for public/js/group-errors.js: a failed group call gets a text that says why.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupErrorKey } from '../public/js/group-errors.js';

const err = (code, message) => ({ code: `functions/${code}`, message });

describe('why a group call failed', () => {
  it('keeps the reasons the server gives', () => {
    assert.equal(groupErrorKey(err('resource-exhausted', 'too-many-groups')), 'start.err.tooManyGroups');
    assert.equal(groupErrorKey(err('permission-denied', 'wrong')), 'start.err.wrongCode');
    assert.equal(groupErrorKey(err('resource-exhausted', 'locked')), 'start.err.locked');
  });

  it('tells a stale sign in from a failed App Check', () => {
    assert.equal(groupErrorKey(err('unauthenticated', 'signin')), 'start.err.signin');
    assert.equal(groupErrorKey(err('unauthenticated', 'Unauthenticated')), 'start.err.check');
  });

  it('says so when the function is missing or closed', () => {
    assert.equal(groupErrorKey(err('not-found', 'not-found')), 'start.err.server');
    assert.equal(groupErrorKey(err('permission-denied', 'permission-denied')), 'start.err.server');
  });

  it('says so when there is no connection', () => {
    assert.equal(groupErrorKey(err('unavailable', 'unavailable')), 'common.offline');
  });

  it('falls back to the plain text for everything else', () => {
    assert.equal(groupErrorKey(err('internal', 'failed')), 'start.err.failed');
    assert.equal(groupErrorKey(err('permission-denied', 'admin'), 'common.saveFailed'), 'common.saveFailed');
    assert.equal(groupErrorKey(undefined), 'start.err.failed');
  });
});
