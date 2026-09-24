import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexCliResumeDispatcher } from '../src/services/codexDesktopResumeEngine.js';

const target = '0190abcd-ef00-7000-8000-000000000001';
const messageId = '0190abcd-ef00-7000-8000-000000000002';
const receipt = `Queued message ${messageId} for thread ${target}.\n`;
const dirs: string[] = [];
const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function fixture(body: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'codex-queue-'))); dirs.push(root);
  const binary = join(root, 'fake-codex'); writeFileSync(binary, `#!/bin/sh\n${body}\n`); chmodSync(binary, 0o700);
  return { root, binary, context: { codexHome: root } };
}

describe('Codex durable queue transport', () => {
  it('passes exact argv and verified store and waits for exit-zero receipt', async () => {
    const { root, binary, context } = fixture(`printf '%s\\n' "$@" > "$CODEX_HOME/argv"\nprintf '%s\\n' "$CODEX_HOME" > "$CODEX_HOME/store"\nprintf '%s' ${quote(receipt)}`);
    expect(await createCodexCliResumeDispatcher(binary)(target, context)).toEqual({ accepted: true, code: 'queued' });
    expect(readFileSync(join(root, 'argv'), 'utf8').trim().split('\n')).toEqual(['queue', '--thread', target, '--message', '繼續']);
    expect(readFileSync(join(root, 'store'), 'utf8').trim()).toBe(root);
  });
  it.each([
    ['wrong target', receipt.replace(target, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')],
    ['wrong message UUID', receipt.replace(messageId, 'invalid')],
    ['missing newline', receipt.trimEnd()],
    ['duplicate receipt', receipt + receipt],
    ['extra output', receipt + 'extra\n'],
    ['extra blank line', receipt + '\n'],
    ['legacy acknowledgement', '{"type":"turn.started"}\n'],
    ['uppercase message UUID', receipt.replace(messageId, messageId.toUpperCase())],
    ['empty', ''],
  ])('rejects %s without returning private output', async (_name, output) => {
    const { binary, context } = fixture(`printf '%s' ${quote(output)}`);
    expect(await createCodexCliResumeDispatcher(binary)(target, context)).toEqual({ accepted: false, code: 'codex_resume_queue_receipt_invalid' });
  });
  it('accepts a split CRLF receipt only after normal child close', async () => {
    const text = receipt.replace('\n', '\r\n'); const half = Math.floor(text.length / 2);
    const { binary, context } = fixture(`printf '%s' ${quote(text.slice(0, half))}\nsleep 0.02\nprintf '%s' ${quote(text.slice(half))}`);
    expect(await createCodexCliResumeDispatcher(binary)(target, context)).toEqual({ accepted: true, code: 'queued' });
  });
  it('does not accept receipt followed by exit failure', async () => {
    const { binary, context } = fixture(`printf '%s' ${quote(receipt)}\nexit 7`);
    expect(await createCodexCliResumeDispatcher(binary)(target, context)).toEqual({ accepted: false, code: 'codex_resume_command_failed' });
  });
  it.each([
    ['thread-store conflict: active writer /private/path secret_token=redacted-fixture', 'codex_resume_active_writer'],
    ["error: unrecognized subcommand 'queue'", 'codex_resume_queue_unsupported'],
    ['failed to read thread: no rollout found for thread id fixture', 'codex_resume_session_not_found'],
    ['not logged in: token=redacted-fixture', 'codex_resume_auth_required'],
    ['unknown private diagnostic', 'codex_resume_command_failed'],
  ])('classifies diagnostics without exposing raw text: %s', async (diagnostic, code) => {
    const { binary, context } = fixture(`printf '%s' ${quote(diagnostic)} >&2\nexit 1`);
    expect(await createCodexCliResumeDispatcher(binary)(target, context)).toEqual({ accepted: false, code });
  });
  it('refuses absent or unverified store before spawning', async () => {
    const { binary, root } = fixture('touch spawned');
    expect(await createCodexCliResumeDispatcher(binary)(target, undefined as never)).toEqual({ accepted: false, code: 'codex_resume_store_unverified' });
    expect(await createCodexCliResumeDispatcher(binary)(target, { codexHome: 'relative' })).toEqual({ accepted: false, code: 'codex_resume_store_unverified' });
    expect(existsSync(join(root, 'spawned'))).toBe(false);
  });
  it('bounds stderr and confirms child stopped before releasing the lease', async () => {
    const { binary, context } = fixture("trap '' TERM\nhead -c 17000 /dev/zero >&2\nwhile :; do :; done");
    expect(await createCodexCliResumeDispatcher(binary, { terminationGraceMs: 100 })(target, context)).toEqual({ accepted: false, code: 'codex_resume_output_too_large', releaseLease: true });
  });
  it('does not accept a receipt while the child remains alive past its deadline', async () => {
    const { binary, context } = fixture(`printf '%s' ${quote(receipt)}\nsleep 20`);
    expect(await createCodexCliResumeDispatcher(binary, { ackTimeoutMs: 100, terminationGraceMs: 100 })(target, context)).toEqual({ accepted: false, code: 'codex_resume_ack_timeout', releaseLease: true });
  });
  it('does not release a lease on parent close while a pipe-detached descendant survives', async () => {
    const { binary, root, context } = fixture(`printf '%s' "$$" > "$CODEX_HOME/group"
/bin/sh -c 'trap "" TERM; exec >/dev/null 2>&1; while :; do :; done' &
sleep 0.03
exit 1`);
    const start = Date.now();
    const result = await createCodexCliResumeDispatcher(binary, { terminationGraceMs: 150 })(target, context);
    expect(result.accepted).toBe(false);
    expect(Date.now() - start).toBeGreaterThanOrEqual(130);
    const group = Number(readFileSync(join(root, 'group'), 'utf8'));
    let absent = false;
    try { process.kill(-group, 0); } catch (error) { absent = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
    if (result.releaseLease !== false) expect(absent).toBe(true);
    else expect(result.code).toMatch(/_process_unterminated$/);
  });

  it('accepts an exact receipt and normal exit only after bounded descendant cleanup', async () => {
    const { binary, context, root } = fixture(`printf '%s' ${quote(receipt)}
/bin/sh -c 'trap "" TERM; exec >/dev/null 2>&1; while :; do :; done' &
printf '%s' "$$" > "$CODEX_HOME/group"
sleep 0.03
exit 0`);
    const result = await createCodexCliResumeDispatcher(binary, { ackTimeoutMs: 1000, terminationGraceMs: 1200 })(target, context);
    expect(result).toEqual({ accepted: true, code: 'queued' });
    const group = Number(readFileSync(join(root, 'group'), 'utf8'));
    let code: string | undefined;
    try { process.kill(-group, 0); } catch (error) { code = (error as NodeJS.ErrnoException).code; }
    expect(code).toBe('ESRCH');
  });

});
