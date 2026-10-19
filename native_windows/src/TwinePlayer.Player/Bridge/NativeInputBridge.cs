namespace TwinePlayer.Native.Player;
internal static class NativeInputBridge
{
    internal const string Script = """
        ;(()=>{
          if(window.__twinePlayerNativeInputInstalled)return;window.__twinePlayerNativeInputInstalled=true;
          window.__twinePlayerNativePage=function(direction){return window.__twinePlayerScrollStoryPage(direction);};
          let enabled=false;const contacts=new Set();
          window.__twinePlayerNativeSetInputDiagnostics=function(value){enabled=!!value;if(!enabled)contacts.clear();};
          function report(event){
            if(!event.isTrusted)return;
            const category=event.type;
            const kind=event.pointerType||(category.startsWith('touch')?'touch':'mouse');
            if(category==='pointerdown')window.__twinePlayerPost({type:'input-activation',kind});
            if(!enabled)return;
            if(kind==='touch'||kind==='pen'){
              if(category==='pointerdown')contacts.add(event.pointerId);
              if(category==='pointerup'||category==='pointercancel')contacts.delete(event.pointerId);
            }
            let mask=Number(event.buttons||0),buttons=0;while(mask>0){buttons+=mask&1;mask=Math.floor(mask/2);}
            window.__twinePlayerPost({type:'native-input-diagnostic',kind,category,buttons,contacts:category.startsWith('touch')?Math.min(10,event.touches?.length||0):contacts.size,origin:'webview'});
          }
          for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','mousedown','mouseup','wheel','click','contextmenu'])document.addEventListener(type,report,{capture:true,passive:true});
        })();
        """;
}
