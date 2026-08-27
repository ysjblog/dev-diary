import { openDb } from '../db/index.js';
import { resolveCanonicalActivityDataRoots } from './agentDetection.js';
import { getSettings } from './settings.js';
import { createConfiguredScanProvider, runManualScan } from './scans.js';

function fail(): never {
  process.stderr.write('Scan worker failed.\n');
  process.exit(1);
}

const dbPath = process.env.DEVDIARY_DB;
if (!dbPath || dbPath === ':memory:') fail();
let request: { scope: 'global' | 'project'; projectId?: number; today: string };
try {
  request = JSON.parse(process.argv[2] ?? '');
} catch {
  fail();
}
if ((request.scope !== 'global' && request.scope !== 'project') || !/^\d{4}-\d{2}-\d{2}$/.test(request.today)) fail();
if (request.scope === 'project' && (!Number.isSafeInteger(request.projectId) || Number(request.projectId) < 1)) fail();

const db = openDb(dbPath);
try {
  const runtime = { activeDbPath: dbPath, projectRoots: [] };
  const settings = getSettings(db, runtime);
  const provider = createConfiguredScanProvider({
    DEVDIARY_DB: dbPath,
    DEVDIARY_SCAN_PROVIDER: settings.scan_provider.provider,
    DEVDIARY_SCAN_FALLBACK: settings.scan_provider.fallback,
  }, {
    dataRoots: Object.fromEntries(settings.agents.map((agent) => [agent.id, resolveCanonicalActivityDataRoots(agent.id, agent.sources)])),
  }, db);
  const result = runManualScan(db, {
    scope: request.scope,
    projectId: request.projectId,
    today: request.today,
    provider,
    projectRoots: request.scope === 'global' ? settings.project_roots : undefined,
    projectDocFilenames: settings.project_doc_filenames,
    projectDocFolders: settings.project_doc_folders,
  });
  process.stdout.write(JSON.stringify(result));
} catch {
  fail();
} finally {
  db.close();
}
