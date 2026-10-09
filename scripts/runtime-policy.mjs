export const MIN_FREE_BYTES = 2n * 1024n * 1024n * 1024n;
export const MAX_LOG_BYTES = 8n * 1024n * 1024n;
export function readinessPolicy(value) {
  const reasons = [];
  if (BigInt(value.hostFreeBytes) < MIN_FREE_BYTES) reasons.push('host-disk-low');
  if (BigInt(value.nativeFreeBytes) < MIN_FREE_BYTES) reasons.push('native-disk-low');
  if (BigInt(value.logBytes ?? 0) > MAX_LOG_BYTES) reasons.push('diagnostic-log-limit');
  if (value.rpcHealth !== 'ok') reasons.push('rpc-unhealthy');
  if (value.genesis !== value.expectedGenesis) reasons.push('genesis-mismatch');
  if (!Number.isSafeInteger(value.slotBefore) || !Number.isSafeInteger(value.slotAfter) || value.slotAfter <= value.slotBefore) reasons.push('slot-not-advancing');
  if (!value.programVerified) reasons.push('program-mismatch');
  if (!value.storageVerified) reasons.push('storage-unavailable');
  return {healthy: reasons.length === 0, reasons};
}
export function restartPolicy(timestamps, now, failureCount) {
  const recent = timestamps.filter(time => Number.isSafeInteger(time) && time <= now && time > now - 600000);
  return {allowed: failureCount >= 3 && recent.length < 3, recent, exhausted: recent.length >= 3};
}
