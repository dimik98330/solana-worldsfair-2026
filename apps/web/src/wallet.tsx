import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient } from '@solana/kit';
import { ClientProvider } from '@solana/react';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { useConnectedWallet, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';
import { walletSigningMethod } from './wallet-signing';
export { signPreparedTransaction } from './wallet-signing';

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
  return { wallets, connected, status, signingMethod: connected ? walletSigningMethod(connected) : null, connect: (wallet: (typeof wallets)[number]) => client.wallet.connect(wallet), disconnect: () => client.wallet.disconnect() };
}
