import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {resolveStaticBuild,staticAssetInside} from '../../server/static-build.ts';

function directories(){
  const base=path.resolve('.local/tests');fs.mkdirSync(base,{recursive:true});
  const directory=fs.mkdtempSync(path.join(base,'static-build-'));
  const root=path.join(directory,'workspace'),outside=path.join(directory,'outside');
  fs.mkdirSync(root);fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'index.html'),'<p>Outside</p>');
  return {root,outside};
}
test('static build override pins immutable UI while normal application build can change',()=>{
  const {root}=directories(),live=path.join(root,'apps/web/dist'),pinned=path.join(root,'.local/releases/ui');
  fs.mkdirSync(live,{recursive:true});fs.mkdirSync(pinned,{recursive:true});
  fs.writeFileSync(path.join(live,'index.html'),'new build');fs.writeFileSync(path.join(pinned,'index.html'),'published build');
  assert.equal(resolveStaticBuild(root),live);
  const selected=resolveStaticBuild(root,pinned);fs.writeFileSync(path.join(live,'index.html'),'another build');
  assert.equal(fs.readFileSync(path.join(selected,'index.html'),'utf8'),'published build');
});
test('static build override rejects empty values, workspace root and traversal outside',()=>{
  const {root,outside}=directories();
  for(const value of ['',root,outside,'../outside'])assert.throws(()=>resolveStaticBuild(root,value));
});
test('static build override rejects a junction or symlink escaping the workspace',()=>{
  const {root,outside}=directories(),link=path.join(root,'linked');
  fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>resolveStaticBuild(root,link));
});
test('final static asset cannot escape a valid build through a nested link',()=>{
  const {root,outside}=directories(),build=path.join(root,'dist');fs.mkdirSync(build);
  fs.writeFileSync(path.join(build,'index.html'),'inside');fs.mkdirSync(path.join(build,'assets'));
  const link=path.join(build,'assets','linked');fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
  assert.equal(staticAssetInside(build,path.join(build,'index.html')),true);
  assert.equal(staticAssetInside(build,path.join(link,'index.html')),false);
});
