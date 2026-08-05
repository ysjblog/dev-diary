import test from 'node:test';
import assert from 'node:assert/strict';
import { taipeiDate } from './date.js';

test('taipeiDate assigns an after-midnight Taipei instant to the new calendar day', () => {
  assert.equal(taipeiDate(new Date('2026-08-04T16:30:00.000Z')), '2026-08-05');
});
