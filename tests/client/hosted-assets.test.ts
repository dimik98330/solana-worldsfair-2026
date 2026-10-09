import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyHostedAssets} from '../../scripts/hosted-assets.mjs';
const html='<script type="module" src="/assets/index-a.js"></script><link rel="stylesheet" href="/assets/index-b.css">';
test('hosted verifier inspects entry JS/CSS bytes and records hashes',async()=>{
 const seen:string[]=[];const assets=await verifyHostedAssets(html,async route=>{seen.push(route);return new Response(route.endsWith('.js')?'console.log(1)':'body{color:white}',{headers:{'content-type':route.endsWith('.js')?'text/javascript':'text/css'}});});
 assert.equal(assets.length,2);assert.equal(seen.length,2);assert.match(assets[0].sha256,/^[a-f0-9]{64}$/);assert.ok(assets[0].bytes>0);
});
test('hosted verifier rejects missing assets, wrong MIME and successful HTML fallbacks',async()=>{
 for(const response of [new Response('missing',{status:404}),new Response('<html>index</html>',{headers:{'content-type':'text/html'}}),new Response('<!DOCTYPE html>',{headers:{'content-type':'text/javascript'}}),new Response('',{headers:{'content-type':'text/javascript'}})])await assert.rejects(()=>verifyHostedAssets(html,async()=>response));
 await assert.rejects(()=>verifyHostedAssets('<h1>API ready</h1>',async()=>new Response('')));
});
