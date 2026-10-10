import {
  address, assertIsFullySignedTransaction, blockhash, getBase58Decoder, getCompiledTransactionMessageDecoder, getCompiledTransactionMessageEncoder,
  getPublicKeyFromAddress, getTransactionDecoder, getTransactionEncoder,
  isTransactionModifyingSigner, verifySignature, type ReadonlyUint8Array, type Transaction, type TransactionModifyingSigner, type TransactionVersion,
} from '@solana/kit';
import type { WalletState } from '@solana/kit-plugin-wallet';
import { withWalletDeadline, WalletRequestTimeout } from './wallet-deadline';

type Connection = NonNullable<WalletState['connected']>;
type Network = 'localnet' | 'devnet';
export interface WalletSigningOptions { lastValidBlockHeight?: number }
export type WalletSigningStage = 'wallet-request' | 'wallet-response';
export type WalletSigningMethod = 'phantom-injected' | 'wallet-standard';
interface PhantomProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: { toString(): string } | null;
  request(input: { method: 'signTransaction'; params: { message: string } }): Promise<unknown>;
}

function phantomProvider(): PhantomProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  const provider = (window as Window & { phantom?: { solana?: PhantomProvider } }).phantom?.solana;
  return provider?.isPhantom === true && typeof provider.request === 'function' ? provider : undefined;
}

/** Choose once, before approval. Never retry a rejected request through another signing path. */
export function walletSigningMethod(connection: Connection): WalletSigningMethod {
  return connection.wallet.name === 'Phantom' && phantomProvider() ? 'phantom-injected' : 'wallet-standard';
}

function assertPhantomAccount(provider: PhantomProvider, account: string) {
  if (!provider.isConnected || provider.publicKey?.toString() !== account) throw new Error('The Phantom account changed or disconnected. Reconnect the selected account and prepare a new preview.');
}

/** Bounded public diagnostics only; never serialize provider objects or their causes. */
export class WalletSigningError extends Error {
  readonly code?: number;
  constructor(failure: unknown, readonly stage: WalletSigningStage, network: Network, version: TransactionVersion, readonly method: WalletSigningMethod) {
    const value = failure && typeof failure === 'object' ? failure as { code?: unknown; message?: unknown } : undefined;
    const code = typeof value?.code === 'number' && Number.isSafeInteger(value.code) ? value.code : undefined;
    const detail = code === 4001 ? 'User rejected the wallet request.' :
      typeof value?.message === 'string' ? value.message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240) : 'The wallet request failed.';
    super(`${stage === 'wallet-request' ? 'Wallet signing' : 'Wallet response'} (${method === 'phantom-injected' ? 'Phantom' : 'Wallet Standard'}, ${network}, ${version === 'legacy' ? 'legacy' : `v${version}`}${code == null ? '' : `, code ${code}`}): ${detail} No transaction was relayed.`);
    this.name = 'WalletSigningError';
    this.code = code;
  }
}

function equalBytes(first: ReadonlyUint8Array, second: ReadonlyUint8Array) {
  return first.length === second.length && first.every((byte, index) => byte === second[index]);
}

async function validateSignedTransaction(original: Transaction, signed: Transaction) {
  if (!equalBytes(signed.messageBytes, original.messageBytes)) throw new Error('The wallet changed the reviewed transaction. Prepare a new preview before submitting.');
  const expectedSigners = Object.keys(original.signatures).sort();
  const returnedSigners = Object.keys(signed.signatures).sort();
  if (expectedSigners.length !== returnedSigners.length || expectedSigners.some((signer, index) => signer !== returnedSigners[index])) throw new Error('The wallet changed the required transaction signers. Prepare a new preview.');
  assertIsFullySignedTransaction(signed);
  // A nonempty signature alone is not proof that the reviewed message was signed.
  for (const [signerAddress, signature] of Object.entries(signed.signatures)) {
    if (!signature || !(await verifySignature(await getPublicKeyFromAddress(address(signerAddress)), signature, original.messageBytes))) {
      throw new Error('The wallet returned an invalid signature for the reviewed transaction.');
    }
  }
}

/** Sign only. Submission and durable recovery remain the API caller's responsibility. */
export async function signPreparedTransaction(connection: Connection, network: Network, base64: string, options: WalletSigningOptions = {}): Promise<string> {
  if (network !== 'localnet' && network !== 'devnet') throw new Error('Only localnet and devnet test transactions can be signed.');
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  // Validate the complete wire before any wallet prompt, including trailing bytes.
  const transaction = getTransactionDecoder().decode(bytes);
  if (!equalBytes(bytes, getTransactionEncoder().encode(transaction))) throw new Error('The prepared transaction is not a canonical transaction. Prepare a new preview.');
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (!equalBytes(transaction.messageBytes, getCompiledTransactionMessageEncoder().encode(message))) throw new Error('The prepared transaction message is not canonical. Prepare a new preview.');
  const method = walletSigningMethod(connection);
  if (!(connection.account.address in transaction.signatures)) throw new Error('The prepared transaction does not name your connected account as a signer.');
  if (!connection.supportedTransactionVersions.has(message.version)) throw new Error(`This wallet does not support the prepared transaction version (${message.version}). Choose a compatible wallet.`);
  const signer = connection.signer;
  if (method === 'wallet-standard' && (!signer || !isTransactionModifyingSigner(signer))) throw new Error('This wallet does not support transaction signing. Choose a Wallet Standard wallet with solana:signTransaction.');
  if (method === 'wallet-standard' && signer?.address !== connection.account.address) throw new Error('The active wallet signer changed. Reconnect and prepare a new preview.');
  if (!connection.account.chains.includes(`solana:${network}`)) throw new Error(`This account does not support ${network}. Switch the network in your wallet.`);
  if (options.lastValidBlockHeight != null && (!Number.isSafeInteger(options.lastValidBlockHeight) || options.lastValidBlockHeight < 0)) throw new Error('The prepared transaction lifetime is invalid. Prepare a new preview.');
  // Wire bytes cannot carry the last-valid height; use the API's original value when provided.
  const input = options.lastValidBlockHeight == null ? transaction : {
    ...transaction, lifetimeConstraint: { blockhash: blockhash(message.lifetimeToken), lastValidBlockHeight: BigInt(options.lastValidBlockHeight) },
  };
  const provider = method === 'phantom-injected' ? phantomProvider() : undefined;
  if (method === 'phantom-injected') assertPhantomAccount(provider!, connection.account.address);
  let result: Transaction;
  let response: unknown;
  try {
    response = await withWalletDeadline(() => method === 'phantom-injected'
      // Phantom documents this sign-only request. It does not broadcast or replace the blockhash.
      ? provider!.request({ method: 'signTransaction', params: { message: getBase58Decoder().decode(transaction.messageBytes) } })
      : (signer as TransactionModifyingSigner).modifyAndSignTransactions([input]));
  } catch (failure) {
    if (failure instanceof WalletRequestTimeout) throw failure;
    throw new WalletSigningError(failure, 'wallet-request', network, message.version, method);
  }
  try {
    if (method === 'phantom-injected') {
      assertPhantomAccount(provider!, connection.account.address);
      // The documented request response is a signed Transaction with serialize().
      if (!response || typeof response !== 'object' || !('serialize' in response) || typeof response.serialize !== 'function') throw new Error('Phantom returned an unsupported signed transaction response.');
      const signedBytes: unknown = response.serialize();
      if (!(signedBytes instanceof Uint8Array)) throw new Error('Phantom returned invalid signed transaction bytes.');
      result = getTransactionDecoder().decode(signedBytes);
      if (!equalBytes(signedBytes, getTransactionEncoder().encode(result))) throw new Error('Phantom returned a noncanonical signed transaction.');
    } else {
      if (!Array.isArray(response) || response.length !== 1 || !response[0]) throw new Error('The wallet did not return exactly one signed transaction.');
      result = response[0] as Transaction;
    }
    await validateSignedTransaction(transaction, result);
    let binary = ''; for (const byte of getTransactionEncoder().encode(result)) binary += String.fromCharCode(byte);
    return btoa(binary);
  } catch (failure) {
    throw new WalletSigningError(failure, 'wallet-response', network, message.version, method);
  }
}
