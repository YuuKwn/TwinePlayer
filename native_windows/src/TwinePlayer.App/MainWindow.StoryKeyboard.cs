using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private delegate nint StoryMessageHook(int code, nint removed, nint message);
    private StoryMessageHook? _storyMessageHookCallback;
    private nint _storyMessageHook;
    private nint _storyKeyboardWindow;
    [StructLayout(LayoutKind.Sequential)]
    private struct StoryWindowMessage
    {
        public nint Window; public uint Id; public nuint Key; public nint Detail;
        public uint Time; public int X, Y; public uint Private;
    }
    [DllImport("user32.dll", EntryPoint = "SetWindowsHookExW", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern nint SetStoryMessageHook(int kind, StoryMessageHook callback, nint module, uint thread);
    [DllImport("user32.dll", EntryPoint = "CallNextHookEx")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern nint NextStoryMessageHook(nint hook, int code, nint removed, nint message);
    [DllImport("user32.dll", EntryPoint = "UnhookWindowsHookEx")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern bool RemoveStoryMessageHook(nint hook);
    [DllImport("kernel32.dll", EntryPoint = "GetCurrentThreadId")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern uint StoryUiThreadId();
    [DllImport("user32.dll", EntryPoint = "IsChild")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern bool IsStoryChildWindow(nint parent, nint child);
    [DllImport("user32.dll", EntryPoint = "GetKeyState")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern short StoryKeyState(int key);

    private void InitializeStoryKeyboard()
    {
        // WebView2 does not route all child-window keys through XAML accelerators.
        // Observe only this UI thread; handle the existing shortcut whitelist only
        // when this window's story control has focus. No key history is retained.
        _storyMessageHookCallback = RouteStoryMessage;
        _storyKeyboardWindow = WinRT.Interop.WindowNative.GetWindowHandle(this);
        _storyMessageHook = SetStoryMessageHook(3, _storyMessageHookCallback, 0, StoryUiThreadId());
        if (_storyMessageHook == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "Story keyboard routing could not be initialized.");
        Closed += (_, _) =>
        {
            if (_storyMessageHook != 0 && !RemoveStoryMessageHook(_storyMessageHook)) { _logger.LogWarning("Story keyboard hook could not be removed before UI-thread shutdown"); return; }
            _storyMessageHook = 0; _storyMessageHookCallback = null;
        };
    }
    private nint RouteStoryMessage(int code, nint removed, nint address)
    {
        try
        {
            if (code >= 0 && removed == 1 && !_closing)
            {
                var message = Marshal.PtrToStructure<StoryWindowMessage>(address);
                if (message.Id == 0x100 && Root.XamlRoot is not null && _browser is not null && FocusManager.GetFocusedElement(Root.XamlRoot) as WebView2 == _browser && (message.Window == _storyKeyboardWindow || IsStoryChildWindow(_storyKeyboardWindow, message.Window)))
                {
                    var key = (int)message.Key;
                    bool Down(int value) => (StoryKeyState(value) & 0x8000) != 0;
                    var control = Down(0x11); var shift = Down(0x10);
                    var reserved = !Down(0x12) && !Down(0x5B) && !Down(0x5C) &&
                        (control ? (key is 187 or 107) || !shift && (key is 189 or 109 or 48) : !shift && (key == 0x7A || key == 0x1B && IsFullscreen));
                    if (reserved)
                    {
                        // PM_REMOVE only and bit 30 prevent duplicate/auto-repeat
                        // toggles. Consume the message before WebView2/XAML sees it.
                        Marshal.WriteInt32(address, IntPtr.Size, 0); // MSG.message = WM_NULL; leave all other fields intact.
                        if (control || (message.Detail.ToInt64() & (1L << 30)) == 0)
                            DispatcherQueue.TryEnqueue(async () =>
                            {
                                try { if (_closing) return; if (!control) ToggleFullscreen(); else await ChangeZoomAsync(key == 48 ? 0 : key is 187 or 107 ? .1 : -.1); }
                                catch (Exception error) { _logger.LogError(error, "Story shortcut failed"); if (!_closed) ShowPresentationError(error.Message); }
                            });
                    }
                }
            }
        }
        catch (Exception error) { _logger.LogError(error, "Story keyboard message routing failed"); }
        return NextStoryMessageHook(_storyMessageHook, code, removed, address);
    }
}
