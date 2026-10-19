// Test tooling only. Requires Node 22+ and a loopback-only test debugging port.
async function connect(url,onEvent=()=>{}){
  if(typeof WebSocket==='undefined')throw new Error('Use Node 22 or later.');
  const ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',error=>{clearTimeout(timer);reject(error);},{once:true});});
  let next=0;const pending=new Map();
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id){onEvent(m.method,m.params);return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);});
  ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP connection closed'));}pending.clear();});
  return {async call(method,params={}){const id=++next;return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});},close(){ws.close();}};
}
async function evaluate(cdp,expression){const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
module.exports={connect,evaluate};
