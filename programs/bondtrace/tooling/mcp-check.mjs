// Read-only official Solana documentation / Rust analysis; never reads keypairs.
import fs from 'node:fs';
import path from 'node:path';
const endpoint = 'https://mcp.solana.com/mcp';
let session;
let id = 0;
async function rpc(method, params = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session) headers['Mcp-Session-Id'] = session;
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(60000) });
  session ||= response.headers.get('mcp-session-id');
  const raw = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 300)}`);
  const decoded = raw.startsWith('event:') || raw.startsWith('data:') ? raw.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trim())).find(item => item.id === id) : JSON.parse(raw);
  if (decoded.error) throw new Error(JSON.stringify(decoded.error));
  return decoded.result;
}
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bondtrace-program-check', version: '0.1.0' } });
const mode = process.argv[2] ?? 'docs';
let result;
if (mode === 'autofixer') {
  const root = path.resolve('programs/bondtrace/src');
  const code = ['lib.rs', 'contexts.rs', 'state.rs'].map(name => `// FILE ${name}\n${fs.readFileSync(path.join(root, name), 'utf8')}`).join('\n\n');
  result = await rpc('tools/call', { name: 'program_autofixer', arguments: { code, framework: 'anchor', filename: 'bondtrace.rs' } });
} else {
  result = await rpc('tools/call', { name: 'Solana_Documentation_Search', arguments: { query: 'Anchor 1.1.2 SPL token CPI CpiContext::new token program pubkey freeze thaw transfer_checked and LiteSVM Rust tests' } });
}
const target = path.resolve(`programs/bondtrace/tooling/mcp-${mode}-result.json`);
fs.writeFileSync(target, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output: target, isError: Boolean(result.isError), preview: JSON.stringify(result).slice(0, 7500) }));
