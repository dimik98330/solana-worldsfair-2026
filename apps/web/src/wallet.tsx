import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient, getCompiledTransactionMessageDecoder, getTransactionDecoder, getTransactionEncoder, isTransactionModifyingSigner } from '@solana/kit';
import { ClientProvider } from '@solana/react';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { useConnectedWallet, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';

function createWalletClient(network: 'localnet' | 'devnet') { return createClient().use(walletSigner({ chain: `solana:${network}` })); }
type WalletClient = ReturnType<typeof createWalletClient>;
const WalletContext = createContext<WalletClient | null>(null);
export function WalletProvider({ network, children }: { network: 'localnet' | 'devnet'; children: ReactNode }) {
  const client = useMemo(() => createWalletClient(network), [network]);
  return <ClientProvider client={client}><WalletContext.Provider value={client}>{children}</WalletContext.Provider></ClientProvider>;
}
export function useWalletConnection() {
  const client = useContext(WalletContext);
  if (!client) throw new Error('Wallet provider missing');
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const status = useWalletStatus(client);
  return { wallets, connected, status, connect: (wallet: (typeof wallets)[number]) => client.wallet.connect(wallet), disconnect: () => client.wallet.disconnect() };
}

/** Wallet Standard keeps human signing in the wallet. The API receives only signed bytes. */
export async function signPreparedTransaction(connection: NonNullable<ReturnType<typeof useWalletConnection>['connected']>, network: 'localnet' | 'devnet', base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  // Decode before asking the wallet: malformed transactions must never reach a signing prompt.
  const transaction = getTransactionDecoder().decode(bytes);
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (!(connection.account.address in transaction.signatures)) throw new Error('The prepared transaction does not name your connected account as a signer.');
  if (!connection.supportedTransactionVersions.has(message.version)) throw new Error(`This wallet does not support the prepared transaction version (${message.version}). Choose a compatible wallet.`);
  if (!connection.signer || !isTransactionModifyingSigner(connection.signer)) throw new Error('This wallet does not support transaction signing. Choose a Wallet Standard wallet with solana:signTransaction.');
  if (!connection.account.chains.includes(`solana:${network}`)) throw new Error(`This account does not support ${network}. Switch the network in your wallet.`);
  const [result] = await connection.signer.modifyAndSignTransactions([transaction]);
  if (!result) throw new Error('The wallet returned no signed transaction.');
  if (result.messageBytes.length !== transaction.messageBytes.length || result.messageBytes.some((byte, index) => byte !== transaction.messageBytes[index])) throw new Error('The wallet changed the reviewed transaction. Prepare a new preview before submitting.');
  let binary = ''; for (const byte of getTransactionEncoder().encode(result)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
