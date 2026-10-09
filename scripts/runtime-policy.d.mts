export const MIN_FREE_BYTES: bigint;
export const MAX_LOG_BYTES: bigint;
export function readinessPolicy(value: {hostFreeBytes: bigint|number|string; nativeFreeBytes: bigint|number|string; logBytes?: bigint|number|string; rpcHealth: string; genesis: string; expectedGenesis: string; slotBefore: number; slotAfter: number; programVerified: boolean; storageVerified: boolean}): {healthy: boolean; reasons: string[]};
export function restartPolicy(timestamps: number[], now: number, failureCount: number): {allowed: boolean; recent: number[]; exhausted: boolean};
