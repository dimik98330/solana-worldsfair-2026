import { spawn } from 'node:child_process';
const children=[
  spawn(process.execPath,['--env-file-if-exists=.env','node_modules/tsx/dist/cli.mjs','watch','server/index.ts'],{stdio:'inherit',windowsHide:true}),
  spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',windowsHide:true})
];
const stop=()=>{for(const child of children)child.kill();};
process.on('SIGINT',()=>{stop();process.exit(0);});
process.on('SIGTERM',()=>{stop();process.exit(0);});
for(const child of children)child.on('exit',code=>{if(code){stop();process.exit(code);}});
