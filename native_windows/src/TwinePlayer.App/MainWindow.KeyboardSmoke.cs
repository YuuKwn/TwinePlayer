using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private static bool KeyboardSmokeEnabled => Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_KEYBOARD_SMOKE") == "1";
    [StructLayout(LayoutKind.Sequential)]
    private struct TestKey { public ushort VirtualKey, Scan; public uint Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Explicit, Size = 32)]
    private struct TestInputUnion { [FieldOffset(0)] public TestKey Key; }
    [StructLayout(LayoutKind.Sequential)]
    private struct TestInput { public uint Type; public TestInputUnion Value; }
    [DllImport("user32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern uint SendInput(uint count, [In] TestInput[] inputs, int size);
    [DllImport("user32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern short GetAsyncKeyState(int key);

    private async Task SendTestKeyAsync(ushort key, bool shift = false, bool control = false)
    {
        if (!KeyboardSmokeEnabled || string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_DATA_ROOT"))) throw new InvalidOperationException("Keyboard injection requires the explicit isolated integration runner.");
        var window = WinRT.Interop.WindowNative.GetWindowHandle(this);
        if (GetForegroundWindow() != window) throw new InvalidOperationException("The test window does not own foreground input; no key was injected.");
        if (control && FocusManager.GetFocusedElement(Root.XamlRoot) as WebView2 != _browser) throw new InvalidOperationException("The story does not own keyboard focus for the Ctrl shortcut test.");
        if (new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }.Any(code => (GetAsyncKeyState(code) & 0x8000) != 0)) throw new InvalidOperationException("A modifier is held; no test key was injected.");
        static TestInput Input(ushort value, bool up) => new() { Type = 1, Value = new() { Key = new() { VirtualKey = value, Flags = up ? 2u : 0u } } };
        var inputs = new List<TestInput>();
        if (control) inputs.Add(Input(0x11, false)); if (shift) inputs.Add(Input(0x10, false));
        inputs.Add(Input(key, false)); inputs.Add(Input(key, true));
        if (shift) inputs.Add(Input(0x10, true)); if (control) inputs.Add(Input(0x11, true));
        if (SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<TestInput>()) != inputs.Count) throw new InvalidOperationException("Windows did not accept the complete keyboard test input.");
        await Task.Delay(100);
    }
    private async Task ExerciseDialogKeyboardAsync(ContentDialog dialog, Button first, Button second, Task shown)
    {
        Activate(); SetForegroundWindow(WinRT.Interop.WindowNative.GetWindowHandle(this));
        first.Focus(FocusState.Programmatic); await Task.Delay(100);
        await SendTestKeyAsync(0x09);
        if (FocusManager.GetFocusedElement(Root.XamlRoot) as Button != second) throw new InvalidDataException("Windows Tab did not advance to the next native dialog control.");
        await SendTestKeyAsync(0x09, shift: true);
        if (FocusManager.GetFocusedElement(Root.XamlRoot) as Button != first) throw new InvalidDataException("Windows Shift+Tab did not return to the previous dialog control.");
        for (var index = 0; index < 8; index++)
        {
            await SendTestKeyAsync(0x09);
            var focused = FocusManager.GetFocusedElement(Root.XamlRoot) as DependencyObject;
            while (focused is not null && focused != dialog) focused = VisualTreeHelper.GetParent(focused);
            if (focused != dialog) throw new InvalidDataException("Windows Tab escaped the modal dialog.");
        }
        await SendTestKeyAsync(0x1B); await shown.WaitAsync(TimeSpan.FromSeconds(3));
    }
    private async Task ExerciseFullscreenKeyboardAsync()
    {
        RestoreStoryFocus(); await Task.Delay(100);
        if (FocusManager.GetFocusedElement(Root.XamlRoot) as WebView2 != _browser) throw new InvalidDataException("The story did not regain native focus after dialog dismissal.");
        await SendTestKeyAsync(0x7A);
        if (!IsFullscreen) throw new InvalidDataException("F11 did not enter fullscreen with the story focused.");
        await ExerciseSaveDialogKeyboardAsync();
        RestoreStoryFocus(); await Task.Delay(100);
        if (FocusManager.GetFocusedElement(Root.XamlRoot) as WebView2 != _browser) throw new InvalidDataException("Story focus was lost during fullscreen entry.");
        await SendTestKeyAsync(0x1B);
        if (IsFullscreen) throw new InvalidDataException("Escape did not exit fullscreen with the story focused.");
        RestoreStoryFocus(); await Task.Delay(100);
        await SetAssistanceAsync(_assistance with { ZoomFactor = 1 });
        await SendTestKeyAsync(0x6B, control: true);
        for (var attempt = 0; attempt < 30 && Math.Abs(_assistance.ZoomFactor - 1.1) > .001; attempt++) await Task.Delay(50);
        if (Math.Abs(_assistance.ZoomFactor - 1.1) > .001) throw new InvalidDataException("Ctrl+Add did not zoom the focused story.");
        await SendTestKeyAsync(0x6D, control: true);
        if (Math.Abs(_assistance.ZoomFactor - 1) > .001) throw new InvalidDataException("Ctrl+Subtract did not reduce story zoom.");
        await SendTestKeyAsync(0xBB, shift: true, control: true);
        if (Math.Abs(_assistance.ZoomFactor - 1.1) > .001) throw new InvalidDataException("Ctrl+Shift+Plus did not zoom the focused story.");
        await SendTestKeyAsync(0x30, control: true);
        if (Math.Abs(_assistance.ZoomFactor - 1) > .001) throw new InvalidDataException("Ctrl+0 did not reset story zoom.");
        await _player.ExecuteScriptAsync("window.__nativeKeyboardEscapeCount=0;document.addEventListener('keydown',function testEscape(e){if(e.key==='Escape'){window.__nativeKeyboardEscapeCount++;document.removeEventListener('keydown',testEscape,true);}},{capture:true});document.dispatchEvent(new KeyboardEvent('keydown',{key:'F11',bubbles:true}));true");
        if (IsFullscreen) throw new InvalidDataException("A synthetic story key triggered a native shortcut.");
        await SendTestKeyAsync(0x1B);
        if (await _player.ExecuteScriptAsync("window.__nativeKeyboardEscapeCount") != "1") throw new InvalidDataException("Escape outside fullscreen was not left available to the game.");
    }
    private ContentDialog? FocusedNativeDialog()
    {
        var focused = FocusManager.GetFocusedElement(Root.XamlRoot) as DependencyObject;
        while (focused is not null) { if (focused is ContentDialog dialog) return dialog; focused = VisualTreeHelper.GetParent(focused); }
        return null;
    }
    private async Task ExerciseSaveDialogKeyboardAsync()
    {
        var source = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_KEYBOARD_SAVE_FIXTURE") ?? throw new InvalidOperationException("The keyboard save fixture was not provided.");
        var folder = Path.Combine(_database.Root, "keyboard-story"); var game = Path.Combine(folder, "KeyboardStory.html");
        await Task.Run(() => { Directory.CreateDirectory(folder); File.Copy(source, game, overwrite: true); });
        await OpenAsync(game);
        _interaction.Select(TwinePlayer.Native.Core.InteractionProfile.Compact); ApplyInteractionLayout();
        for (var attempt = 0; attempt < 100 && await _player.ExecuteScriptAsync("!!window.SugarCube?.state?.active?.title") != "true"; attempt++) await Task.Delay(10);
        if (!SaveButton.Focus(FocusState.Programmatic)) throw new InvalidDataException("Save toolbar button could not receive keyboard focus.");
        await SendTestKeyAsync(0x0D);
        for (var attempt = 0; attempt < 200 && FocusedNativeDialog() is null; attempt++) await Task.Delay(10);
        if (FocusedNativeDialog()?.Title as string != "Save game" || !_saveDialogOpen) throw new InvalidDataException("Enter on Save did not open the production save dialog: " + ErrorBar.Message);
        await SendTestKeyAsync(0x09); if (FocusedNativeDialog() is null) throw new InvalidDataException("Tab escaped the production save dialog.");
        await SendTestKeyAsync(0x1B);
        for (var attempt = 0; attempt < 200 && (_saveDialogOpen || _saveActionInProgress); attempt++) await Task.Delay(10);
        if (_saveDialogOpen || _saveActionInProgress) throw new InvalidDataException("Escape did not finish canceling the production save dialog.");
        if (!IsFullscreen) throw new InvalidDataException("Dismissing a modal dialog unexpectedly exited fullscreen.");
        if (Directory.Exists(TwinePlayer.Native.Core.SaveRules.DirectoryFor(game)) && Directory.EnumerateFiles(TwinePlayer.Native.Core.SaveRules.DirectoryFor(game)).Any()) throw new InvalidDataException("Canceling the save dialog wrote a save file.");
        if (FocusManager.GetFocusedElement(Root.XamlRoot) as WebView2 != _browser) throw new InvalidDataException("The production save dialog did not restore story focus.");
    }
}
