import type { ChainState, PreparedAction, TransactionResult, ActionName, DemoRole } from './types';
export class ApiError extends Error {
  constructor(message: string, public code: string, public retryable: boolean, public uncertain = false) { super(message); }
}
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), body ? 90_000 : 15_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(path, {
      method: body == null ? 'GET' : 'POST', headers: body == null ? undefined : { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || (result.error && typeof result.status !== 'string')) throw new ApiError(result.error?.message || 'The service could not complete this request.', result.error?.code || 'SERVICE_ERROR', Boolean(result.error?.retryable), result.error?.code === 'UNKNOWN_STATUS' || Boolean(result.error?.recoveryRequired) || (body!=null&&response.status>=500));
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(body ? 'The response was interrupted. Verify the existing operation before trying again.' : 'Could not read the chain state. Check the API and RPC connection.', 'CONNECTION_ERROR', body == null, body != null);
  } finally { window.clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export const api = {
  state: async (signal?: AbortSignal, instrument?: string) => {
    const state = await request<ChainState>(`/api/state${instrument?'?instrument='+encodeURIComponent(instrument):''}`, undefined, signal);
    if (!['localnet', 'devnet'].includes(state.network)) throw new ApiError('This app supports localnet and devnet test assets only. The API returned an unsupported network.', 'UNSUPPORTED_NETWORK', false);
    return state;
  },
  bootstrap: (reset = false, operationId?: string) => request<TransactionResult>('/api/demo/bootstrap', { reset, operationId }),
  demoAction: (action: ActionName, role: DemoRole, params: Record<string, string>, operationId: string) => request<TransactionResult>('/api/demo/action', { action, role, params, operationId }),
  prepare: (action: ActionName, walletAddress: string, params: Record<string, string>) => request<PreparedAction>('/api/actions/prepare', { action, walletAddress, params }),
  submit: (signedTransactionBase64: string) => request<TransactionResult>('/api/transactions/submit', { signedTransactionBase64 }),
  status: (signature: string) => request<TransactionResult>(`/api/transactions/${encodeURIComponent(signature)}`),
  operation: (operationId: string) => request<TransactionResult>(`/api/operations/${encodeURIComponent(operationId)}`),
};
