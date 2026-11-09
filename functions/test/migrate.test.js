// Tests for the one time move into the group "Familie": who becomes a
// member and which data is copied (the copying itself was tried on the emulator).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planMembers, belongsToGroup } from '../migrate.js';

describe('moving the family into a group', () => {
  it('keeps admins as admins, finds people by their people document or account, lists the rest', async () => {
    const access = { admins: ['Chef@Example.com'], members: ['anna@example.com', 'ben@example.com', 'chef@example.com'] };
    const people = [{ uid: 'u_anna', mail: 'anna@example.com', name: 'Anna' }];
    const accounts = { 'chef@example.com': { uid: 'u_chef', name: 'Chef' } };
    const { members, missing } = await planMembers(access, people, async (mail) => accounts[mail] || null);
    assert.deepEqual(members, [
      { uid: 'u_chef', mail: 'chef@example.com', name: 'Chef', role: 'admin' },
      { uid: 'u_anna', mail: 'anna@example.com', name: 'Anna', role: 'member' },
    ]);
    assert.deepEqual(missing, ['ben@example.com']);
  });

  it('copies family data and the group switches, not markets, accounts or the old allow list', () => {
    for (const col of ['rooms', 'events', 'people', 'households', 'days', 'translations']) assert.ok(belongsToGroup(col, 'x'), col);
    for (const col of ['groups', 'groupCodes', 'groupSecrets', 'nicknames', 'market', 'marketHistory', 'marketAccess', 'translateUsage']) {
      assert.ok(!belongsToGroup(col, 'x'), col);
    }
    assert.ok(belongsToGroup('config', 'digest'));
    assert.ok(belongsToGroup('config', 'translate'));
    for (const id of ['access', 'watchlist', 'market']) assert.ok(!belongsToGroup('config', id), id);
  });
});
