import {withStore} from './store-links';
export function realtimeSignal(raw:unknown,storeId:string):{domain:'board'|'orders'|'menu';revision:string}|null{
 try{if(typeof raw!=='string'||raw.length>1024)return null;const value=JSON.parse(raw);if(value?.type!=='invalidate'||value.storeId!==storeId||!['board','orders','menu'].includes(value.domain)||typeof value.revision!=='string'||value.revision.length>100)return null;return {domain:value.domain,revision:value.revision};}catch{return null;}
}
/** Signals never carry authority or order data. The authenticated API remains the source of truth. */
export function connectStaffRealtime(storeId:string,onInvalidate:()=>void){
 let stopped=false,socket:WebSocket|null=null,backoff=1000;let retry:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined;const seen=new Set<string>();
 const connect=()=>{
  if(stopped||document.visibilityState==='hidden')return;
  const url=new URL(withStore('/api/realtime/ws',storeId),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  try{socket=new WebSocket(url);}catch{schedule();return;}
  socket.onopen=()=>{backoff=1000;onInvalidate();};
  socket.onmessage=event=>{const signal=realtimeSignal(event.data,storeId);if(!signal)return;const key=signal.domain+':'+signal.revision;if(seen.has(key))return;seen.add(key);if(seen.size>128)seen.delete(seen.values().next().value!);if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>{if(!stopped)onInvalidate();},150);};
  socket.onclose=()=>schedule();socket.onerror=()=>socket?.close();
 };
 const schedule=()=>{if(stopped)return;if(retry)clearTimeout(retry);retry=setTimeout(connect,backoff+Math.random()*500);backoff=Math.min(30000,backoff*2);};
 const visible=()=>{if(document.visibilityState==='visible'){if(socket?.readyState!==WebSocket.OPEN&&socket?.readyState!==WebSocket.CONNECTING)connect();}else socket?.close();};
 document.addEventListener('visibilitychange',visible);connect();
 const heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send('ping');},25000);
 return()=>{stopped=true;if(retry)clearTimeout(retry);if(debounce)clearTimeout(debounce);clearInterval(heartbeat);document.removeEventListener('visibilitychange',visible);socket?.close();};
}
