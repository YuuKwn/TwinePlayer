using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using TwinePlayer.Native.App.Controls;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private async Task<JsonElement> PresentationObjectAsync(string expression)
    {
        var raw = await _player.ExecuteScriptAsync("JSON.stringify(" + expression + ")");
        using var json = JsonDocument.Parse(JsonSerializer.Deserialize<string>(raw)!); return json.RootElement.Clone();
    }
    private async Task<object> ExercisePresentationAsync(string file)
    {
        var baseline = await PresentationObjectAsync("({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})");
        var detection = await PresentationObjectAsync("window.__twinePlayerDetectReadabilityEngine()");
        var verified = detection.GetProperty("verified").GetBoolean();
        var initial = await PresentationObjectAsync("window.__twinePlayerGetStoryAssistanceStatus()");
        if (initial.GetProperty("stylePresent").GetBoolean() || initial.GetProperty("observerPresent").GetBoolean()) throw new InvalidDataException("Assistance is not off by default.");
        if (verified)
        {
            await _player.ExecuteScriptAsync("(()=>{const r=document.querySelector(window.__twinePlayerDetectReadabilityEngine().selector);const p=document.createElement('p');p.id='native-owned-presentation';p.className='twine-player-readability-text-v2';p.setAttribute('data-twine-player-readability','story-owned');p.textContent='Owned style';r.appendChild(p);window.__nativeOwnedPresentation=p;})()");
        }
        var config = new StoryAssistancePreferences { ZoomFactor = 1.25, EnhancedChoices = true, ReadabilityEnabled = true, TextScale = 1.2, LineHeight = 1.8, ParagraphSpacing = 1.5, ReadableLineLengthEnabled = true, ReadableLineLength = 70, TargetSpacing = 1.4 };
        await SetAssistanceAsync(config); await Task.Delay(100);
        var zoomed = await PresentationObjectAsync("({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})");
        if (Math.Abs(zoomed.GetProperty("width").GetDouble() - baseline.GetProperty("width").GetDouble() / 1.25) > 2 || Math.Abs(zoomed.GetProperty("dpr").GetDouble() - baseline.GetProperty("dpr").GetDouble() * 1.25) > .03)
            throw new InvalidDataException("Story zoom did not reflow viewport and pixel ratio: " + baseline + " -> " + zoomed);
        if (verified)
        {
            if (_assistanceStatus is not { Enabled: true, StylePresent: true, ObserverPresent: true }) throw new InvalidDataException("Verified story assistance did not apply.");
            await _player.ExecuteScriptAsync("(()=>{const r=document.querySelector(window.__twinePlayerDetectReadabilityEngine().selector);const p=document.createElement('p');p.id='native-dynamic-presentation';p.textContent='Dynamic passage text';r.appendChild(p);})()");
            await Task.Delay(50);
            if (await _player.ExecuteScriptAsync("document.getElementById('native-dynamic-presentation').hasAttribute('data-twine-player-readability')") != "true") throw new InvalidDataException("Dynamic assistance did not mark inserted content.");
        }
        else if (await _player.ExecuteScriptAsync("!!document.querySelector('#twine-player-story-assistance-v2,#twine-player-enhanced-choices-v1')") != "false") throw new InvalidDataException("Unknown engine was modified by assistance.");
        await SetAssistanceAsync(new());
        if (verified && await _player.ExecuteScriptAsync("window.__nativeOwnedPresentation===document.getElementById('native-owned-presentation')&&__nativeOwnedPresentation.classList.contains('twine-player-readability-text-v2')&&__nativeOwnedPresentation.getAttribute('data-twine-player-readability')==='story-owned'") != "true") throw new InvalidDataException("Assistance reset changed game-owned DOM.");
        var reset = await PresentationObjectAsync("window.__twinePlayerGetStoryAssistanceStatus()");
        if (reset.GetProperty("stylePresent").GetBoolean() || reset.GetProperty("observerPresent").GetBoolean()) throw new InvalidDataException("Assistance reset left a style or observer.");
        await SetAssistanceAsync(config);
        await OpenAsync(file);
        if (_assistance != config || verified && _assistanceStatus is not { Enabled: true, StylePresent: true }) throw new InvalidDataException("Story preferences were not restored after browser recreation.");
        await SetAssistanceAsync(new());
        var imageChecks = false;
        if (file.EndsWith("local-assets.html", StringComparison.OrdinalIgnoreCase))
        {
            var source = JsonSerializer.Deserialize<string>(await _player.ExecuteScriptAsync("document.getElementById('asset-image').src"))!;
            var bytes = await ReadImageAsync(source, default);
            if (!Encoding.UTF8.GetString(bytes).Contains("<svg")) throw new InvalidDataException("Virtual image bytes were not retrieved from the story context.");
            await _player.ExecuteScriptAsync("window.__nativeImageBlob=URL.createObjectURL(new Blob(['<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\"><rect width=\"32\" height=\"32\"/></svg>'],{type:'image/svg+xml'}))");
            var blob = JsonSerializer.Deserialize<string>(await _player.ExecuteScriptAsync("window.__nativeImageBlob"))!;
            if ((await ReadImageAsync(blob, default)).Length == 0) throw new InvalidDataException("Blob image retrieval failed.");
            await _player.ExecuteScriptAsync("(()=>{const b=document.createElement('button');b.id='native-owned-image-button';b.onclick=()=>window.__nativeImageOwnedClicks=(window.__nativeImageOwnedClicks||0)+1;const i=document.createElement('img');i.id='native-owned-image';i.src=document.getElementById('asset-image').src;b.appendChild(i);document.body.appendChild(b);i.click();})()");
            await Task.Delay(100);
            if (_imagePreviewOpen || await _player.ExecuteScriptAsync("window.__nativeImageOwnedClicks") != "1") throw new InvalidDataException("Image preview hijacked a game-owned button.");
            await _player.ExecuteScriptAsync("document.getElementById('asset-image').click()");
            for (var i = 0; i < 30 && !_imagePreviewOpen; i++) await Task.Delay(50);
            if (!_imagePreviewOpen || _activeImageDialog is null) throw new InvalidDataException("Story image click did not open a native preview.");
            _activeImageDialog.Hide();
            for (var i = 0; i < 30 && _imagePreviewOpen; i++) await Task.Delay(50);
            await _player.ExecuteScriptAsync("document.getElementById('asset-image').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
            for (var i = 0; i < 30 && _activeImageMenu?.IsOpen != true; i++) await Task.Delay(50);
            if (_activeImageMenu?.IsOpen != true) throw new InvalidDataException("Image context menu did not open.");
            _activeImageMenu.Hide();
            await ExerciseImagePaneAsync(); imageChecks = true;
        }
        return new { engine = detection.GetProperty("engine").GetString(), verified, zoomReflowAndPixelRatio = true, persistenceAndReset = true, imageChecks };
    }
    private async Task ExerciseImagePaneAsync()
    {
        var pane = new ImagePreviewPane("data:image/svg+xml,test", "Native preview fixture", 500, 300);
        var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Native image test", Content = pane, CloseButtonText = "Close" };
        dialog.Resources["ContentDialogMaxWidth"] = 600d;
        var shown = dialog.ShowAsync().AsTask();
        try
        {
            await pane.LoadAsync(Encoding.UTF8.GetBytes("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2000 1500'><rect width='2000' height='1500' fill='blue'/></svg>"));
            await Task.Delay(100); pane.HandleDoubleTap(); await Task.Delay(100);
            if (pane.Viewer.ZoomFactor != 1) throw new InvalidDataException("Double-tap zoom was not off by default.");
            pane.DoubleTap.IsOn = true; pane.HandleDoubleTap(); await Task.Delay(100);
            if (Math.Abs(pane.Viewer.ZoomFactor - 2) > .01) throw new InvalidDataException("Enabled image double-tap did not zoom.");
            pane.Viewer.ChangeView(100, 80, null, true); await Task.Delay(100);
            if (pane.Viewer.HorizontalOffset <= 0 || pane.Viewer.VerticalOffset <= 0) throw new InvalidDataException("Enlarged image could not pan.");
            pane.DoubleTap.IsOn = false; await Task.Delay(100);
            if (pane.Viewer.ZoomFactor != 1) throw new InvalidDataException("Disabling double-tap did not reset image zoom.");
            var rejected = false;
            try { await pane.LoadAsync(Encoding.UTF8.GetBytes("<svg xmlns='http://www.w3.org/2000/svg'><image href='file:///C:/Windows/win.ini'/></svg>")); } catch (InvalidDataException) { rejected = true; }
            if (!rejected) throw new InvalidDataException("External SVG resource was not rejected.");
            foreach (var svg in new[] { "<svg xmlns='http://www.w3.org/2000/svg'><style>@import 'https://example.invalid/style';</style></svg>", "<svg xmlns='http://www.w3.org/2000/svg'><rect style='fill:url(#allowed);filter:url(file:///C:/Windows/win.ini)'/></svg>" })
            {
                rejected = false; try { await pane.LoadAsync(Encoding.UTF8.GetBytes(svg)); } catch (InvalidDataException) { rejected = true; }
                if (!rejected) throw new InvalidDataException("External SVG stylesheet resource was not rejected.");
            }
        }
        finally { dialog.Hide(); await shown; }
    }
}
