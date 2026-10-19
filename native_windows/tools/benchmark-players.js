// Identical WebView2 DOM workloads and process-tree accounting. Test-only CDP.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),crypto=require('node:crypto');
const {connect,evaluate}=require('./webview-cdp');
if(typeof WebSocket==='undefined')throw new Error('This benchmark requires Node.js 22 or later with the standard WebSocket API.');
const repo=path.resolve(__dirname,'../..');
const native=path.resolve(process.argv[2]||path.join(repo,'native_windows/src/TwinePlayer.App/bin/Release/net10.0-windows10.0.26100.0/win-x64/TwinePlayer.Native.exe'));
const flutter=path.resolve(process.argv[3]||path.join(repo,'flutter_app/build/windows/x64/runner/Release/twine_player_flutter.exe'));
const realStory=process.argv[4]&&!process.argv[4].startsWith('--')?path.resolve(process.argv[4]):null;
if(process.argv.includes('--real-only')&&!realStory)throw new Error('--real-only requires a real story path.');
const stories=process.argv.includes('--real-only')?[realStory]:[path.join(repo,'native_windows/fixtures/performance/performance.html'),...(realStory?[realStory]:[])];
const output=path.join(repo,'artifacts','native-benchmark-'+crypto.randomUUID());fs.mkdirSync(output,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const soakArgument=process.argv.find(value=>value.startsWith('--soak-seconds='));
const soakSeconds=soakArgument?Number(soakArgument.split('=')[1]):0;
if(soakArgument&&(!Number.isInteger(soakSeconds)||soakSeconds<60||soakSeconds>3600))throw new Error('Soak duration must be 60..3600 seconds.');
const stageArgument=process.argv.find(value=>value.startsWith('--stages='));
const selectedStages=stageArgument?stageArgument.split('=')[1].split(','):null;
if(selectedStages?.some(stage=>!['idle','css','canvas','video'].includes(stage)))throw new Error('Unknown performance stage.');
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value;}
function sample(pid,gpu=false){const text=cp.execFileSync('pwsh',['-NoProfile','-File',path.join(__dirname,'sample-process-tree.ps1'),'-RootProcessId',String(pid),...(gpu?['-Gpu']:[])],{encoding:'utf8',windowsHide:true});return JSON.parse(text.replace(/^\uFEFF/,''));}
function totals(sample){return sample.processes.reduce((r,p)=>({cpuSeconds:r.cpuSeconds+p.cpuSeconds,privateBytes:r.privateBytes+p.privateBytes,workingSetBytes:r.workingSetBytes+p.workingSetBytes}),{cpuSeconds:0,privateBytes:0,workingSetBytes:0});}
async function workload(cdp,pid,stage,runRoot){
  fs.writeFileSync(path.join(runRoot,'progress.json'),JSON.stringify({stage,step:'apply-stage',atUtc:new Date().toISOString()}));
  await evaluate(cdp,`window.benchmarkStage?window.benchmarkStage(${JSON.stringify(stage)}):null`);
  await sleep(1000);const activityScript="({canvasFrames:window.benchmarkCanvasFrames||0,videoFrames:document.getElementById('video')?.getVideoPlaybackQuality().totalVideoFrames||0,animationTimes:document.getAnimations().map(a=>Number(a.currentTime)||0)})";
  const activityBefore=await evaluate(cdp,activityScript);const before=sample(pid);const start=performance.now();await sleep(5000);const after=sample(pid,true);const activityAfter=await evaluate(cdp,activityScript);const elapsed=(performance.now()-start)/1000;const a=totals(before),b=totals(after);
  fs.writeFileSync(path.join(runRoot,'progress.json'),JSON.stringify({stage,step:'read-state',atUtc:new Date().toISOString()}));
  const state=await evaluate(cdp,"({visibility:document.visibilityState,focus:document.hasFocus(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio,video:document.getElementById('video')?{width:document.getElementById('video').videoWidth,frames:document.getElementById('video').getVideoPlaybackQuality().totalVideoFrames,error:document.getElementById('video').error?.code||null}:null})");
  if(stage==='video'&&(!state.video?.width||!state.video?.frames||state.video?.error))throw new Error('Local video did not decode');
  if(stage==='canvas'&&activityAfter.canvasFrames<=activityBefore.canvasFrames)throw new Error('Canvas animation made no progress during sampling.');
  if(stage==='video'&&activityAfter.videoFrames<=activityBefore.videoFrames)throw new Error('Video frames made no progress during sampling.');
  if(stage==='css'&&(!activityBefore.animationTimes.length||!activityAfter.animationTimes.some((time,index)=>time>activityBefore.animationTimes[index])))throw new Error('CSS animation made no progress during sampling.');
  return {stage,elapsedSeconds:elapsed,cpuPercentOfMachine:100*(b.cpuSeconds-a.cpuSeconds)/(elapsed*after.logicalProcessors),host:after.processes.find(p=>p.pid===pid),tree:b,processes:after.processes,gpuStatus:after.gpuStatus,gpuEngines:after.gpuEngines,state,activityBefore,activityAfter};
}
async function run(kind,exe,story,mode,root){
  if(kind==='flutter'&&!fs.existsSync(path.join(path.dirname(exe),'BENCHMARK-ONLY.txt')))throw new Error('Refusing a normal Flutter executable: use an archived benchmark-only build with BENCHMARK-ONLY.txt.');
  const moduleNames=kind==='flutter'?['twine_player_flutter.exe','data/app.so','flutter_windows.dll','webview_windows_plugin.dll']:['TwinePlayer.Native.exe','TwinePlayer.Native.dll','TwinePlayer.Core.dll','TwinePlayer.Player.dll','TwinePlayer.Persistence.dll','TwinePlayer.Native.pri'];
  const moduleHashes=moduleNames.map(file=>({path:file,sha256:hash(path.join(path.dirname(exe),file))}));
  const runRoot=path.join(root,mode);fs.mkdirSync(runRoot,{recursive:true});const debugPort=await port();
  const env={...process.env,TWINEPLAYER_BENCHMARK_ROOT:runRoot,TWINEPLAYER_BENCHMARK_STORY:story,TWINEPLAYER_NATIVE_DATA_ROOT:path.join(root,'native-data'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'browser'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${debugPort}`};
  if(kind==='native')delete env.WEBVIEW2_USER_DATA_FOLDER; // Native owns its explicit isolated profile under native-data/WebView2.
  fs.writeFileSync(path.join(runRoot,'run-identity.json'),JSON.stringify({kind,mode,executable:exe,moduleHashes,story,storySha256:hash(story),harnessSha256:hash(__filename)},null,2));
  const started=performance.now();const child=cp.spawn(exe,[],{cwd:path.dirname(exe),env,windowsHide:true,stdio:'ignore'});let exited=false,hostExit=null;child.on('exit',(code,signal)=>{exited=true;hostExit={code,signal};});let cdp;
  try{
    for(let attempt=0;attempt<300;attempt++){
      if(exited)throw new Error(kind+' exited during startup');
      try{const targets=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();const target=targets.find(t=>t.type==='page'&&t.url.startsWith('https://')&&t.url.includes('twineplayer.local'));if(target){cdp=await connect(target.webSocketDebuggerUrl);const ready=await evaluate(cdp,"document.readyState==='complete'&&(document.body?.innerText.length||0)>0&&(!/sugarcube/i.test(document.querySelector('tw-storydata')?.getAttribute('format')||'')||!!document.querySelector('#passages .passage'))"+(kind==='native'?'&&window.__twinePlayerBenchmarkReady===true':''));if(ready)break;cdp.close();cdp=null;}}catch(error){if(attempt===299)throw error;}
      await sleep(100);
    }
    if(!cdp)throw new Error('Story did not become ready');const renderedStoryReadyMs=performance.now()-started;
    await sleep(500);const initialViewport=await evaluate(cdp,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:900,height:450,deviceScaleFactor:2,mobile:false});
    if(kind==='flutter')await cdp.call('Page.bringToFront'); // Native OpenAsync already focuses its controller.
    const normalizedViewport=await evaluate(cdp,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    if(normalizedViewport.width!==900||normalizedViewport.height!==450||normalizedViewport.dpr!==2)throw new Error('Browser workload viewport did not normalize');
    const screenshot=await cdp.call('Page.captureScreenshot',{format:'png'});const png=Buffer.from(screenshot.data,'base64');const screenshotPixels={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
    fs.writeFileSync(path.join(runRoot,'normalized-viewport.png'),png);
    if(screenshotPixels.width!==1800||screenshotPixels.height!==900)throw new Error('Browser rendered surface did not normalize');
    const version=await cdp.call('Browser.getVersion');const stages=[];const stageNames=story.endsWith('performance.html')?(selectedStages||['idle','css','canvas','video']):['idle'];
    const sessionStart=performance.now();let iteration=0;
    do{
      for(const stage of stageNames){stages.push(await workload(cdp,child.pid,stage,runRoot));fs.writeFileSync(path.join(runRoot,'session-samples.json'),JSON.stringify({kind,iteration,elapsedSeconds:(performance.now()-sessionStart)/1000,stages},null,2));}
      iteration++;
    }while(soakSeconds&&(performance.now()-sessionStart)/1000<soakSeconds);
    const scrollFrames=await evaluate(cdp,"(async()=>{const frames=[];for(let i=0;i<20;i++){const t=performance.now();scrollBy(0,40);await new Promise(requestAnimationFrame);frames.push(performance.now()-t);}return frames;})()");
    return {kind,mode,executable:exe,executableSha256:hash(exe),moduleHashes,story,storySha256:hash(story),renderedStoryReadyMs,initialViewport,normalizedViewport,screenshotPixels,version,soakRequestedSeconds:soakSeconds,sessionElapsedSeconds:(performance.now()-sessionStart)/1000,stages,scrollFrameDeltasMs:scrollFrames};
  }catch(error){
    const diagnostics={error:error.stack,hostPid:child.pid,hostExited:exited,hostExit,atUtc:new Date().toISOString()};let probe;
    try{
      diagnostics.targets=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`,{signal:AbortSignal.timeout(2000)})).json();
      const target=diagnostics.targets.find(t=>t.type==='page'&&t.url.includes('twineplayer.local'));
      if(target){probe=await connect(target.webSocketDebuggerUrl);diagnostics.reconnectedState=await evaluate(probe,"({ready:document.readyState,location:location.href,nativeReady:!!window.__twinePlayerBenchmarkReady,visibility:document.visibilityState,video:document.getElementById('video')?{error:document.getElementById('video').error?.code||null,frames:document.getElementById('video').getVideoPlaybackQuality().totalVideoFrames}:null})");const screenshot=await probe.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(runRoot,'failure.png'),Buffer.from(screenshot.data,'base64'));}
    }catch(failure){diagnostics.probeError=failure.stack;}
    finally{probe?.close();}
    try{diagnostics.processes=sample(child.pid);}catch(failure){diagnostics.processProbeError=String(failure);}
    fs.writeFileSync(path.join(runRoot,'failure-diagnostics.json'),JSON.stringify(diagnostics,null,2));throw error;
  }finally{
    cdp?.close();fs.writeFileSync(path.join(runRoot,'stop'),'stop');for(let i=0;i<60&&!exited;i++)await sleep(100);
    if(!exited){cp.execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});throw new Error('Benchmark host did not exit cleanly');}
  }
}
(async()=>{
  const report={createdUtc:new Date().toISOString(),method:'fresh browser profile / same-profile relaunch; OS-cold cache unmeasured; production player via benchmark entry points; browser workload uses verified 900x450 CSS pixels at DPR 2 and 1800x900 captured pixels; outer native/Flutter host windows are not identical; startup precedes emulation; process-tree working sets can count shared pages more than once; frame intervals are not end-to-end input latency',harnessSha256:hash(__filename),flutterEntrySha256:hash(path.join(__dirname,'flutter-benchmark.dart')),runs:[]};
  try{for(const [index,story] of stories.entries())for(const [kind,exe]of(process.argv.includes('--native-only')?[['native',native]]:process.argv.includes('--flutter-only')?[['flutter',flutter]]:[['flutter',flutter],['native',native]])){const root=path.join(output,`${index}-${kind}`);for(const mode of(soakSeconds||process.argv.includes('--single-session')?['fresh-profile']:['fresh-profile','warm-profile'])){report.runs.push(await run(kind,exe,story,mode,root));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('PASS',kind,mode,path.basename(story));}}report.passed=true;}
  catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('REPORT='+path.join(output,'report.json'));
})();
