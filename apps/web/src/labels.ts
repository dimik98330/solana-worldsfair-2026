import type { DemoRole, View } from './types';

// Shared label maps for roles and views. English strings double as t()/tr keys.
export const roleLabels: Record<DemoRole, string> = { issuer: 'Issuer', investor1: 'Investor 01', investor2: 'Investor 02', investor3: 'Investor 03' };
export const viewLabels: Record<View, string> = { overview: 'Overview', registry: 'Holder registry', payments: 'Payments', portfolio: 'Portfolio', voting: 'Holder voting', issuer: 'Issuer desk' };
