/** Labels describe generated identities, not issuer permission on another bond. */
export function isKnownDemoWallet(wallet:string,roles:Record<string,string>|undefined):boolean {
  return Boolean(roles&&Object.values(roles).includes(wallet));
}
