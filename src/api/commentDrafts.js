const PREFIX = 'devdiary:comment-draft:';

function key(projectId) {
  return `${PREFIX}${projectId}`;
}

export function readCommentDraft(storage, projectId) {
  if (!storage || projectId == null) return { text: '', tag: 'UI/UX' };
  try {
    const raw = storage.getItem(key(projectId));
    if (!raw) return { text: '', tag: 'UI/UX' };
    const value = JSON.parse(raw);
    if (!value || typeof value.text !== 'string' || typeof value.tag !== 'string') throw new Error('invalid draft');
    return { text: value.text, tag: value.tag };
  } catch {
    try { storage.removeItem(key(projectId)); } catch {}
    return { text: '', tag: 'UI/UX' };
  }
}

export function writeCommentDraft(storage, projectId, draft) {
  if (!storage || projectId == null) return;
  const text = typeof draft?.text === 'string' ? draft.text : '';
  const tag = typeof draft?.tag === 'string' && draft.tag ? draft.tag : 'UI/UX';
  if (!text) return clearCommentDraft(storage, projectId);
  storage.setItem(key(projectId), JSON.stringify({ text, tag }));
}

export function clearCommentDraft(storage, projectId) {
  if (!storage || projectId == null) return;
  storage.removeItem(key(projectId));
}
