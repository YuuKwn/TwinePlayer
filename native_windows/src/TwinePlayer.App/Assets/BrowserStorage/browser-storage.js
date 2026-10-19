// Trusted migration workspace only. Original profiles are never opened here.
(()=>{'use strict';
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const complete=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error||new Error('Database transaction aborted'));t.onerror=()=>reject(t.error);});
const bytesToBase64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);};
const fromBase64=value=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
async function encode(value){
  const nodes=[],seen=new Map();
  async function visit(v,depth=0){
    if(depth>512)throw new Error('Stored value exceeds the migration depth limit.');
    if(v===undefined)return {t:'undefined'};
    if(typeof v==='bigint')return {t:'bigint',v:String(v)};
    if(typeof v==='number'&&!Number.isFinite(v))return {t:'number',v:String(v)};
    if(typeof v==='number'&&Object.is(v,-0))return {t:'number',v:'-0'};
    if(v===null||typeof v!=='object')return {v};
    if(seen.has(v))return {r:seen.get(v)};
    if(nodes.length>=100000)throw new Error('Stored value exceeds the graph limit.');
    const id=nodes.length,node={};seen.set(v,id);nodes.push(node);
    if(v instanceof Date)Object.assign(node,{kind:'date',value:Number.isNaN(v.getTime())?null:v.getTime()});
    else if(v instanceof RegExp)Object.assign(node,{kind:'regexp',source:v.source,flags:v.flags});
    else if(v instanceof ArrayBuffer)Object.assign(node,{kind:'buffer',value:bytesToBase64(new Uint8Array(v))});
    else if(ArrayBuffer.isView(v))Object.assign(node,{kind:'view',name:v.constructor.name,buffer:await visit(v.buffer,depth+1),offset:v.byteOffset,length:v instanceof DataView?v.byteLength:v.length});
    else if(v instanceof Blob)Object.assign(node,{kind:v instanceof File?'file':'blob',type:v.type,value:bytesToBase64(new Uint8Array(await v.arrayBuffer())),name:v instanceof File?v.name:null,lastModified:v instanceof File?v.lastModified:null});
    else if(v instanceof Map){node.kind='map';node.entries=[];for(const [k,item]of v)node.entries.push([await visit(k,depth+1),await visit(item,depth+1)]);}
    else if(v instanceof Set){node.kind='set';node.entries=[];for(const item of v)node.entries.push(await visit(item,depth+1));}
    else if(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null){node.kind=Array.isArray(v)?'array':'object';node.length=Array.isArray(v)?v.length:null;node.entries=[];for(const key of Object.keys(v))node.entries.push([key,await visit(v[key],depth+1)]);}
    else throw new Error('Unsupported stored value type: '+Object.prototype.toString.call(v));
    return {r:id};
  }
  const root=await visit(value);return {root,nodes};
}
function decode(graph){
  const values=new Array(graph.nodes.length),building=new Set();
  const constructors={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,DataView};
  function read(item){if(Object.hasOwn(item,'r'))return build(item.r);if(item.t==='undefined')return undefined;if(item.t==='bigint')return BigInt(item.v);if(item.t==='number')return item.v==='-0'?-0:Number(item.v);return item.v;}
  function build(id){
    if(Object.hasOwn(values,id))return values[id];const node=graph.nodes[id];if(!node)throw new Error('Invalid graph reference.');
    if(building.has(id))throw new Error('Invalid graph construction cycle.');building.add(id);
    let value;
    switch(node.kind){
      case 'array':value=new Array(node.length);break;case 'object':value={};break;case 'map':value=new Map();break;case 'set':value=new Set();break;
      case 'date':value=new Date(node.value===null?NaN:node.value);break;case 'regexp':value=new RegExp(node.source,node.flags);break;
      case 'buffer':value=fromBase64(node.value).buffer;break;
      case 'view':{const C=constructors[node.name];if(!C)throw new Error('Unsupported typed view.');value=new C(read(node.buffer),node.offset,node.length);break;}
      case 'blob':value=new Blob([fromBase64(node.value)],{type:node.type});break;
      case 'file':value=new File([fromBase64(node.value)],node.name,{type:node.type,lastModified:node.lastModified});break;
      default:throw new Error('Unsupported graph node.');
    }
    values[id]=value;building.delete(id);
    if(node.kind==='array'||node.kind==='object')for(const [key,item]of node.entries)Object.defineProperty(value,key,{value:read(item),enumerable:true,writable:true,configurable:true});
    if(node.kind==='map')for(const [key,item]of node.entries)value.set(read(key),read(item));
    if(node.kind==='set')for(const item of node.entries)value.add(read(item));
    return value;
  }
  return read(graph.root);
}
async function catalog(){
  const databases=[];
  for(const info of await indexedDB.databases()){
    if(!info.name)continue;const db=await request(indexedDB.open(info.name));
    try{const stores=[];for(const name of db.objectStoreNames){const tx=db.transaction(name,'readonly'),done=complete(tx),count=await request(tx.objectStore(name).count());await done;stores.push({name,count});}databases.push({name:db.name,version:db.version,stores});}finally{db.close();}
  }
  return {schema:1,origin:location.origin,localStorage:Object.keys(localStorage).sort().map(key=>({name:key,characters:localStorage.getItem(key).length})),databases};
}
function injectKey(path,key){const value={};if(path===null)return value;const parts=path.split('.');let at=value;for(const part of parts.slice(0,-1)){Object.defineProperty(at,part,{value:{},enumerable:true,writable:true});at=at[part];}Object.defineProperty(at,parts.at(-1),{value:key,enumerable:true,writable:true});return value;}
async function nextKey(db,name){
  const tx=db.transaction(name,'readwrite'),store=tx.objectStore(name);let key;
  await new Promise((resolve,reject)=>{tx.onabort=()=>key===undefined?reject(new Error('Cannot read auto-increment generator.')):resolve();tx.onerror=()=>{};const probe=store.add({});probe.onsuccess=()=>{key=probe.result;tx.abort();};probe.onerror=()=>{tx.abort();};});return key;
}
async function exportSelected(selection){
  const data={schema:1,origin:location.origin,localStorage:[],databases:[]};
  for(const key of selection.localStorage){const value=localStorage.getItem(key);if(value===null)throw new Error('Source key changed since preview.');data.localStorage.push({key,value});}
  for(const name of selection.databases){
    const existing=(await indexedDB.databases()).find(item=>item.name===name);if(!existing)throw new Error('Source database changed since preview.');
    const db=await request(indexedDB.open(name));
    try{
      const exported={name,version:db.version,stores:[]};
      for(const storeName of db.objectStoreNames){
        const tx=db.transaction(storeName,'readonly'),done=complete(tx),store=tx.objectStore(storeName);
        const definition={name:storeName,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:[...store.indexNames].map(index=>{const item=store.index(index);return {name:item.name,keyPath:item.keyPath,unique:item.unique,multiEntry:item.multiEntry};})};
        const [keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);await done;
        definition.records=[];for(let i=0;i<keys.length;i++)definition.records.push({key:await encode(keys[i]),value:await encode(values[i])});
        if(definition.autoIncrement)definition.nextKey=await nextKey(db,storeName);
        exported.stores.push(definition);
      }
      data.databases.push(exported);
    }finally{db.close();}
  }
  return JSON.stringify(data);
}
async function importSelected(json){
  const data=JSON.parse(json);if(data.schema!==1)throw new Error('Unsupported storage snapshot.');
  const result={imported:[],skipped:[]};
  for(const database of data.databases){
    if((await indexedDB.databases()).some(item=>item.name===database.name)){result.skipped.push('database:'+database.name);continue;}
    const prepared=database.stores.map(store=>({...store,records:store.records.map(record=>({key:decode(record.key),value:decode(record.value)}))}));
    const open=indexedDB.open(database.name,database.version);let created=false;
    open.onupgradeneeded=event=>{if(event.oldVersion!==0){open.transaction.abort();return;}created=true;try{for(const definition of prepared){const store=open.result.createObjectStore(definition.name,{keyPath:definition.keyPath,autoIncrement:definition.autoIncrement});for(const index of definition.indexes)store.createIndex(index.name,index.keyPath,{unique:index.unique,multiEntry:index.multiEntry});for(const record of definition.records){if(definition.keyPath===null)store.put(record.value,record.key);else store.put(record.value);}if(definition.autoIncrement&&definition.nextKey>1){const key=definition.nextKey-1;if(!definition.records.some(record=>record.key===key)){const value=injectKey(definition.keyPath,key);if(definition.keyPath===null)store.put(value,key);else store.put(value);store.delete(key);}}}}catch(error){open.transaction.abort();}};
    const db=await request(open);db.close();(created?result.imported:result.skipped).push('database:'+database.name);
  }
  for(const item of data.localStorage){if(localStorage.getItem(item.key)!==null){result.skipped.push('localStorage:'+item.key);continue;}localStorage.setItem(item.key,item.value);result.imported.push('localStorage:'+item.key);}
  return result;
}
window.nativeBrowserStorage={catalog,exportSelected,importSelected,encode,decode};
})();
