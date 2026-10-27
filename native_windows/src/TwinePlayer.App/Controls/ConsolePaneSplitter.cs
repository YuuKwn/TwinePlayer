using Microsoft.UI.Input;
using Microsoft.UI.Xaml.Controls;

namespace TwinePlayer.Native.App.Controls;

public sealed class ConsolePaneSplitter : Grid
{
    public ConsolePaneSplitter() => ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeNorthSouth);
}
