import { openSync, closeSync, fstatSync, readFileSync } from 'node:fs';

const path = process.argv[2];
const maxBytes = Number(process.argv[3]);
if (!path || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024) process.exit(2);
let descriptor;
try {
  descriptor = openSync(path, 'r');
  if (fstatSync(descriptor).size > maxBytes) process.exit(3);
  process.stdout.write(readFileSync(descriptor));
} catch {
  process.exit(4);
} finally {
  if (descriptor !== undefined) {
    try { closeSync(descriptor); } catch { /* process exit closes it */ }
  }
}
