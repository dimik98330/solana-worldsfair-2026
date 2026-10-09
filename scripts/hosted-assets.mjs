import {createHash} from 'node:crypto';
/** Verify actual entry bytes, not merely an index.html reference to a missing bundle. */
export async function verifyHostedAssets(html,request){
 const paths=[...new Set([...html.matchAll(/\b(?:src|href)=["'](\/assets\/[^"'#?]+)["']/g)].map(match=>match[1]).filter(route=>/\.(?:js|css)$/.test(route)))];
 if(!paths.some(route=>route.endsWith('.js'))||!paths.some(route=>route.endsWith('.css')))throw new Error('Built entry JavaScript and CSS references are required');
 const assets=[];
 for(const route of paths){
  if(route.includes('..')||route.includes('\\'))throw new Error('Invalid entry asset path');
  const response=await request(route),type=(response.headers.get('content-type')??'').split(';')[0];
  const allowed=route.endsWith('.js')?['text/javascript','application/javascript']:['text/css'];
  if(response.status!==200||!allowed.includes(type))throw new Error('Entry asset is missing or has an incorrect MIME type: '+route);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length||bytes.length>8*1024*1024||/^\s*(?:<!doctype|<html)/i.test(bytes.toString('utf8',0,Math.min(bytes.length,100))))throw new Error('Entry asset is empty, oversized or contains the HTML fallback: '+route);
  assets.push({path:route,type,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 return assets;
}
