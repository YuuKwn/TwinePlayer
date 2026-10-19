const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),crypto=require('node:crypto');
const {connect,evaluate}=require('./webview-cdp');
const repo=path.resolve(__dirname,'../..');
const input=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(path.join(input,'capture-report.json')))throw new Error('Pass a completed native save-smoke directory.');
const executable=path.resolve(process.argv[3]||path.join(repo,'artifacts/TwinePlayer-Flutter-BENCHMARK-20261016/twine_player_flutter.exe'));
if(!fs.existsSync(path.join(path.dirname(executable),'BENCHMARK-ONLY.txt')))throw new Error('Use the isolated benchmark-only Flutter entry point.');
const output=path.join(repo,'artifacts','flutter-rollback-'+crypto.randomUUID());fs.mkdirSync(output,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
  const payloadFile=path.join(input,'capture-payload.bin');let game=path.join(input,'PrivateTestGame.html');const originalHash=hash(payloadFile);
  if(process.argv.includes('--capture-save')){const copy=path.join(output,'PrivateTestGame.html');fs.copyFileSync(game,copy);game=copy;}
  const expected=JSON.parse(fs.readFileSync(path.join(input,'capture-report.json'),'utf8').replace(/^\uFEFF/,''));
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const child=cp.spawn(executable,[],{cwd:path.dirname(executable),windowsHide:true,stdio:'ignore',env:{...process.env,TWINEPLAYER_BENCHMARK_ROOT:output,TWINEPLAYER_BENCHMARK_STORY:game,WEBVIEW2_USER_DATA_FOLDER:path.join(output,'browser'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  let exited=false;child.on('exit',()=>{exited=true});let cdp;const report={passed:false,sourceNativeDirectory:input,gameSha256:hash(game),payloadSha256:originalHash,flutterExeSha256:hash(executable),flutterAotSha256:hash(path.join(path.dirname(executable),'data/app.so'))};
  try{
    for(let attempt=0;attempt<300;attempt++){
      if(exited)throw new Error('Flutter exited before playback.');
      try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const page=pages.find(p=>p.type==='page'&&p.url.startsWith('https://twineplayer.local/'));if(page){cdp=await connect(page.webSocketDebuggerUrl,(method,params)=>{if(method==='Page.javascriptDialogOpening'){report.dialogs=(report.dialogs||[]).concat(params.type);void cdp.call('Page.handleJavaScriptDialog',{accept:false});}});if(await evaluate(cdp,"!!((window.SugarCube?.State?.passage||window.SugarCube?.state?.active?.title)&&window.__twinePlayerRestoreSave&&document.querySelector('#passages .passage'))"))break;cdp.close();cdp=null;}}catch(error){if(attempt===299)throw error;}await sleep(100);
    }
    if(!cdp)throw new Error('Actual Flutter WebView2 did not render the game.');
    report.runtime=await cdp.call('Browser.getVersion');
    report.restoreReceipt=await evaluate(cdp,`window.__twinePlayerRestoreSave(${JSON.stringify(fs.readFileSync(payloadFile,'utf8'))})`);
    if(!report.restoreReceipt?.ok){
      if(!process.argv.includes('--legacy-game-import'))throw new Error('Unchanged Flutter bridge rejected native save: '+JSON.stringify(report.restoreReceipt));
      report.rollbackMethod='SugarCube 1 game-owned disk import; unchanged Flutter host bridge unsupported';
      report.gameImport=await evaluate(cdp,`(()=>{if(!window.SugarCube?.SaveSystem?.importSave)throw new Error('No legacy game disk import');const input=document.createElement('input');input.type='file';const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(fs.readFileSync(payloadFile,'utf8'))}],'twineplayer.save',{type:'text/plain'}));input.files=transfer.files;SugarCube.SaveSystem.importSave({target:input});return {requested:true};})()`);
    }else report.rollbackMethod='unchanged Flutter host bridge';
    for(let attempt=0;attempt<100;attempt++){report.restored=await evaluate(cdp,"(()=>{const s=SugarCube.State||SugarCube.state;return {passage:s.passage||s.active.title,marker:(s.variables||s.active.variables).__nativePhase2Marker||null};})()");if(report.restored.marker===expected.marker)break;await sleep(100);}
    if(report.restored.marker!==expected.marker||report.restored.passage!==expected.passage)throw new Error('Flutter did not restore the native passage and variable.');
    if(hash(payloadFile)!==originalHash)throw new Error('Rollback changed the original native save.');
    if(process.argv.includes('--capture-save')){
      await evaluate(cdp,"SugarCube.State.variables.__flutterCapturedHere=true;SugarCube.Engine.play(SugarCube.State.passage);true");
      const capture=await evaluate(cdp,'window.__twinePlayerCaptureSave()');
      if(!capture?.ok||capture.pending||typeof capture.data!=='string')throw new Error('Flutter capture did not return a direct supported payload: '+JSON.stringify({ok:capture?.ok,pending:capture?.pending,error:capture?.error}));
      const captured=path.join(output,'flutter-captured-payload.bin');fs.writeFileSync(captured,capture.data,'utf8');
      fs.writeFileSync(path.join(output,'expected-passage.txt'),expected.passage,'utf8');
      report.flutterCapture={format:capture.format,bytes:fs.statSync(captured).size,sha256:hash(captured)};report.roundtripGame=game;
    }
    if(process.argv.includes('--seed-browser-migration')){
      await cdp.call('Page.enable');report.seedStep='indexeddb';report.migrationSeed=await evaluate(cdp,"(async()=>{localStorage.setItem('__nativeBrowserMigration','legacy-value');localStorage.setItem('__nativePreserved','legacy-conflict');const r=indexedDB.open('__nativeMigrationFixture',3);const db=await new Promise((resolve,reject)=>{r.onupgradeneeded=()=>{const s=r.result.createObjectStore('records',{keyPath:'id',autoIncrement:true});s.createIndex('byName','name',{unique:true});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const tx=db.transaction('records','readwrite');const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});const value={name:'fixture',date:new Date('2020-02-03T04:05:06Z'),bytes:new Uint8Array([1,2,3]),blob:new Blob(['blob-payload'],{type:'text/plain'}),map:new Map([['answer',42]]),set:new Set(['one','two'])};value.self=value;tx.objectStore('records').add(value);const deleted=tx.objectStore('records').add({name:'deleted'});deleted.onsuccess=()=>tx.objectStore('records').delete(deleted.result);await done;db.close();return {seeded:true,marker:SugarCube.State.variables.__nativePhase2Marker};})()");
      report.seedStep='browser-slot';
      report.browserSlot=await evaluate(cdp,"(async()=>{SugarCube.Config.saves.isAllowed=()=>true;const saves=SugarCube.Save||window.Save;if(saves.browser?.slot?.save)return await saves.browser.slot.save(0,'Native migration fixture');if(saves.slots?.save)return saves.slots.save(0,'Native migration fixture');throw new Error('No browser slot API');})()");
      report.seedStep='cookie';
      const receipt=await cdp.call('Network.setCookie',{name:'native-migration-cookie',value:'cookie-value',url:'https://twineplayer.local/',path:'/subpath',secure:true,httpOnly:true,sameSite:'Strict',expires:Date.now()/1000+3600});if(!receipt.success)throw new Error('Migration cookie seed failed');
    }
    report.passed=true;
  }catch(error){report.error=error.stack;process.exitCode=1;}
  finally{
    cdp?.close();fs.writeFileSync(path.join(output,'stop'),'stop');for(let attempt=0;attempt<60&&!exited;attempt++)await sleep(100);
    if(!exited){cp.execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});report.passed=false;report.shutdownError='Flutter did not close cleanly';process.exitCode=1;}
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('REPORT='+path.join(output,'report.json'));if(report.passed)console.log('PASS native save restored in actual Flutter runtime: '+report.rollbackMethod);
  }
})();
