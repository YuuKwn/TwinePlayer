namespace TwinePlayer.Native.Core;
public sealed record LibraryGame(Guid Id, string FilePath, string Title, string? Ifid, string MetadataSource, DateTimeOffset? LastPlayedUtc, DateTimeOffset DateAddedUtc, bool Missing, bool Removed = false)
{
    public StoryIdentity Identity => new(Id, FilePath);
    public override string ToString() => $"{(Missing ? "Missing · " : "")}{Title}\n{FilePath}";
}
public sealed record GameMetadata(string Title, string Source, string? Ifid);
