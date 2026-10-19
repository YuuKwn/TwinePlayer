using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    private async Task ExerciseInputAsync(string returnStory)
    {
        var count = (await _database.ListAsync()).Count;
        await LaunchInputLabAsync();
        if ((await _database.ListAsync()).Count != count || !_isInputLab || _diagnostics.Enabled || _diagnostics.Events.Count != 0) throw new InvalidDataException("Input Lab changed history or enabled diagnostics.");
        if (await _player.ExecuteScriptAsync("!!document.getElementById('canvas')&&!!document.getElementById('name')&&!!document.querySelector('img')&&!!document.getElementById('add-choice')") != "true") throw new InvalidDataException("Bundled offline lab did not render.");
        _interaction.Select(InteractionProfile.Auto); ApplyInteractionLayout();
        await _player.Core!.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", "{\"type\":\"mousePressed\",\"x\":20,\"y\":10,\"button\":\"left\",\"clickCount\":1}");
        await _player.Core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", "{\"type\":\"mouseReleased\",\"x\":20,\"y\":10,\"button\":\"left\",\"clickCount\":1}");
        await Task.Delay(100);
        if (_diagnostics.Events.Count != 0) throw new InvalidDataException("Disabled diagnostics recorded input.");
        await EnableDiagnosticsAsync(true);
        await _player.Core.CallDevToolsProtocolMethodAsync("Emulation.setTouchEmulationEnabled", "{\"enabled\":true,\"maxTouchPoints\":2}");
        await _player.Core.CallDevToolsProtocolMethodAsync("Input.dispatchTouchEvent", "{\"type\":\"touchStart\",\"touchPoints\":[{\"x\":30,\"y\":10,\"id\":1},{\"x\":80,\"y\":10,\"id\":2}]}");
        await Task.Delay(100);
        if (_interaction.Effective != InteractionProfile.Comfortable || ComfortableBar.Visibility != Visibility.Visible) throw new InvalidDataException("Trusted browser touch did not activate Comfortable mode.");
        await _player.Core.CallDevToolsProtocolMethodAsync("Input.dispatchTouchEvent", "{\"type\":\"touchCancel\",\"touchPoints\":[]}");
        await Task.Delay(100);
        if (!_diagnostics.Events.Any(e => e.Kind == "touch" && e.Contacts == 2) || !_diagnostics.Events.Any(e => e.Category == "pointercancel" && e.Contacts == 0)) throw new InvalidDataException("Touch contacts/cancellation were not recorded.");
        await _player.Core.CallDevToolsProtocolMethodAsync("Emulation.setTouchEmulationEnabled", "{\"enabled\":false}");
        var before = _diagnostics.Events.Count;
        await _player.ExecuteScriptAsync("document.body.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',bubbles:true}))");
        await Task.Delay(100);
        if (_diagnostics.Events.Count != before || _interaction.Effective != InteractionProfile.Comfortable) throw new InvalidDataException("Synthetic browser input changed profile or diagnostics.");
        await Task.Delay(400);
        await _player.Core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", "{\"type\":\"mousePressed\",\"x\":20,\"y\":10,\"button\":\"left\",\"clickCount\":1}");
        await _player.Core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", "{\"type\":\"mouseReleased\",\"x\":20,\"y\":10,\"button\":\"left\",\"clickCount\":1}");
        await Task.Delay(100);
        if (_interaction.Effective != InteractionProfile.Compact || !_diagnostics.Events.Any(e => e.Kind == "mouse")) throw new InvalidDataException("Trusted browser mouse did not restore Compact mode.");
        _interaction.Select(InteractionProfile.Comfortable); _barPreferences = new() { Size = BarSize.Large, Reach = BarReach.Right, PageUpEnabled = true, PageDownEnabled = true, Order = ["load", "pageDown", "save", "back", "undo", "pageUp", "more", "console"] }; ApplyInteractionLayout();
        var pinned = ComfortablePinned.Children.Cast<Button>().Select(b => (string)b.Tag).ToArray();
        if (!pinned.SequenceEqual(new[] { "console", "more" }) || ComfortableCommands.Children.Cast<Button>().Any(b => b.MinHeight != 56) || ComfortableCommands.VerticalAlignment != VerticalAlignment.Center || ComfortableCommands.Orientation != Orientation.Vertical) throw new InvalidDataException("Comfortable sidebar ordering/pins/size/vertical placement failed.");
        CollapseBar_Click(this, new RoutedEventArgs());
        if (ComfortableScroll.Visibility != Visibility.Visible || ComfortablePinned.Visibility != Visibility.Visible || CollapseBarButton.Visibility != Visibility.Visible || ComfortableCommands.Children.Cast<Button>().Any(button => button.Content is not StackPanel)) throw new InvalidDataException("Expanded sidebar lost commands or their icon/label content.");
        CollapseBar_Click(this, new RoutedEventArgs());
        if (ComfortableCommands.Children.Cast<Button>().Any(button => button.Content is not FontIcon)) throw new InvalidDataException("Icon rail lost usable command icons.");
        await new InteractionPreferenceStore(_database).SaveAsync(_interaction.Selected, _barPreferences);
        var saved = await new InteractionPreferenceStore(_database).LoadAsync();
        if (saved.Profile != _interaction.Selected || saved.Bar.ToJson() != _barPreferences.ToJson()) throw new InvalidDataException("Interaction preferences did not persist.");
        await _player.ExecuteScriptAsync("window.scrollTo(0,0);window.__twinePlayerNativePage(1)"); await Task.Delay(500);
        if (await _player.ExecuteScriptAsync("scrollY>0") != "true") throw new InvalidDataException("Page Down did not scroll the lab.");
        await _player.ExecuteScriptAsync("document.getElementById('add-choice').click()");
        if (await _player.ExecuteScriptAsync("document.querySelectorAll('.dynamic-choice').length") != "1") throw new InvalidDataException("Lab dynamic choice fixture failed.");
        await _player.ExecuteScriptAsync("chrome.webview.postMessage(JSON.stringify({type:'native-input-diagnostic',kind:'mouse',category:'click',buttons:1,contacts:0,filename:'PRIVATE-CANARY',x:123,key:'PRIVATE-CANARY'}))");
        await Task.Delay(50);
        if (DiagnosticReport().Contains("PRIVATE-CANARY")) throw new InvalidDataException("Diagnostics leaked extraneous fields.");
        await EnableDiagnosticsAsync(false); _diagnostics.Clear();
        _interaction.Select(InteractionProfile.Auto); _barPreferences = new(); await new InteractionPreferenceStore(_database).SaveAsync(_interaction.Selected, _barPreferences);
        await OpenAsync(Path.Combine(AppContext.BaseDirectory, "Assets", "InputLab", "input_lab.html"), inputLab: true);
        if ((await _database.ListAsync()).Count != count || _diagnostics.Enabled) throw new InvalidDataException("Lab reload changed history/diagnostic consent.");
        await OpenAsync(returnStory);
    }
}
