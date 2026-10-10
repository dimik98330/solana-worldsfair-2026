import {AppError} from './rpc.ts';
import type {CatalogRecord,V2DiscoveryWindow} from './catalog.ts';

export const V2_PROPOSAL_CACHE_LIMIT=512;
export const V2_HOLDER_LABEL_CACHE_LIMIT=128;
function canonicalId(value:unknown):string{
  if(typeof value!=='string'||!/^\d{1,20}$/.test(value)||BigInt(value)>4294967295n)throw new AppError('INVALID_CATALOG','V2 discovery IDs must be canonical u32 values');
  return BigInt(value).toString();
}
/** These are optional discovery/display caches, never the holder registry,
 * immutable snapshots, financial history, operation IDs or retained receipts.
 * Proposal order follows the reader's newest numeric-ID window; old IDs remain
 * addressable directly on chain through an explicitly pinned vote request. */
export function compactV2CatalogProjection(record:CatalogRecord):CatalogRecord{
  if(record.protocolVersion!==2)throw new AppError('INVALID_CATALOG','V2 metadata compaction cannot rewrite a legacy catalog');
  const unique=[...new Set(record.proposalIds.map(canonicalId))].sort((a,b)=>Number(a)-Number(b)),labels=Object.entries(record.holderLabels??{}),previous=record.discoveryWindow;
  const discoveryWindow:V2DiscoveryWindow={proposalLimit:V2_PROPOSAL_CACHE_LIMIT,holderLabelLimit:V2_HOLDER_LABEL_CACHE_LIMIT,
    proposalHistoryTruncated:Boolean(previous?.proposalHistoryTruncated)||unique.length>V2_PROPOSAL_CACHE_LIMIT,
    holderLabelsTruncated:Boolean(previous?.holderLabelsTruncated)||labels.length>V2_HOLDER_LABEL_CACHE_LIMIT};
  return {...record,proposalIds:unique.slice(-V2_PROPOSAL_CACHE_LIMIT),...(record.holderLabels?{holderLabels:Object.fromEntries(labels.slice(-V2_HOLDER_LABEL_CACHE_LIMIT))}:{}),discoveryWindow};
}
