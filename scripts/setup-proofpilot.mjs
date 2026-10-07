import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadDependencyManifest } from '../../proofpilot-source/skills/proofpilot/scripts/install-dependencies.js';
import { installPackage } from '../../proofpilot-source/scripts/install-package.js';
// HTTPS fallback for stalled Git pack transfer. Pins and installer policy remain unchanged.
const base = path.resolve('.local/verified-dependency-sources');
const manifest = loadDependencyManifest();
fs.mkdirSync(base, {recursive:true});
async function get(url) {
  const response = await fetch(url, {headers:{'User-Agent':'Solana-ProofPilot-Pinned-Installer'}, signal:AbortSignal.timeout(45000), redirect:'error'});
  if (!response.ok) throw new Error(`Source fetch HTTP ${response.status} for ${url}`);
  return response;
}
const inventory = [];
for (const source of manifest.sources) {
  const commit = await (await get(`https://api.github.com/repos/${source.repo}/git/commits/${source.ref}`)).json();
  if (commit.sha !== source.ref) throw new Error('Pinned commit mismatch');
  const tree = await (await get(`https://api.github.com/repos/${source.repo}/git/trees/${commit.tree.sha}?recursive=1`)).json();
  if (tree.truncated || tree.sha !== commit.tree.sha) throw new Error('Incomplete or mismatched source tree');
  const wanted = [...source.skills.map(s=>s.path), ...source.assets.map(a=>a.path), ...(source.license_path?[source.license_path]:[])];
  const files = tree.tree.filter(entry=>entry.type!=='tree' && wanted.some(p=>entry.path===p||entry.path.startsWith(p+'/')));
  const target = path.join(base, source.id);
  const folded = new Set();
  for (const file of files) {
    if (file.type !== 'blob' || !['100644','100755'].includes(file.mode) || file.path.includes('\\') || file.path.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*]/.test(p))) throw new Error('Unsupported source path/type');
    const key=file.path.normalize('NFKC').toLowerCase();
    if(folded.has(key)) throw new Error('Colliding source path');
    folded.add(key);
  }
  let cursor=0;
  let bytes=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(cursor<files.length) {
      const file=files[cursor++];
      const output=path.join(target,...file.path.split('/'));
      let data=fs.existsSync(output)?fs.readFileSync(output):null;
      const hash=b=>crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
      if(data && hash(data)!==file.sha) throw new Error('Existing cache content mismatch; preserve and investigate');
      if(!data) {
        data=Buffer.from(await (await get(`https://raw.githubusercontent.com/${source.repo}/${source.ref}/${file.path}`)).arrayBuffer());
        if(hash(data)!==file.sha) throw new Error(`Git blob integrity mismatch: ${source.id}/${file.path}`);
        fs.mkdirSync(path.dirname(output),{recursive:true});
        fs.writeFileSync(output,data,{flag:'wx'});
      }
      bytes+=data.length;
    }
  }));
  inventory.push({id:source.id,repo:source.repo,commit:source.ref,tree:tree.sha,verifiedFiles:files.length,bytes});
  console.log(JSON.stringify(inventory.at(-1)));
}
fs.writeFileSync('.local/source-integrity.json',JSON.stringify(inventory,null,2));
const result=installPackage({destination:path.resolve('.agents/skills/proofpilot'),profiles:true,mode:'copy'}, {
  sourceProvider:source=>path.join(base,source.id),
  progress:message=>console.log(message)
});
fs.writeFileSync('.local/proofpilot-install-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({destination:result.destination,profiles:result.profiles,skills:result.dependencies?.skills.length,complete:result.dependencies?.complete,installed:result.installed}));
