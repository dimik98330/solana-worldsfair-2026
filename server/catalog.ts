import fs from 'node:fs';
import path from 'node:path';
import {address} from '@solana/kit';
import {localDir} from './config.ts';
import {AppError} from './rpc.ts';
import {readJson,listDocuments,transactionSync} from './storage.ts';
import {fixture, jsonWrite, type Fixture} from './store.ts';
import {validateRateEvidence,type RateTermsEvidence} from './rate-terms.ts';

export interface V2DiscoveryWindow {proposalLimit:512;holderLabelLimit:128;proposalHistoryTruncated:boolean;holderLabelsTruncated:boolean;}
export interface CatalogRecord extends Fixture {
  source: 'wallet' | 'demo';
  protocolVersion?: 2;
  holderLabels?: Record<string, string>;
  rateTerms?: RateTermsEvidence;
  discoveryWindow?: V2DiscoveryWindow;
}
const directory = path.join(localDir, 'catalog');
const MAX_RECORD_BYTES = 32_768;
const MAX_RECORDS = 250;
function fail(message: string): never { throw new AppError('INVALID_CATALOG', message); }
function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) fail('Invalid catalog address');
  try { return String(address(value)); } catch { return fail('Invalid catalog address'); }
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > max || Buffer.from(value).toString('utf8') !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail('Invalid catalog text');
  return value;
}
function uint(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || BigInt(value) > (1n << 64n) - 1n) fail('Invalid catalog integer');
  return BigInt(value).toString();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid catalog object');
  return value as Record<string, unknown>;
}
function validate(value: unknown): CatalogRecord {
  const v = object(value), source = v.source;
  if(v.protocolVersion!==undefined&&v.protocolVersion!==2)fail('Invalid instrument protocol version');
  let discoveryWindow:V2DiscoveryWindow|undefined;
  if(v.discoveryWindow!==undefined){const w=object(v.discoveryWindow);if(v.protocolVersion!==2||Object.keys(w).some(k=>!['proposalLimit','holderLabelLimit','proposalHistoryTruncated','holderLabelsTruncated'].includes(k))||w.proposalLimit!==512||w.holderLabelLimit!==128||typeof w.proposalHistoryTruncated!=='boolean'||typeof w.holderLabelsTruncated!=='boolean')fail('Invalid V2 discovery cache disclosure');discoveryWindow={proposalLimit:512,holderLabelLimit:128,proposalHistoryTruncated:w.proposalHistoryTruncated,holderLabelsTruncated:w.holderLabelsTruncated};}
  if (source !== 'wallet' && source !== 'demo') fail('Invalid catalog source');
  const roles: Record<string, string> = {}, roleEntries = Object.entries(object(v.roles));
  if (!roleEntries.length || roleEntries.length > 17) fail('Invalid catalog roles');
  for (const [role, wallet] of roleEntries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(role) || ['constructor', 'prototype', '__proto__'].includes(role)) fail('Invalid catalog role');
    roles[role] = key(wallet);
  }
  if (!roles.issuer) fail('Catalog issuer is required');
  if (!Array.isArray(v.proposalIds) || v.proposalIds.length > (v.protocolVersion===2?512:32)) fail('Invalid catalog proposals');
  const proposalIds = [...new Set(v.proposalIds.map(uint))];
  const holderLabels: Record<string, string> = {};
  if (v.holderLabels !== undefined) {
    const labels = Object.entries(object(v.holderLabels));
    if (labels.length > (v.protocolVersion===2?512:16)) fail('Too many catalog holder labels');
    for (const [wallet, label] of labels) holderLabels[key(wallet)] = text(label, 64);
  }
  if (typeof v.complete !== 'boolean' || typeof v.accelerated !== 'boolean') fail('Invalid catalog flags');
  if (typeof v.createdAt !== 'string' || v.createdAt.length > 40 || !Number.isFinite(Date.parse(v.createdAt))) fail('Invalid catalog timestamp');
  if (typeof v.rateBps !== 'number' || !Number.isSafeInteger(v.rateBps) || v.rateBps < 0 || v.rateBps > 10_000) fail('Invalid catalog rate');
  if (typeof v.couponFrequency !== 'number' || !Number.isSafeInteger(v.couponFrequency) || v.couponFrequency < 0 || v.couponFrequency > 12) fail('Invalid catalog frequency');
  const rateTerms = v.rateTerms === undefined ? undefined : validateRateEvidence(v.rateTerms, key(v.bond), roles.issuer);
  if (rateTerms && (v.rateBps !== Number(rateTerms.rateBps) || v.couponFrequency !== Number(rateTerms.couponFrequency))) fail('Catalog annual rate and frequency differ from signed creation evidence');
  if (source === 'wallet' && !rateTerms && v.protocolVersion!==2 && (v.rateBps !== 0 || v.couponFrequency !== 0)) fail('Fixed coupon terms do not imply an annual rate');
  const record: CatalogRecord = {
    seriesId: uint(v.seriesId), bond: key(v.bond), name: text(v.name, 64), settlementMint: key(v.settlementMint),
    createdAt: v.createdAt, rateBps: v.rateBps, couponFrequency: v.couponFrequency, roles, proposalIds,
    complete: v.complete, accelerated: v.accelerated, source,
    ...(v.protocolVersion===2?{protocolVersion:2 as const}:{}),
    ...(Object.keys(holderLabels).length ? {holderLabels} : {}),
    ...(rateTerms ? {rateTerms} : {}),
    ...(discoveryWindow?{discoveryWindow}:{}),
  };
  if (v.bootstrapSignature !== undefined) {
    if (typeof v.bootstrapSignature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(v.bootstrapSignature)) fail('Invalid catalog signature');
    record.bootstrapSignature = v.bootstrapSignature;
  }
  if (Buffer.byteLength(JSON.stringify(record)) > MAX_RECORD_BYTES) fail('Catalog metadata exceeds the size limit');
  return record;
}
function safeDirectory(create = false) {
  if (create) fs.mkdirSync(directory, {recursive: true});
  if (fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(directory).isDirectory())) fail('Catalog directory must be a regular local directory');
}
function fileFor(bond: string) {
  const file = path.join(directory, key(bond) + '.json');
  if (path.dirname(file) !== directory) fail('Catalog path must remain inside the data directory');
  safeDirectory();
  for (const candidate of [file, file + '.tmp']) if (fs.existsSync(candidate) && (fs.lstatSync(candidate).isSymbolicLink() || !fs.lstatSync(candidate).isFile())) fail('Catalog file must be a regular local file');
  return file;
}
function legacy(): CatalogRecord | null {
  const value = fixture();
  return value ? validate({...value, source: 'demo'}) : null;
}
export function readCatalog(bond: string): CatalogRecord | null {
  const file = fileFor(bond);
  const stored=readJson<CatalogRecord|null>(file,null);
  if (stored) {
    const value = validate(stored);
    if (value.bond !== bond) fail('Catalog file address does not match its identity');
    return value;
  }
  const value = legacy();
  return value?.bond === bond ? value : null;
}
export function listCatalog(): CatalogRecord[] {
  safeDirectory();
  const filenames = listDocuments(directory).map(file=>path.basename(file));
  if (filenames.length > MAX_RECORDS) fail('Catalog capacity exceeded');
  const values = filenames.map(file => readCatalog(file.slice(0, -5))!).filter(Boolean);
  const demo = legacy();
  if (demo && !values.some(value => value.bond === demo.bond)) values.push(demo);
  return values.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
/** Public local projection; rate provenance is immutable signed-creation evidence, not Bond fields. */
export function saveCatalog(record: CatalogRecord) {
  return transactionSync(()=>{
  const value = validate(record), file = fileFor(value.bond), previous = readCatalog(value.bond);
  if (previous && (previous.seriesId !== value.seriesId || previous.roles.issuer !== value.roles.issuer || previous.settlementMint !== value.settlementMint || previous.source !== value.source)) fail('Catalog identity cannot be replaced');
  if (previous && JSON.stringify(previous.rateTerms) !== JSON.stringify(value.rateTerms)) fail('Catalog annual-rate creation evidence cannot be replaced');
  if (!previous && listCatalog().length >= MAX_RECORDS) fail('Catalog capacity exceeded');
  safeDirectory(true);
  jsonWrite(file, value);
  });
}
