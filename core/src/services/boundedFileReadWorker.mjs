import { openSync, closeSync, fstatSync, readSync } from 'node:fs';

const path = process.argv[2];
const maxBytes = Number(process.argv[3]);
const tail = process.argv[4] === '--tail';
if (!path || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024) process.exit(2);
let descriptor;
try {
  descriptor = openSync(path, 'r');
  const size = fstatSync(descriptor).size;
  if (size > maxBytes && !tail) process.exit(3);
  const length = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(length);
  const offset = tail ? Math.max(0, size - length) : 0;
  let position = 0;
  while (position < length) {
    const bytesRead = readSync(descriptor, buffer, position, length - position, offset + position);
    if (bytesRead <= 0) break;
    position += bytesRead;
  }
  process.stdout.write(buffer.subarray(0, position));
} catch {
  process.exit(4);
} finally {
  if (descriptor !== undefined) {
    try { closeSync(descriptor); } catch { /* process exit closes it */ }
  }
}
