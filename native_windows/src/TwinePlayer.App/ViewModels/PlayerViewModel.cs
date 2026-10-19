using CommunityToolkit.Mvvm.ComponentModel;

namespace TwinePlayer.Native.App.ViewModels;

public class PlayerViewModel : ObservableObject
{
    private string _title = "Library";
    private string _status = "Ready";
    public string Title { get => _title; set => SetProperty(ref _title, value); }
    public string Status { get => _status; set => SetProperty(ref _status, value); }
}

