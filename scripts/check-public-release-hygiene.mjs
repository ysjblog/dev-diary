#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const scriptRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function listWorktreePaths(root) {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' })
  return output.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice(9))
}

export function privateIdentityMatchers({ root = scriptRoot, home = homedir(), worktrees = listWorktreePaths(root) } = {}) {
  const account = basename(home)
  const escapedAccount = account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    ...new Set(worktrees.map((path) => resolve(path))),
    resolve(home),
    new RegExp(`/Volumes/[^\\s"']+/${escapedAccount}(?:/|\\b)`, 'u'),
  ]
}

export function findPrivateIdentity(text, matchers = privateIdentityMatchers()) {
  for (const matcher of matchers) {
    if (typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text)) return String(matcher)
  }
  return null
}

export async function scanPublicFiles(paths, { root = scriptRoot, matchers = privateIdentityMatchers({ root }) } = {}) {
  const violations = []
  for (const path of paths) {
    if (path.startsWith('docs/specs/legacy/')) continue
    const contents = await readFile(resolve(root, path)).catch(() => null)
    if (!contents || contents.includes(0)) continue
    const match = findPrivateIdentity(contents.toString('utf8'), matchers)
    if (match) violations.push({ path, match })
  }
  return violations
}

export function listPublicCandidateFiles(root = scriptRoot) {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

async function main(argv) {
  const releaseNotesIndex = argv.indexOf('--release-notes')
  const releaseNotesPath = releaseNotesIndex >= 0 ? argv[releaseNotesIndex + 1] : null
  if (releaseNotesIndex >= 0 && !releaseNotesPath) throw new Error('--release-notes requires a file path')

  const violations = await scanPublicFiles(listPublicCandidateFiles())
  if (releaseNotesPath) {
    const body = await readFile(resolve(releaseNotesPath), 'utf8')
    const match = findPrivateIdentity(body)
    if (match) violations.push({ path: releaseNotesPath, match })
  }
  if (violations.length) {
    for (const violation of violations) console.error(`private identity found in ${violation.path}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
