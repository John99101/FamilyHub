// Checks which paths the app puts under the active group.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scopedPath } from '../public/js/scope.js';

describe('paths of the active group', () => {
  it('group data goes under groups/{g}/', () => {
    assert.equal(scopedPath('rooms/familie/messages', 'g1'), 'groups/g1/rooms/familie/messages');
    assert.equal(scopedPath('households/h1/events', 'g1'), 'groups/g1/households/h1/events');
    assert.equal(scopedPath('config/digest', 'g1'), 'groups/g1/config/digest');
    assert.equal(scopedPath('config/translate', 'g1'), 'groups/g1/config/translate');
  });

  it('markets, nicknames and the groups themselves stay outside', () => {
    for (const path of ['market/latest', 'marketHistory/AAPL', 'marketAccess/u1', 'nicknames/u1',
      'config/watchlist', 'config/market', 'groups/g2', 'groups/g2/members/u1']) {
      assert.equal(scopedPath(path, 'g1'), path);
    }
  });

  it('a look alike name is still group data', () => {
    assert.equal(scopedPath('marketing/x', 'g1'), 'groups/g1/marketing/x');
    assert.equal(scopedPath('config/marketplace', 'g1'), 'groups/g1/config/marketplace');
  });

  it('without a chosen group, group data cannot be reached', () => {
    assert.throws(() => scopedPath('rooms/familie', ''), /No group/);
  });
});
