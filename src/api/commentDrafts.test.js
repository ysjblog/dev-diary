import assert from 'node:assert/strict';
import test from 'node:test';
import { clearCommentDraft, readCommentDraft, writeCommentDraft } from './commentDrafts.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

test('comment drafts are project-scoped and only clear explicitly', () => {
  const local = storage();
  writeCommentDraft(local, 1, { text: '第一個專案草稿', tag: 'Bug' });
  writeCommentDraft(local, 2, { text: '第二個專案草稿', tag: 'UI/UX' });
  assert.deepEqual(readCommentDraft(local, 1), { text: '第一個專案草稿', tag: 'Bug' });
  assert.deepEqual(readCommentDraft(local, 2), { text: '第二個專案草稿', tag: 'UI/UX' });
  clearCommentDraft(local, 1);
  assert.deepEqual(readCommentDraft(local, 1), { text: '', tag: 'UI/UX' });
  assert.deepEqual(readCommentDraft(local, 2), { text: '第二個專案草稿', tag: 'UI/UX' });
});

test('malformed comment draft is discarded safely', () => {
  const local = storage();
  local.setItem('devdiary:comment-draft:1', '{bad');
  assert.deepEqual(readCommentDraft(local, 1), { text: '', tag: 'UI/UX' });
  assert.equal(local.values.has('devdiary:comment-draft:1'), false);
});
