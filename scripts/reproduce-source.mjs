import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {verifySourceSnapshot} from './source-snapshot.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = `Usage: node scripts/reproduce-source.mjs [--verify] [--lifecycle] [--keep-runtime] [--rpc-port=8979] [--api-port=3180] [--distro=NAME]
Default: stage an exclusive source-only copy and manifest; execute no installs/builds.
--verify: npm ci --ignore-scripts, web build, direct SBF build, frozen release check, Node/UI tests.
--lifecycle: also start a new NativeLedger runtime, bootstrap and strength-smoke once; no automatic retry of financial requests.
--keep-runtime: preserve this new runtime's processes for inspection; all files/ledgers are always preserved.
Windows verification needs the selected project WSL distribution; native Linux CI uses scripts/ci-verify.sh.`;
const flags = new Set();
let rpcPort = 8979, apiPort = 3180, distroOverride;
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') { console.log(usage); process.exit(0); }
  if (['--verify','--lifecycle','--keep-runtime'].includes(arg)) { flags.add(arg); continue; }
  const match = /^--(rpc-port|api-port|distro)=(.+)$/.exec(arg);
  if (!match) throw new Error('Unknown reproduction argument: ' + arg);
  if (match[1] === 'distro') distroOverride = match[2];
  else {
    if (!/^\d+$/.test(match[2])) throw new Error('Port must be an integer');
    const value = Number(match[2]);
    if (value < 1024 || value > 64996) throw new Error('Port outside reproduction range');
    if (match[1] === 'rpc-port') rpcPort = value; else apiPort = value;
  }
}
if (flags.has('--keep-runtime') && !flags.has('--lifecycle')) throw new Error('--keep-runtime requires --lifecycle');
if (apiPort >= rpcPort && apiPort <= rpcPort + 3) throw new Error('API port conflicts with the validator companion ports');
if (flags.has('--lifecycle')) flags.add('--verify');
if (flags.has('--verify') && process.platform !== 'win32') throw new Error('Run native Linux verification with bash scripts/ci-verify.sh; this launcher owns Windows/WSL processes');

// Explicit source allowlist: no Git/owner state, toolchain configuration, compiled
// output, old fixtures, evidence archives, or account credentials are copied.
const rootFiles = new Set(['package.json','package-lock.json','Cargo.toml','Cargo.lock','rust-toolchain.toml','Anchor.toml','tsconfig.json','tsconfig.web.json','vite.config.ts','index.html','.gitignore','.gitattributes','.dockerignore','Dockerfile','render.yaml','AGENTS.md','CODEX_SOLANA_WORLDSFAIR_START.md','README.md','README.ru.md','TECHNICAL.md','PRODUCT.md','DESIGN.md','brand.md']);
const trees = ['apps/web','packages/client','programs/bondtrace','server','scripts','tests'];
const documents = ['docs/00-STATE.md','docs/21-BACKEND-FOCUS.md','docs/29-BACKEND-STRENGTHENING.md','docs/31-HOSTING.md','docs/11-SECURITY.md','docs/15-API-CONTRACT.md','docs/34-PAGED-SERVICING.md','docs/LOCALNET-SETUP.md'];
const excludedDirectories = new Set(['.local','.git','.agents','.codex','.claude','.impeccable','node_modules','target','dist','build','coverage','artifacts','fixtures','wallets','keys','credentials']);
const codeExtensions = new Set(['.ts','.tsx','.js','.mjs','.cjs','.mts','.cts','.css','.html','.rs','.toml','.sh','.ps1']);
const assetExtensions = new Set(['.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.ttf','.otf']);
const publicProgramJson = new Set(['programs/bondtrace/bondtrace-idl.json','programs/bondtrace/release.json']);
function allowed(relative) {
  const normalized = relative.replaceAll('\\','/');
  const base = path.posix.basename(normalized);
  if (base.toLowerCase().startsWith('.env') || /(?:keypair|credential|secret|wallet|signer).*\.json$/i.test(base)) return false;
  if (rootFiles.has(normalized) || documents.includes(normalized) || publicProgramJson.has(normalized)) return true;
  const extension = path.posix.extname(normalized).toLowerCase();
  return codeExtensions.has(extension) || (normalized.startsWith('apps/web/public/') && assetExtensions.has(extension));
}
function inside(root, candidate) {
  const relative = path.relative(root,candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function refuseSymlinkAncestors(candidate) {
  let current = path.resolve(candidate);
  for (;;) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Reproduction refuses symlink/junction ancestor: ' + current);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
refuseSymlinkAncestors(sourceRoot);
const reproductionRoot = path.join(sourceRoot,'.local','reproduction');
refuseSymlinkAncestors(reproductionRoot);
fs.mkdirSync(reproductionRoot,{recursive:true});
const runId = randomUUID(), outputRoot = path.join(reproductionRoot,runId), cleanRoot = path.join(outputRoot,'source');
if (!inside(reproductionRoot,outputRoot) || !inside(outputRoot,cleanRoot)) throw new Error('Invalid reproduction output boundary');
fs.mkdirSync(outputRoot); fs.mkdirSync(cleanRoot);
const logRoot = path.join(outputRoot,'logs'); fs.mkdirSync(logRoot);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [], skipped = [];
function copyFile(relative, required = false) {
  const original = path.join(sourceRoot,relative), destination = path.join(cleanRoot,relative);
  if (!inside(sourceRoot,original) || !inside(cleanRoot,destination)) throw new Error('Source path escaped staging boundary');
  if (!fs.existsSync(original)) { if (required) throw new Error('Missing required source: ' + relative); return; }
  const info = fs.lstatSync(original);
  if (info.isSymbolicLink() || !info.isFile() || !allowed(relative)) { skipped.push(relative.replaceAll('\\','/')); return; }
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(original,destination,fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(destination);
  files.push({path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});
}
function copyTree(relative) {
  const original = path.join(sourceRoot,relative);
  if (!fs.existsSync(original)) throw new Error('Missing required source tree: ' + relative);
  if (fs.lstatSync(original).isSymbolicLink()) { skipped.push(relative); return; }
  for (const entry of fs.readdirSync(original,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const child = path.join(relative,entry.name);
    if (entry.isSymbolicLink()) { skipped.push(child.replaceAll('\\','/')); continue; }
    if (entry.isDirectory()) { if (!excludedDirectories.has(entry.name.toLowerCase())) copyTree(child); }
    else copyFile(child);
  }
}
for (const relative of rootFiles) copyFile(relative,['package.json','package-lock.json','Cargo.toml','Cargo.lock','Anchor.toml','tsconfig.json','vite.config.ts','index.html'].includes(relative));
for (const relative of documents) copyFile(relative);
for (const relative of trees) copyTree(relative);
files.sort((a,b)=>a.path.localeCompare(b.path));
fs.mkdirSync(path.join(cleanRoot,'docs','evidence'),{recursive:true});
const release = JSON.parse(fs.readFileSync(path.join(cleanRoot,'programs/bondtrace/release.json'),'utf8'));
if (!/^[a-f0-9]{64}$/.test(release.sha256) || !Number.isSafeInteger(release.programLen) || release.programLen <= 0) throw new Error('Invalid frozen program manifest');
const selection = path.join(sourceRoot,'.local','toolchain','wsl-runtime.json');
refuseSymlinkAncestors(selection);
const distro = distroOverride ?? process.env.BONDTRACE_WSL_DISTRO ?? (fs.existsSync(selection) ? JSON.parse(fs.readFileSync(selection,'utf8')).distro : 'Ubuntu');
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(distro)) throw new Error('Invalid explicit project WSL distribution');
const manifest = {schemaVersion:1,runId,startedAt:new Date().toISOString(),sourceRoot,cleanRoot,mode:flags.has('--lifecycle')?'lifecycle':flags.has('--verify')?'verify':'stage-only',selectedWslDistro:distro,frozenProgram:{programId:release.programId,bytes:release.programLen,sha256:release.sha256},files,skippedSymlinksOrNonSource:skipped,excludedDirectories:[...excludedDirectories],credentialsCopied:false,originalFixtureStateCopied:false,commands:[],status:'staged'};
const manifestPath = path.join(outputRoot,'manifest.json');
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
function event(name,value={}) {
  const entry = {event:name,at:new Date().toISOString(),...value};
  fs.appendFileSync(path.join(outputRoot,'events.jsonl'),JSON.stringify(entry)+'\n');
  console.log(JSON.stringify(entry));
}
event('source-staged',{runId,cleanRoot,files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),manifestPath,distro});

// Narrow inherited environment: never import a provider URL, owner wallet/data
// directory, NODE_OPTIONS or token variables into the clean execution.
const cleanEnv = {};
for (const key of ['PATH','Path','PATHEXT','SystemRoot','WINDIR','COMSPEC','ComSpec','SYSTEMDRIVE','SystemDrive','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','PROGRAMFILES','ProgramFiles','PROGRAMFILES(X86)','ProgramFiles(x86)','LANG']) if (process.env[key]) cleanEnv[key] = process.env[key];
const emptyNpmConfig = path.join(outputRoot,'empty.npmrc'); fs.writeFileSync(emptyNpmConfig,'',{flag:'wx'});
Object.assign(cleanEnv,{NO_DNA:'1',BONDTRACE_WSL_DISTRO:distro,BONDTRACE_NETWORK:'localnet',BONDTRACE_ENABLE_DEMO:'true',SOLANA_RPC_URL:`http://127.0.0.1:${rpcPort}`,BONDTRACE_API_ORIGIN:`http://127.0.0.1:${apiPort}`,BONDTRACE_DATA_DIR:path.join(cleanRoot,'.local','verification'),NPM_CONFIG_USERCONFIG:emptyNpmConfig});
async function command(label,executable,args,env=cleanEnv) {
  const number = String(manifest.commands.length + 1).padStart(2,'0'), logPath = path.join(logRoot,number+'-'+label+'.log');
  const output = fs.openSync(logPath,'wx');
  const record = {label,executable,args,cwd:cleanRoot,startedAt:new Date().toISOString(),logPath,status:'running'};
  manifest.commands.push(record); event('command-started',{label,logPath});
  try {
    const exitCode = await new Promise((resolve,reject)=>{
      const child = spawn(executable,args,{cwd:cleanRoot,env,windowsHide:true,stdio:['ignore',output,output],shell:false});
      child.once('error',reject); child.once('exit',(code,signal)=>resolve({code,signal}));
    });
    record.exitCode = exitCode.code; record.signal = exitCode.signal; record.finishedAt = new Date().toISOString();
    record.status = exitCode.code === 0 ? 'passed' : 'failed';
    record.logSha256 = hash(fs.readFileSync(logPath));
    event('command-finished',{label,status:record.status,exitCode:record.exitCode,logPath});
    if (exitCode.code !== 0) throw new Error(`Clean ${label} failed; preserve ${logPath}`);
  } catch (error) { record.status = 'failed'; record.error = String(error.message ?? error); throw error; }
  finally { fs.closeSync(output); }
}
const npmCliCandidates=[path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),...(process.env.npm_execpath?[process.env.npm_execpath]:[])];
const npmCli=npmCliCandidates.find(candidate=>path.isAbsolute(candidate)&&fs.existsSync(candidate)&&fs.lstatSync(candidate).isFile()&&!fs.lstatSync(candidate).isSymbolicLink());
if(flags.has('--verify')&&!npmCli)throw new Error('No reviewed npm CLI was found next to this Node runtime');
async function wslPath(windowsPath) {
  const logPath = path.join(logRoot,'wslpath.log'), output = fs.openSync(logPath,'wx');
  let text = '';
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn('wsl.exe',['-d',distro,'--exec','wslpath','-a',windowsPath.replaceAll('\\','/')],{env:cleanEnv,windowsHide:true,stdio:['ignore','pipe',output],shell:false});
      child.stdout.on('data',chunk=>{text += chunk.toString('utf8');}); child.once('error',reject); child.once('exit',code=>code===0?resolve():reject(new Error('Clean WSL path resolution failed; preserve '+logPath)));
    });
  } finally { fs.closeSync(output); }
  const value = text.trim();
  if (!value.startsWith('/') || /[\r\n\0]/.test(value)) throw new Error('Invalid clean WSL path');
  return value;
}
let runtime, lifecycleStarted = false;
async function cleanupOwnedRuntime() {
  if (!runtime) return;
  // The generated helper accepts only this fresh copy's recorded API identity.
  const helper = path.join(outputRoot,'stop-owned-api.ps1');
  const script = `param([string]$SourceRoot,[int]$ProcessId,[string]$RecordedAt)
$ErrorActionPreference='Stop'
$expected=(Join-Path $SourceRoot 'server/index.ts').Replace('/','\\')
$owned=Get-CimInstance Win32_Process -Filter ("ProcessId="+$ProcessId) -ErrorAction Stop
if(-not $owned){exit 0}
if($owned.Name -ne 'node.exe' -or -not $owned.CommandLine -or -not $owned.CommandLine.Replace('/','\\').Contains($expected)){throw 'API PID ownership mismatch; preserve process'}
$process=Get-Process -Id $ProcessId -ErrorAction Stop
if($process.StartTime.ToUniversalTime() -gt ([DateTime]$RecordedAt).ToUniversalTime()){throw 'API PID was reused; preserve process'}
Stop-Process -Id $ProcessId -Force
$deadline=(Get-Date).AddSeconds(10)
while((Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 100}
if(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue){throw 'Owned API process did not stop; preserve its namespace'}
`;
  fs.writeFileSync(helper,script,{flag:'wx'});
  await command('stop-owned-api','pwsh',['-NoProfile','-File',helper,'-SourceRoot',cleanRoot,'-ProcessId',String(runtime.apiProcessId),'-RecordedAt',runtime.startedAt]);
  const nativeScript = await wslPathForCleanup();
  await command('stop-owned-validator','wsl.exe',['-d',distro,'--exec','bash',nativeScript,'stop',runtime.nativeScope,release.sha256,String(rpcPort)]);
}
async function wslPathForCleanup() {
  // The path was already resolved before any runtime was launched.
  return manifest.cleanWslRoot + '/scripts/native-runtime.sh';
}
try {
  if (flags.has('--verify')) {
    if (process.version !== 'v22.14.0') throw new Error('Verification pins Node22.14.0; observed '+process.version);
    await command('npm-ci',process.execPath,[npmCli,'ci','--ignore-scripts']);
    await command('application-build',process.execPath,[npmCli,'run','build']);
    const cleanWslRoot = await wslPath(cleanRoot); manifest.cleanWslRoot = cleanWslRoot;
    const toolchainCheck = 'export PATH="$HOME/.cargo/bin:$HOME/.local/bondtrace-tools/solana-release/bin:$HOME/.local/bondtrace-tools:$PATH"; set -e; [[ "$(rustc --version)" == "rustc 1.91.0 "* ]]; [[ "$(solana --version)" == "solana-cli 3.1.10 "* ]]; [[ "$(anchor --version)" == "anchor-cli 1.1.2" ]]; rustc --version; solana --version; anchor --version';
    await command('toolchain-versions','wsl.exe',['-d',distro,'--exec','bash','-c',toolchainCheck]);
    await command('sbf-build-direct','wsl.exe',['-d',distro,'--exec','bash',cleanWslRoot+'/scripts/build-program.sh']);
    await command('frozen-sbf-check',process.execPath,['scripts/write-program-release.mjs','--check']);
    await command('node-tests',process.execPath,[npmCli,'test']);
    await command('ui-tests',process.execPath,[npmCli,'run','test:ui']);
    if (flags.has('--lifecycle')) {
      if (!fs.existsSync(path.join(cleanRoot,'scripts/strength-smoke.ts'))) throw new Error('strength-smoke.ts is not available in this staged snapshot; preserve it and stage a new source snapshot when ready');
      lifecycleStarted = true;
      await command('isolated-native-runtime',process.execPath,['scripts/run-runtime.mjs','-RpcPort',String(rpcPort),'-ApiPort',String(apiPort),'-NativeLedger']);
      const runtimePath = path.join(cleanRoot,'.local','backend-execution',release.sha256.slice(0,12),'runtime.json');
      runtime = JSON.parse(fs.readFileSync(runtimePath,'utf8').replace(/^\uFEFF/,''));
      if (runtime.programSha256 !== release.sha256 || runtime.apiOrigin !== cleanEnv.BONDTRACE_API_ORIGIN || runtime.rpcUrl !== cleanEnv.SOLANA_RPC_URL || runtime.ledgerStorage !== 'wsl-native' || runtime.wslDistro !== distro || !inside(cleanRoot,runtime.dataDirectory)) throw new Error('Clean runtime identity mismatch');
      manifest.runtime = runtime;
      cleanEnv.BONDTRACE_DATA_DIR = runtime.dataDirectory;
      const bootstrapId = 'clean-source-bootstrap-'+runId;
      fs.writeFileSync(path.join(outputRoot,'bootstrap.json'),JSON.stringify({operationId:bootstrapId})+'\n',{flag:'wx'});
      event('bootstrap-started',{operationId:bootstrapId});
      const reply = await fetch(runtime.apiOrigin+'/api/demo/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationId:bootstrapId}),signal:AbortSignal.timeout(180_000)});
      const result = await reply.json();
      fs.writeFileSync(path.join(outputRoot,'bootstrap-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
      if (!reply.ok || result.status !== 'confirmed') throw new Error('Clean bootstrap unresolved; preserve this ID and known signatures; do not create a second intent');
      event('bootstrap-confirmed',{operationId:bootstrapId});
      cleanEnv.BONDTRACE_STRENGTH_EVIDENCE = 'docs/evidence/execution-strength-clean-'+runId+'.json';
      cleanEnv.BONDTRACE_EXECUTION_EVIDENCE = 'docs/evidence/execution-clean-'+runId+'.json';
      await command('new-release-lifecycle',process.execPath,['--import','tsx','scripts/strength-smoke.ts']);
      manifest.evidence = filesForEvidence();
    }
    manifest.status = 'passed';
  }
} catch (error) {
  manifest.status = 'failed'; manifest.error = String(error.message ?? error);
  event('reproduction-failed',{error:manifest.error,lifecycleStarted}); process.exitCode = 1;
} finally {
  if (!runtime && lifecycleStarted) {
    const savedPath = path.join(cleanRoot,'.local','backend-execution',release.sha256.slice(0,12),'runtime.json');
    if (fs.existsSync(savedPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(savedPath,'utf8').replace(/^\uFEFF/,''));
        if (saved.programSha256 === release.sha256 && saved.apiOrigin === cleanEnv.BONDTRACE_API_ORIGIN && saved.rpcUrl === cleanEnv.SOLANA_RPC_URL && saved.ledgerStorage === 'wsl-native' && saved.wslDistro === distro && inside(cleanRoot,saved.dataDirectory)) runtime = saved;
      } catch { /* Preserve malformed identity; never stop an unverifiable PID. */ }
    }
    if (!runtime) manifest.unrecordedRuntimeNeedsInspection = true;
  }
  if (runtime && !flags.has('--keep-runtime')) {
    try { await cleanupOwnedRuntime(); manifest.runtimeProcessesStopped = true; }
    catch (error) { manifest.cleanupError = String(error.message ?? error); manifest.runtimeProcessesStopped = false; event('owned-cleanup-required',{error:manifest.cleanupError}); process.exitCode = 1; }
  } else if (runtime) manifest.runtimeProcessesStopped = false;
  Object.assign(manifest,verifySourceSnapshot(sourceRoot,cleanRoot,files));
  if (manifest.stagedSourceChanged.length||manifest.runtimeSourceChanged.length) {
    manifest.status = 'failed'; process.exitCode = 1;
    event('source-snapshot-changed',{staged:manifest.stagedSourceChanged,runtime:manifest.runtimeSourceChanged,presentation:manifest.presentationDrift});
  }else if(manifest.status==='passed'){
    manifest.status='passed_snapshot';
    event('immutable-source-snapshot-verified',{currentRuntimeSourceMatches:true,presentationDrift:manifest.presentationDrift,currentFrontendAcceptance:false});
  }
  manifest.finishedAt = new Date().toISOString();
  // Preserve the initial immutable manifest and every log; final result is separate.
  fs.writeFileSync(path.join(outputRoot,'result.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  event('reproduction-finished',{status:manifest.status,resultPath:path.join(outputRoot,'result.json'),runtimeProcessesStopped:manifest.runtimeProcessesStopped ?? null});
}
function filesForEvidence() {
  const directory = path.join(cleanRoot,'docs','evidence');
  return fs.readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>{
    const filename = path.join(directory,name), bytes = fs.readFileSync(filename);
    return {path:filename,bytes:bytes.length,sha256:hash(bytes)};
  });
}
