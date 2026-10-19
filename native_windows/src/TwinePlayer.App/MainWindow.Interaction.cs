using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Input;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private readonly InteractionState _interaction = new();
    private CommandBarPreferences _barPreferences = new();
    private bool _sidebarExpanded;
    private bool _isInputLab;
    private bool _interactionLoaded;
    private readonly HashSet<uint> _chromeContacts = new();
    private void InitializeInteraction()
    {
        Root.Loaded += async (_, _) =>
        {
            if (_interactionLoaded) return; _interactionLoaded = true;
            try { var value = await new InteractionPreferenceStore(_database).LoadAsync(); _interaction.Select(value.Profile); _barPreferences = value.Bar; ApplyInteractionLayout(); }
            catch (Exception error) { ShowPresentationError("Interaction preferences were preserved but could not be read: " + error.Message); }
        };
        foreach (var (routed, category) in new[] { (UIElement.PointerPressedEvent, "pointerdown"), (UIElement.PointerReleasedEvent, "pointerup"), (UIElement.PointerCanceledEvent, "pointercancel"), (UIElement.PointerWheelChangedEvent, "wheel") })
            Root.AddHandler(routed, new PointerEventHandler((_, args) => RecordChromeInput(args, category)), true);
    }
    private void RecordChromeInput(PointerRoutedEventArgs args, string category)
    {
        // WebView input is recorded inside its document; never count it twice as chrome.
        if (args.OriginalSource is WebView2) return;
        var kind = args.Pointer.PointerDeviceType.ToString().ToLowerInvariant();
        if (category == "pointerdown") ObserveActivation(kind);
        if (!_diagnostics.Enabled) return;
        var point = args.GetCurrentPoint(Root); var properties = point.Properties;
        if (kind is "touch" or "pen") { if (category == "pointerdown") _chromeContacts.Add(args.Pointer.PointerId); else if (category is "pointerup" or "pointercancel") _chromeContacts.Remove(args.Pointer.PointerId); }
        var buttons = (properties.IsLeftButtonPressed ? 1 : 0) + (properties.IsRightButtonPressed ? 1 : 0) + (properties.IsMiddleButtonPressed ? 1 : 0) + (properties.IsXButton1Pressed ? 1 : 0) + (properties.IsXButton2Pressed ? 1 : 0);
        _diagnostics.Record(InputMetadata.Create(kind, category, buttons, _chromeContacts.Count, "chrome")); RefreshDiagnosticDisplay();
    }
    private void ObserveActivation(string kind)
    {
        if (_interaction.Activate(kind, Environment.TickCount64)) ApplyInteractionLayout();
    }
    private void ApplyInteractionLayout()
    {
        if (_closed) return;
        var comfortable = _interaction.Effective == InteractionProfile.Comfortable;
        var playing = _player.Story is not null;
        PlayerTitle.Visibility = playing && _sidebarExpanded ? Visibility.Visible : Visibility.Collapsed;
        NativeTitleBar.IsBackButtonVisible = NativeTitleBar.IsBackButtonEnabled = false;
        HomeButton.Visibility = playing ? Visibility.Visible : Visibility.Collapsed;
        foreach (var command in new FrameworkElement[] { UndoStoryButton, SaveButton, LoadButton, ConsoleEntryButton, FullscreenButton })
            command.Visibility = playing ? Visibility.Visible : Visibility.Collapsed;
        LibraryActions.Visibility = playing ? Visibility.Collapsed : Visibility.Visible;
        CompactScroll.Visibility = comfortable && playing ? Visibility.Collapsed : Visibility.Visible;
        CompactMoreButton.Visibility = CompactScroll.Visibility;
        ComfortableBar.Visibility = comfortable && playing ? Visibility.Visible : Visibility.Collapsed;
        UpdateSidebarWidth();
        StatusText.Visibility = _sidebarExpanded ? Visibility.Visible : Visibility.Collapsed;
        StatusText.TextWrapping = TextWrapping.Wrap;
        foreach (var (button, label, glyph) in new (ContentControl, string, string)[] {
            (OpenButton, "Open game", "\uE8E5"), (HomeButton, "Library", "\uE80F"), (UndoStoryButton, "Undo", "\uE7A7"),
            (SaveButton, "Save", "\uE74E"), (LoadButton, "Load", "\uE898"), (ConsoleEntryButton, "Console", "\uE756"),
            (FullscreenButton, "Fullscreen", "\uE740"), (PlaySelectedButton, "Play selected", "\uE768"),
            (RelinkSelectedButton, "Relink game", "\uE71B"), (UndoRemove, "Undo removal", "\uE7A7"),
            (ImportButton, "Import", "\uE896"), (LibrarySelectionMore, "Game actions", "\uE712"), (CompactMoreButton, "More", "\uE712") })
            SetSidebarCommandContent(button, label, glyph);
        ComfortableCommands.Children.Clear(); ComfortablePinned.Children.Clear();
        var preferences = _barPreferences.Normalized;
        ComfortableCommands.HorizontalAlignment = HorizontalAlignment.Stretch;
        ComfortableCommands.VerticalAlignment = preferences.Alignment switch { BarAlignment.Start => VerticalAlignment.Top, BarAlignment.End => VerticalAlignment.Bottom, _ => VerticalAlignment.Center };
        foreach (var id in preferences.Order)
        {
            if (id == "pageUp" && !preferences.PageUpEnabled || id == "pageDown" && !preferences.PageDownEnabled) continue;
            var label = id switch { "back" => "Library", "undo" => "Undo", "save" => "Save", "load" => "Load", "pageUp" => "Page ↑", "pageDown" => "Page ↓", "console" => "Console", _ => "More" };
            var button = new Button { Style = (Style)Root.Resources["SidebarButtonStyle"], Tag = id, AccessKey = id switch { "back" => "H", "undo" => "U", "save" => "S", "load" => "L", "pageUp" => "P", "pageDown" => "D", "console" => "C", _ => "M" }, MinWidth = preferences.TargetSize, MinHeight = preferences.TargetSize, HorizontalAlignment = HorizontalAlignment.Stretch, IsEnabled = playing && (!_isInputLab || id is not ("save" or "load")) };
            SetSidebarCommandContent(button, label, id switch { "back" => "\uE80F", "undo" => "\uE7A7", "save" => "\uE74E", "load" => "\uE898", "pageUp" => "\uE70E", "pageDown" => "\uE70D", "console" => "\uE756", _ => "\uE712" });
            AutomationProperties.SetName(button, label == "More" ? "More player actions" : label); ToolTipService.SetToolTip(button, label);
            button.Click += ComfortableCommand_Click;
            (id is "console" or "more" ? ComfortablePinned.Children : ComfortableCommands.Children).Add(button);
        }
        ComfortableScroll.Visibility = ComfortablePinned.Visibility = Visibility.Visible;
        SetSidebarCommandContent(CollapseBarButton, "Collapse", _sidebarExpanded ? "\uE76C" : "\uE76B");
        AutomationProperties.SetName(CollapseBarButton, _sidebarExpanded ? "Collapse right sidebar to icons" : "Expand right sidebar with labels");
        ToolTipService.SetToolTip(CollapseBarButton, _sidebarExpanded ? "Show icons only" : "Show icons and labels");
    }
    private void SetSidebarCommandContent(ContentControl button, string label, string glyph)
    {
        var icon = new FontIcon { Glyph = glyph, FontSize = 20, Width = 20 };
        if (_sidebarExpanded)
        {
            var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12 };
            content.Children.Add(icon);
            content.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center });
            button.Content = content;
        }
        else button.Content = icon;
        button.HorizontalContentAlignment = _sidebarExpanded ? HorizontalAlignment.Left : HorizontalAlignment.Center;
    }
    private void UpdateSidebarWidth()
    {
        if (RightSidebar is null) return;
        RightSidebar.Width = _sidebarExpanded ? Math.Min(200, Math.Max(176, Root.ActualWidth * .3)) : _interaction.Effective == InteractionProfile.Comfortable && _player.Story is not null ? 80 : 72;
    }
    private void ComfortableScroll_SizeChanged(object sender, SizeChangedEventArgs e) { if (ComfortableLayout is not null) ComfortableLayout.MinHeight = e.NewSize.Height; }
    private void CollapseBar_Click(object sender, RoutedEventArgs e) { _sidebarExpanded = !_sidebarExpanded; ApplyInteractionLayout(); CollapseBarButton.Focus(FocusState.Programmatic); }
    private void SidebarMore_Click(object sender, RoutedEventArgs e) { if (sender is FrameworkElement button) BuildPlayerMoreMenu().ShowAt(button); }
    private async void ComfortableCommand_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string id } button) return;
        switch (id)
        {
            case "back": Home_Click(sender, e); break;
            case "undo": UndoStory_Click(sender, e); break;
            case "save": Save_Click(sender, e); break;
            case "load": Load_Click(sender, e); break;
            case "console": ConsoleEntry_Click(sender, e); break;
            case "more": BuildPlayerMoreMenu().ShowAt(button); break;
            case "pageUp": case "pageDown":
                try { await _player.ExecuteScriptAsync("window.__twinePlayerNativePage(" + (id == "pageUp" ? "-1" : "1") + ")"); }
                catch (Exception error) { ShowPresentationError(error.Message); } break;
        }
    }
    private MenuFlyout BuildPlayerMoreMenu()
    {
        var menu = new MenuFlyout();
        static MenuFlyoutItem Item(string label, RoutedEventHandler handler, string shortcut = "") { var item = new MenuFlyoutItem { Text = label, KeyboardAcceleratorTextOverride = shortcut }; item.Click += handler; return item; }
        void Add(string label, RoutedEventHandler handler, string shortcut = "") => menu.Items.Add(Item(label, handler, shortcut));
        Add("Open game…", OpenGame_Click);
        if (_player.Story is not null)
        {
            Add("Back to library", Home_Click);
            menu.Items.Add(new MenuFlyoutSeparator());
            Add("Story appearance…", StorySettings_Click);
            var zoom = new MenuFlyoutSubItem { Text = "Story zoom" };
            zoom.Items.Add(Item("Zoom in", ZoomIn_Click, "Ctrl++")); zoom.Items.Add(Item("Zoom out", ZoomOut_Click, "Ctrl+-")); zoom.Items.Add(Item("Reset zoom", ZoomReset_Click, "Ctrl+0")); menu.Items.Add(zoom);
            Add("Fullscreen", Fullscreen_Click, "F11"); Add("Reload story", ReloadStory_Click);
        }
        menu.Items.Add(new MenuFlyoutSeparator());
        Add("Interaction settings…", InteractionSettings_Click);
        var tools = new MenuFlyoutSubItem { Text = "Tools" };
        if (_player.Story is not null) tools.Items.Add(Item("Developer console", ConsoleEntry_Click));
        tools.Items.Add(Item("Input diagnostics…", InputDiagnostics_Click)); tools.Items.Add(Item("Offline Input Lab", InputLab_Click)); menu.Items.Add(tools);
        if (_player.Story is not null) { menu.Items.Add(new MenuFlyoutSeparator()); Add("Reset this story's browser data…", ResetBrowserData_Click); }
        return menu;
    }
    private async void InteractionSettings_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var panel = new StackPanel { Spacing = 12, MinWidth = Math.Max(160, Math.Min(350, Root.ActualWidth - 96)) };
            var profile = Choice("Interaction profile", Enum.GetNames<InteractionProfile>(), (int)_interaction.Selected);
            var alignment = Choice("Sidebar command placement", ["Top", "Center", "Bottom"], (int)_barPreferences.Alignment);
            var size = Choice("Button size", Enum.GetNames<BarSize>(), (int)_barPreferences.Size);
            var up = new ToggleSwitch { Header = "Page Up command", IsOn = _barPreferences.PageUpEnabled };
            var down = new ToggleSwitch { Header = "Page Down command", IsOn = _barPreferences.PageDownEnabled };
            var order = _barPreferences.Normalized.Order.Where(id => id is not ("console" or "more")).ToList();
            foreach (var id in new[] { "pageUp", "pageDown" }) if (!order.Contains(id)) order.Add(id);
            static string Label(string id) => id switch { "back" => "Library", "pageUp" => "Page up", "pageDown" => "Page down", _ => char.ToUpperInvariant(id[0]) + id[1..] };
            var list = new ListView { ItemsSource = order.Select(Label).ToArray(), Height = 170, SelectionMode = ListViewSelectionMode.Single }; AutomationProperties.SetName(list, "Movable commands in order");
            void Move(int delta) { var index = list.SelectedIndex; if (index < 0 || index + delta < 0 || index + delta >= order.Count) return; (order[index], order[index + delta]) = (order[index + delta], order[index]); list.ItemsSource = order.Select(Label).ToArray(); list.SelectedIndex = index + delta; }
            var moves = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 }; var earlier = new Button { Content = "Move earlier" }; earlier.Click += (_, _) => Move(-1); var later = new Button { Content = "Move later" }; later.Click += (_, _) => Move(1); moves.Children.Add(earlier); moves.Children.Add(later);
            panel.Children.Add(SettingsSection("Input", "Auto adapts when you use a mouse, touch or pen.", true, profile));
            panel.Children.Add(SettingsSection("Comfortable sidebar", "Choose the size and vertical placement of touch-friendly commands.", false, alignment, size, up, down));
            panel.Children.Add(SettingsSection("Command order", "Console and More stay pinned at the end.", false, list, moves));
            var reset = new Button { Content = "Reset interaction defaults" }; reset.Click += (_, _) => { profile.SelectedIndex = 0; alignment.SelectedIndex = 1; size.SelectedIndex = 1; up.IsOn = down.IsOn = false; order = new CommandBarPreferences().Order.Where(id => id is not ("console" or "more")).Concat(new[] { "pageUp", "pageDown" }).ToList(); list.ItemsSource = order.Select(Label).ToArray(); }; panel.Children.Add(reset);
            var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Interaction settings", Content = new ScrollViewer { Content = panel, MaxHeight = Math.Max(180, Root.ActualHeight - 230) }, PrimaryButtonText = "Apply", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary };
            if (await dialog.ShowAsync() == ContentDialogResult.Primary)
            {
                var next = new CommandBarPreferences { Alignment = (BarAlignment)alignment.SelectedIndex, Size = (BarSize)size.SelectedIndex, Reach = _barPreferences.Reach, PageUpEnabled = up.IsOn, PageDownEnabled = down.IsOn, Order = order.ToArray() }.Normalized;
                await new InteractionPreferenceStore(_database).SaveAsync((InteractionProfile)profile.SelectedIndex, next);
                _interaction.Select((InteractionProfile)profile.SelectedIndex); _barPreferences = next; ApplyInteractionLayout();
            }
        }
        catch (Exception error) { ShowPresentationError(error.Message); }
        finally { RestoreStoryFocus(); }
    }
    private static ComboBox Choice(string header, string[] values, int index)
    { var box = new ComboBox { Header = header, ItemsSource = values, SelectedIndex = index, HorizontalAlignment = HorizontalAlignment.Stretch }; AutomationProperties.SetName(box, header); return box; }
    private void RestoreStoryFocus() { if (_closed) return; if (_browser is not null) _browser.Focus(FocusState.Programmatic); else OpenButton.Focus(FocusState.Programmatic); }
}
