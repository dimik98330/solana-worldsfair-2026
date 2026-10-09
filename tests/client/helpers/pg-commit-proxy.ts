import net from 'node:net';
import http from 'node:http';
/** Owned plaintext loopback test proxy: drops a COMMIT acknowledgement after the real server committed. */
export async function pgCommitProxy(upstreamPort:number){
 let armed=false,dropped=false;const sockets=new Set<net.Socket>(),token=crypto.randomUUID();
 const proxy=net.createServer(front=>{
  const back=net.connect(upstreamPort,'127.0.0.1');sockets.add(front);sockets.add(back);let buffer=Buffer.alloc(0);
  front.on('data',data=>back.write(data));
  back.on('data',data=>{
   buffer=Buffer.concat([buffer,data]);
   while(buffer.length>=5){const size=buffer.readInt32BE(1)+1;if(size<5||size>64*1024*1024){front.destroy();back.destroy();return;}if(buffer.length<size)return;
    const packet=buffer.subarray(0,size);buffer=buffer.subarray(size);
    if(armed&&packet[0]===67&&packet.subarray(5).toString('utf8')==='COMMIT\0'){armed=false;dropped=true;front.destroy();back.destroy();return;}
    front.write(packet);
   }
  });
  front.on('error',()=>back.destroy());back.on('error',()=>front.destroy());front.on('close',()=>{sockets.delete(front);back.destroy();});back.on('close',()=>{sockets.delete(back);front.destroy();});
 });
 const control=http.createServer((req,res)=>{if(req.method==='POST'&&req.url==='/arm-'+token){armed=true;res.end('armed');}else{res.writeHead(404);res.end();}});
 await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));await new Promise<void>(r=>control.listen(0,'127.0.0.1',r));
 return {port:(proxy.address() as net.AddressInfo).port,armUrl:'http://127.0.0.1:'+(control.address() as net.AddressInfo).port+'/arm-'+token,get dropped(){return dropped;},async close(){for(const socket of sockets)socket.destroy();control.closeAllConnections();await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>control.close(()=>r()))]);}};
}
