using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private static Expander SettingsSection(string title, string description, bool expanded, params UIElement[] controls)
    {
        var header = new StackPanel { Spacing = 4 };
        header.Children.Add(new TextBlock { Text = title, Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"] });
        header.Children.Add(new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap, Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"] });
        var content = new StackPanel { Spacing = 12, Padding = new Thickness(16) };
        foreach (var control in controls) content.Children.Add(control);
        return new Expander { Header = header, Content = content, IsExpanded = expanded, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch };
    }
}
