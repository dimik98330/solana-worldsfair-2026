export function verifyHostedAssets(html:string,request:(path:string)=>Promise<Response>):Promise<{path:string;type:string;bytes:number;sha256:string}[]>;
