import {createHash} from 'node:crypto';
import {address, getAddressEncoder, getTransactionDecoder, getTransactionEncoder} from '@solana/kit';
import {chainIdentity} from './chain-identity.ts';
import {receipt} from './journal.ts';
import {findOperation, operationStatus} from './operations.ts';
import {findPrepared} from './prepared.ts';
import {assertVerifiedProgram} from './program-identity.ts';
import {AppError, awaitConfirmation, rpc, signatureOf, transactionStatus} from './rpc.ts';

/** Explicit relay of an existing signature only; reads never call this function. */
export async function rebroadcastTransaction(signature: string, operationId?: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature)) throw new AppError('INVALID_SIGNATURE', 'Invalid transaction signature');
  const stored = receipt(signature);
  if (!stored?.signedTransactionBase64 || !stored.genesisHash || !stored.programRelease)
    throw new AppError('REBROADCAST_UNAVAILABLE', 'This receipt has no complete retained signed message and release binding. Preserve its original signature.', 409);
  const wire = Buffer.from(stored.signedTransactionBase64, 'base64');
  if (wire.length > 1232 || wire.toString('base64') !== stored.signedTransactionBase64)
    throw new AppError('INVALID_TRANSACTION', 'The retained transaction encoding is invalid');
  const decoded = getTransactionDecoder().decode(wire);
  if (!Buffer.from(getTransactionEncoder().encode(decoded)).equals(wire) || signatureOf(stored.signedTransactionBase64) !== signature || !stored.wallet || !(stored.wallet in decoded.signatures))
    throw new AppError('RECEIPT_MISMATCH', 'The retained signed message does not match this receipt', 409);
  for (const [wallet, signed] of Object.entries(decoded.signatures)) {
    if (!signed || signed.length !== 64) throw new AppError('INVALID_SIGNATURE', 'Every retained signature must be present');
    const key = await crypto.subtle.importKey('raw', new Uint8Array(getAddressEncoder().encode(address(wallet))), {name: 'Ed25519'}, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, new Uint8Array(signed), new Uint8Array(decoded.messageBytes)))
      throw new AppError('INVALID_SIGNATURE', 'The retained signature does not verify');
  }
  const identity = await chainIdentity();
  if (stored.genesisHash !== identity.genesisHash || stored.network !== identity.network)
    throw new AppError('CHAIN_IDENTITY_CHANGED', 'The receipt belongs to another test ledger', 409);
  const messageId = createHash('sha256').update(Buffer.from(decoded.messageBytes)).digest('hex');
  const id = operationId ?? stored.operationId ?? messageId;
  const operation = findOperation(id), prepared = findPrepared(id);
  if (operation && prepared) throw new AppError('RECOVERY_ID_CONFLICT', 'This identifier belongs to two saved intents', 409);
  const intent = operation ?? prepared;
  if (operationId !== undefined && !intent) throw new AppError('OPERATION_NOT_FOUND', 'No saved intent exists for this identifier', 404);
  if (intent && (intent.signature !== signature || intent.action !== stored.action || intent.wallet !== stored.wallet || intent.bond !== stored.bond))
    throw new AppError('RECEIPT_MISMATCH', 'The saved intent and signed receipt disagree', 409);
  const prior = await transactionStatus(signature);
  // A confirmed or definitive failed receipt needs no new relay, even after an upgrade.
  if (prior.status === 'confirmed' || prior.status === 'error') return intent ? operationStatus(id) : prior;
  const release = await assertVerifiedProgram();
  if (release.programId !== stored.programRelease.programId || release.expected!.sha256 !== stored.programRelease.sha256 || release.genesisHash !== stored.programRelease.genesisHash)
    throw new AppError('PREPARATION_VERSION_CHANGED', 'The signed receipt was reviewed against another program release. Only passive recovery is available.', 409);
  const height = await rpc<number>('getBlockHeight', [{commitment: 'confirmed'}]);
  if (!Number.isSafeInteger(height) || height < 0 || !Number.isSafeInteger(stored.lastValidBlockHeight))
    throw new AppError('RPC_INVALID', 'The retained transaction lifetime cannot be verified', 503, true);
  if (height > stored.lastValidBlockHeight!)
    throw new AppError('REBROADCAST_EXPIRED', 'The original message expired. Retain its signature; unavailable history is not proof of failure. No replacement was signed.', 409);
  try {
    const returned = await rpc<string>('sendTransaction', [stored.signedTransactionBase64, {encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5}]);
    if (returned !== signature) throw new Error('RPC signature mismatch');
  } catch {
    // Preflight rejection now cannot prove that an earlier ambiguous relay failed.
    throw new AppError('UNKNOWN_STATUS', 'The original signed message was retained. Check this same signature before any further action.', 503);
  }
  const result = await awaitConfirmation(signature);
  return intent ? operationStatus(id) : {...result, rebroadcast: true};
}
