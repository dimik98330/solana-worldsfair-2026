import type {PoolClient} from 'pg';
export const remoteSchemaVersion: 1;
export const remoteBackendVersion: 'remote-postgres-v1';
export const remoteApplicationId: 'bondtrace-public-metadata';
export const maxDocumentBytes: number;
export const defaultMaxSnapshotBytes: number;
export class RemoteStorageError extends Error {readonly code: string; constructor(code: string);}
export interface RemoteDocument {key: string; body: string; updatedAt: string;}
export interface RemoteChange {key: string; body: string; updatedAt?: string;}
export interface RemoteSnapshot {
  documents: RemoteDocument[];
  storageMeta: Array<{key: string; value: string}>;
  legacyImports: Array<{documentKey: string; sourceSha256: string; sourceBytes: number; importedAt: string}>;
  metadata: Record<string, string>;
  generation: string;
  bytes: number;
  dataSha256: string;
  acknowledgedAt: string | null;
}
/** One engine exclusively owns this pool. Pool.query is deliberately not required. */
export interface RemotePostgresPool {
  connect(): Promise<Pick<PoolClient, 'query' | 'release'> & Partial<Pick<PoolClient, 'on' | 'removeListener'>>>;
  end(): Promise<void>;
  on?(event: 'error', listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: 'error', listener: (...args: unknown[]) => void): unknown;
}
export interface RemoteEngineOptions {
  pool: RemotePostgresPool;
  namespace: string;
  network: 'devnet' | 'localnet';
  programId: string;
  /** Total deadline including acquisition/staging; default 10000, maximum 20000 ms (+1000 ms rollback cleanup). */
  transactionTimeoutMs?: number;
  /** Encoded public-data ceiling; default/maximum 32 MiB, individual bodies 8 MiB. */
  maxSnapshotBytes?: number;
}
export function validateRemoteDocumentKey(key: string): string;
export function validateRemoteDocumentBody(body: string): string;
export class RemotePostgresEngine {
  constructor(options: RemoteEngineOptions);
  readonly health: {closed: boolean; poisoned: boolean; activeTransaction: boolean; generation: string | null; acknowledgedAt: string | null};
  /** Observer/schema+namespace initialization and consistent primary hydration; never replaces a writer. */
  initialize(): Promise<RemoteSnapshot>;
  hydrate(): Promise<RemoteSnapshot>;
  begin(): Promise<RemoteSnapshot>;
  commit(changes?: RemoteChange[]): Promise<RemoteSnapshot>;
  rollback(): Promise<void>;
  exportSnapshot(): Promise<RemoteSnapshot>;
  /** Fresh primary binding/owned-generation verification, without snapshot or ownership claim. */
  assertWriter(): Promise<{verified: true; generation: string; checkedAt: string}>;
  close(): Promise<void>;
}
