import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGED_RELEASE_ID = 'paged-corporate-actions-v4';
export interface PagedLaunchPlan {
  version: 1; releaseId: typeof PAGED_RELEASE_ID; programSha256: string;
  operationId: string; scale33: boolean; lateCoupon: boolean; rpcUrl: string; dataDirectory: string;
}
interface LaunchOptions { root: string; dataDirectory: string; rpcUrl: string; release: unknown; scale33?: boolean; lateCoupon?: boolean; operationId?: string }

export function reviewedPagedRelease(value: unknown): { releaseId: typeof PAGED_RELEASE_ID; sha256: string } {
  const release = value as { releaseId?: unknown; sha256?: unknown } | null;
  if (!release || release.releaseId !== PAGED_RELEASE_ID || typeof release.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('Paged lifecycle requires the current reviewed paged-corporate-actions-v4 release');
  return { releaseId: PAGED_RELEASE_ID, sha256: release.sha256 };
}

/** No existing default/legacy data namespace is admitted by a release-name substring. */
export function assertPagedDemoNamespace(directory: string, root: string, release?: unknown): void {
  const dataPath = path.resolve(root, directory), ignoredRoot = path.resolve(root, '.local'), relative = path.relative(ignoredRoot, dataPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Data must use an isolated ignored paged-demo namespace');
  if (relative.split(path.sep)[0] === 'paged-demo') return;
  const reviewed = reviewedPagedRelease(release), exact = path.resolve(ignoredRoot, 'backend-execution', reviewed.sha256.slice(0, 12), 'data');
  if (dataPath !== exact) throw new Error('Data must use .local/paged-demo or the exact reviewed v4 backend-execution hash/data namespace');
}

export function makePagedLaunchPlan(options: LaunchOptions): PagedLaunchPlan {
  const release = reviewedPagedRelease(options.release), scale33 = options.scale33 ?? false, lateCoupon = options.lateCoupon ?? false;
  if (typeof scale33 !== 'boolean' || typeof lateCoupon !== 'boolean') throw new Error('Paged lifecycle flags must be booleans');
  const operationId = options.operationId ?? `paged_lifecycle_${scale33 ? 'scale33' : 'quick'}${lateCoupon ? '_late' : ''}_v4`;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(operationId)) throw new Error('Operation ID must contain 8 to 80 safe characters');
  const endpoint = new URL(options.rpcUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Use a plain loopback localnet RPC URL');
  const dataDirectory = path.resolve(options.root, options.dataDirectory);
  assertPagedDemoNamespace(dataDirectory, options.root, release);
  return { version: 1, releaseId: PAGED_RELEASE_ID, programSha256: release.sha256, operationId, scale33, lateCoupon, rpcUrl: endpoint.href, dataDirectory };
}

export function assertSamePagedLaunchPlan(saved: unknown, candidate: PagedLaunchPlan): void {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || Object.keys(saved).length !== Object.keys(candidate).length || Object.entries(candidate).some(([key, value]) => (saved as Record<string, unknown>)[key] !== value)) throw new Error('Saved paged lifecycle ID has different flags, release or runtime. Preserve its plan/signatures and resume the original command');
}

export function pagedDemoArguments(plan: PagedLaunchPlan): string[] {
  return [...(plan.scale33 ? ['--scale33'] : []), ...(plan.lateCoupon ? ['--late-coupon'] : []), '--operation-id', plan.operationId];
}

function safeDirectory(directory: string): void {
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) { const stat = fs.lstatSync(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Paged lifecycle paths cannot traverse links or non-directories'); }
    else fs.mkdirSync(current);
  }
}

/** Writes only a public immutable launcher plan; it performs no RPC or financial action. */
export function retainPagedLaunchPlan(options: LaunchOptions): { plan: PagedLaunchPlan; planFile: string; args: string[] } {
  const plan = makePagedLaunchPlan(options), publicDirectory = path.join(plan.dataDirectory, 'paged-demo-public');
  safeDirectory(publicDirectory);
  const planFile = path.join(publicDirectory, `launcher-${plan.operationId}.json`);
  if (!fs.existsSync(planFile)) {
    let descriptor: number | undefined;
    try { descriptor = fs.openSync(planFile, 'wx', 0o600); fs.writeSync(descriptor, JSON.stringify(plan, null, 2) + '\n'); fs.fsyncSync(descriptor); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  const stat = fs.lstatSync(planFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error('Invalid saved paged lifecycle plan file');
  assertSamePagedLaunchPlan(JSON.parse(fs.readFileSync(planFile, 'utf8')), plan);
  return { plan, planFile, args: pagedDemoArguments(plan) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = process.argv.slice(2), named: Record<string, string | boolean> = {};
    for (let index = 0; index < args.length; index++) {
      const key = args[index];
      if (Object.hasOwn(named, key) || !['--data-directory', '--rpc-url', '--operation-id', '--scale33', '--late-coupon'].includes(key)) throw new Error('Unsupported or duplicate paged launcher option');
      named[key] = key === '--scale33' || key === '--late-coupon' ? true : args[++index];
      if (named[key] === undefined) throw new Error('Missing paged launcher argument');
    }
    if (typeof named['--data-directory'] !== 'string' || typeof named['--rpc-url'] !== 'string') throw new Error('Explicit runtime data and RPC are required');
    const root = process.cwd(), release = JSON.parse(fs.readFileSync(path.join(root, 'programs/bondtrace/release.json'), 'utf8'));
    console.log(JSON.stringify(retainPagedLaunchPlan({ root, release, dataDirectory: named['--data-directory'], rpcUrl: named['--rpc-url'], scale33: named['--scale33'] === true, lateCoupon: named['--late-coupon'] === true, ...(typeof named['--operation-id'] === 'string' ? { operationId: named['--operation-id'] } : {}) })));
  } catch (error) { console.error(error instanceof Error ? error.message : 'Paged launcher plan failed'); process.exitCode = 1; }
}
