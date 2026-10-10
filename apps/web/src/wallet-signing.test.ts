import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  address, appendTransactionMessageInstructions, assertIsTransactionWithinSizeLimit, blockhash, compileTransaction, createTransactionMessage,
  generateKeyPairSigner, getAddressDecoder, getAddressEncoder, getBase58Encoder,
  getCompiledTransactionMessageDecoder, getTransactionDecoder, getTransactionEncoder, pipe,
  setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, type ReadonlyUint8Array, type SignatureBytes, type Transaction, type TransactionVersion,
} from '@solana/kit';
import { createTransactionSignerFromWalletAccount } from '@solana/wallet-account-signer';
import { registerWalletHandle } from '@wallet-standard/ui-registry';
import type { WalletState } from '@solana/kit-plugin-wallet';
import { api } from './api';
import { signPreparedTransaction, walletSigningMethod, WalletSigningError } from './wallet-signing';

type Connection = NonNullable<WalletState['connected']>;
// Fresh ephemeral keys exist only in memory. These are synthetic providers, never Phantom evidence.
async function fixture(walletName = 'Offline test wallet', version: TransactionVersion = 0) {
  const payer = await generateKeyPairSigner();
  const lifetime = { blockhash: blockhash(getAddressDecoder().decode(new Uint8Array(32).fill(9))), lastValidBlockHeight: 12345n };
  const transaction = compileTransaction(pipe(
    createTransactionMessage({ version }),
    message => setTransactionMessageFeePayer(payer.address, message),
    message => setTransactionMessageLifetimeUsingBlockhash(lifetime, message),
    message => appendTransactionMessageInstructions([{ programAddress: address('11111111111111111111111111111111'), data: new Uint8Array([1, 2, 3]) }], message),
  ));
  const wire = getTransactionEncoder().encode(transaction);
  const base64 = Buffer.from(wire).toString('base64');
  async function signedWire(input: ReadonlyUint8Array = wire) {
    const decoded = getTransactionDecoder().decode(input);
    assertIsTransactionWithinSizeLimit(decoded);
    const [signatures] = await payer.signTransactions([{ ...decoded, lifetimeConstraint: lifetime }]);
    return getTransactionEncoder().encode({ ...decoded, signatures: { ...decoded.signatures, ...signatures } });
  }
  const standardCalls: { account: unknown; chain: string; transaction: Uint8Array }[] = [];
  const account = { address: payer.address, publicKey: getAddressEncoder().encode(payer.address), chains: ['solana:devnet'], features: ['solana:signTransaction'] };
  const nativeWallet = { version: '1.0.0', name: walletName, icon: 'data:image/svg+xml,<svg/>', chains: ['solana:devnet'], accounts: [account], features: {
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signTransaction: async (...inputs: typeof standardCalls) => {
      standardCalls.push(...inputs);
      return Promise.all(inputs.map(async input => ({ signedTransaction: await signedWire(input.transaction) })));
    } },
  } };
  const uiAccount = { ...account };
  registerWalletHandle(uiAccount as never, nativeWallet as never);
  const connection = { account: uiAccount, wallet: { name: walletName }, supportedTransactionVersions: new Set(['legacy', 0]), signer: createTransactionSignerFromWalletAccount(uiAccount as never, 'solana:devnet') } as unknown as Connection;
  const injectedCalls: { method: string; params: { message: string } }[] = [];
  const provider = { isPhantom: true, isConnected: true, publicKey: { toString: () => payer.address }, request: async (input: { method: string; params: { message: string } }): Promise<unknown> => {
    injectedCalls.push(input);
    assert.equal(input.method, 'signTransaction');
    assert.deepEqual(getBase58Encoder().encode(input.params.message), transaction.messageBytes);
    const signed = await signedWire();
    return { serialize: () => Uint8Array.from(signed) };
  } };
  return { payer, transaction, wire, base64, lifetime, signedWire, connection, account, standardCalls, provider, injectedCalls };
}

async function inWindow<T>(provider: unknown, action: () => Promise<T>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { phantom: { solana: provider }, setTimeout, clearTimeout } });
  try { return await action(); } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('installed Wallet Standard signs exact v0 wire once with native account, devnet and real Ed25519 signature', async () => {
  const value = await fixture();
  const signed = await signPreparedTransaction(value.connection, 'devnet', value.base64, { lastValidBlockHeight: Number(value.lifetime.lastValidBlockHeight) });
  assert.equal(value.standardCalls.length, 1);
  assert.equal(value.standardCalls[0].account, value.account);
  assert.equal(value.standardCalls[0].chain, 'solana:devnet');
  assert.deepEqual(value.standardCalls[0].transaction, value.wire);
  const returned = getTransactionDecoder().decode(Buffer.from(signed, 'base64'));
  assert.deepEqual(Uint8Array.from(returned.messageBytes), value.transaction.messageBytes);
  assert.equal(getCompiledTransactionMessageDecoder().decode(returned.messageBytes).version, 0);
  assert.ok(returned.signatures[value.payer.address]);
});

test('API original blockhash and last-valid height reach signer unchanged without any RPC', async () => {
  const value = await fixture();
  let observed: unknown;
  Object.assign(value.connection, { signer: { address: value.payer.address, modifyAndSignTransactions: async ([input]: Transaction[]) => {
    observed = (input as Transaction & { lifetimeConstraint: unknown }).lifetimeConstraint;
    return [getTransactionDecoder().decode(await value.signedWire())];
  } } });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Signing must not issue RPC requests'); };
  try {
    await signPreparedTransaction(value.connection, 'devnet', value.base64, { lastValidBlockHeight: 12345 });
    assert.deepEqual(observed, value.lifetime);
  } finally { globalThis.fetch = oldFetch; }
});

test('selected Phantom uses documented injected sign-only request once and never Standard fallback', async () => {
  const value = await fixture('Phantom', 'legacy');
  await inWindow(value.provider, async () => {
    assert.equal(walletSigningMethod(value.connection), 'phantom-injected');
    const signed = await signPreparedTransaction(value.connection, 'devnet', value.base64);
    assert.deepEqual(Uint8Array.from(getTransactionDecoder().decode(Buffer.from(signed, 'base64')).messageBytes), value.transaction.messageBytes);
  });
  assert.equal(value.injectedCalls.length, 1);
  assert.equal(value.standardCalls.length, 0);
});

test('other selected wallets retain Standard even when Phantom is injected', async () => {
  const value = await fixture();
  await inWindow(value.provider, async () => {
    assert.equal(walletSigningMethod(value.connection), 'wallet-standard');
    await signPreparedTransaction(value.connection, 'devnet', value.base64);
  });
  assert.equal(value.injectedCalls.length, 0);
  assert.equal(value.standardCalls.length, 1);
});

test('Standard signer cannot omit required signatures or change its selected account', async () => {
  const value = await fixture();
  Object.assign(value.connection, { signer: { address: value.payer.address, modifyAndSignTransactions: async () => [{ ...value.transaction, signatures: {} }] } });
  await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /changed the required transaction signers/);
  Object.assign(value.connection, { signer: { address: '11111111111111111111111111111111', modifyAndSignTransactions: async () => { throw new Error('Must not prompt'); } } });
  await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /active wallet signer changed/);
});

test('Phantom account mismatch or disconnection refuses every prompt', async () => {
  const value = await fixture('Phantom', 'legacy');
  value.provider.publicKey.toString = () => '11111111111111111111111111111111' as typeof value.payer.address;
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /account changed or disconnected/));
  value.provider.publicKey.toString = () => value.payer.address;
  value.provider.isConnected = false;
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /account changed or disconnected/));
  assert.equal(value.injectedCalls.length + value.standardCalls.length, 0);
});

test('chain, version, signer and lifetime guards run before any approval', async () => {
  const value = await fixture('Phantom', 'legacy');
  await inWindow(value.provider, async () => {
    await assert.rejects(signPreparedTransaction(value.connection, 'localnet', value.base64), /does not support localnet/);
    await assert.rejects(signPreparedTransaction(value.connection, 'mainnet' as never, value.base64), /Only localnet and devnet/);
    Object.assign(value.connection, { supportedTransactionVersions: new Set([0]) });
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /does not support the prepared transaction version/);
    Object.assign(value.connection, { supportedTransactionVersions: new Set(['legacy', 0]) });
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64, { lastValidBlockHeight: NaN }), /lifetime is invalid/);
    Object.assign(value.connection.account, { address: '11111111111111111111111111111111' });
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /does not name your connected account/);
  });
  assert.equal(value.injectedCalls.length + value.standardCalls.length, 0);
});

test('malformed wire is rejected before wallet request', async () => {
  const value = await fixture('Phantom', 'legacy');
  await inWindow(value.provider, async () => {
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', '%%%%'));
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', Buffer.from([...value.wire, 99]).toString('base64')));
  });
  assert.equal(value.injectedCalls.length + value.standardCalls.length, 0);
});

test('Phantom plain-object rejection retains numeric code and stage, with no retry or alternate prompt', async () => {
  const value = await fixture('Phantom', 'legacy');
  value.provider.request = async () => { value.injectedCalls.push({ method: 'signTransaction', params: { message: '' } }); throw { code: -32603, message: 'Unexpected error', privateDebug: 'must-not-be-rendered' }; };
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), failure => {
    assert.ok(failure instanceof WalletSigningError);
    assert.equal(failure.stage, 'wallet-request'); assert.equal(failure.code, -32603);
    assert.match(failure.message, /Phantom, devnet, legacy, code -32603/);
    assert.doesNotMatch(failure.message, /privateDebug|must-not-be-rendered/);
    return true;
  }));
  assert.equal(value.injectedCalls.length, 1); assert.equal(value.standardCalls.length, 0);
});

test('cancellation code is recognizable even when provider omits message', async () => {
  const value = await fixture('Phantom', 'legacy');
  value.provider.request = async () => { throw { code: 4001 }; };
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /User rejected the wallet request/));
});

test('unsupported provider response shape is rejected without another request', async () => {
  const value = await fixture('Phantom', 'legacy');
  value.provider.request = async () => { value.injectedCalls.push({ method: 'signTransaction', params: { message: '' } }); return { signature: 'not-a-signed-transaction' }; };
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /unsupported signed transaction response/));
  assert.equal(value.injectedCalls.length, 1); assert.equal(value.standardCalls.length, 0);
});

test('changed reviewed message is rejected even with a genuine signature of the altered message', async () => {
  const value = await fixture('Phantom', 'legacy');
  const changed = Uint8Array.from(value.wire); changed[changed.length - 2] ^= 1;
  const signedChanged = await value.signedWire(changed);
  value.provider.request = async () => ({ serialize: () => Uint8Array.from(signedChanged) });
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /changed the reviewed transaction/));
});

test('missing or false signatures cannot reach relay despite unchanged message bytes', async () => {
  const value = await fixture('Phantom', 'legacy');
  await inWindow(value.provider, async () => {
    value.provider.request = async () => ({ serialize: () => Uint8Array.from(value.wire) });
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), WalletSigningError);
    const bogus = getTransactionEncoder().encode({ ...value.transaction, signatures: { [value.payer.address]: new Uint8Array(64).fill(7) as SignatureBytes } });
    value.provider.request = async () => ({ serialize: () => Uint8Array.from(bogus) });
    await assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /invalid signature/);
  });
});

test('account switch while approval is open invalidates returned transaction', async () => {
  const value = await fixture('Phantom', 'legacy');
  const originalRequest = value.provider.request;
  value.provider.request = async input => {
    const response = await originalRequest(input);
    value.provider.isConnected = false;
    return response;
  };
  await inWindow(value.provider, async () => assert.rejects(signPreparedTransaction(value.connection, 'devnet', value.base64), /account changed or disconnected/));
});

test('signed exact bytes reach existing API submit once; interrupted response recovers by GET without re-signing', async () => {
  const value = await fixture('Phantom', 'legacy');
  const oldFetch = globalThis.fetch;
  const requests: { path: string; method: string }[] = [];
  let retained: string | undefined;
  globalThis.fetch = async (input, init) => {
    const path = String(input); requests.push({ path, method: init?.method || 'GET' });
    if (path === '/api/transactions/submit') {
      retained = JSON.parse(String(init?.body)).signedTransactionBase64;
      assert.deepEqual(Uint8Array.from(getTransactionDecoder().decode(Buffer.from(retained!, 'base64')).messageBytes), value.transaction.messageBytes);
      throw new TypeError('Connection closed after receipt persistence');
    }
    assert.equal(path, '/api/operations/existing-operation');
    return new Response(JSON.stringify({ operationId: 'existing-operation', signature: 'retained-signature', status: 'confirmed' }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await inWindow(value.provider, async () => {
      const signed = await signPreparedTransaction(value.connection, 'devnet', value.base64);
      await assert.rejects(api.submit(signed), failure => failure instanceof Error && 'uncertain' in failure && failure.uncertain === true);
      const recovered = await api.operation('existing-operation');
      assert.equal(recovered.status, 'confirmed');
    });
    assert.ok(retained);
    assert.equal(value.injectedCalls.length, 1); assert.equal(value.standardCalls.length, 0);
    assert.deepEqual(requests, [{ path: '/api/transactions/submit', method: 'POST' }, { path: '/api/operations/existing-operation', method: 'GET' }]);
  } finally { globalThis.fetch = oldFetch; }
});

test('Phantom v0 selects full-wire native-account Standard before approval and never invokes legacy request', async () => {
  const value = await fixture('Phantom', 0);
  value.provider.request = async () => { throw Error('Legacy message-only parser must never receive v0'); };
  await inWindow(value.provider, async () => {
    assert.equal(walletSigningMethod(value.connection, 0), 'wallet-standard');
    const signed = await signPreparedTransaction(value.connection, 'devnet', value.base64,
      {lastValidBlockHeight: Number(value.lifetime.lastValidBlockHeight)});
    assert.deepEqual(Uint8Array.from(getTransactionDecoder().decode(Buffer.from(signed, 'base64')).messageBytes), value.transaction.messageBytes);
  });
  assert.equal(value.standardCalls.length, 1);
  assert.deepEqual(value.standardCalls[0].transaction, value.wire);
  assert.equal(value.standardCalls[0].account, value.account);
  assert.equal(value.standardCalls[0].chain, 'solana:devnet');
  assert.equal(value.injectedCalls.length, 0);
});
test('Phantom v0 rejection stops after exactly one Standard request, without injected fallback', async () => {
  const value = await fixture('Phantom', 0);
  let calls = 0;
  Object.assign(value.connection, {signer: {address: value.payer.address, modifyAndSignTransactions: async () => {
    calls++; throw Object.assign(new Error('Rejected versioned test request'), {code: 4001});
  }}});
  await inWindow(value.provider, async () => assert.rejects(
    signPreparedTransaction(value.connection, 'devnet', value.base64), /User rejected/));
  assert.equal(calls, 1); assert.equal(value.injectedCalls.length, 0);
});
test('Phantom v0 account change during approval rejects even a valid returned signature', async () => {
  const value = await fixture('Phantom', 0);
  Object.assign(value.connection, {signer: {address: value.payer.address, modifyAndSignTransactions: async () => {
    const signed = getTransactionDecoder().decode(await value.signedWire());
    value.provider.isConnected = false; return [signed];
  }}});
  await inWindow(value.provider, async () => assert.rejects(
    signPreparedTransaction(value.connection, 'devnet', value.base64), /account changed or disconnected/));
});
