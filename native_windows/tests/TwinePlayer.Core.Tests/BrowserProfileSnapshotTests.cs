using TwinePlayer.Native.Persistence;
using Xunit;
namespace TwinePlayer.Native.Tests;

public sealed class BrowserProfileSnapshotTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "TwinePlayer-profile-" + Guid.NewGuid().ToString("N"));
    private async Task<string> SourceAsync()
    {
        var source = Path.Combine(_root, "source");
        Directory.CreateDirectory(Path.Combine(source, "EBWebView", "Default"));
        await File.WriteAllTextAsync(Path.Combine(source, "EBWebView", "Local State"), "original-state");
        await File.WriteAllTextAsync(Path.Combine(source, "EBWebView", "Default", "storage"), "original-storage");
        return source;
    }
    [Fact]
    public async Task WorkingCopyCannotMutateSourceOrBackupAndSourceChangesAreRejected()
    {
        var source = await SourceAsync();
        var snapshot = await BrowserProfileSnapshot.CreateAsync(source, Path.Combine(_root, "backups"));
        Assert.Equal(2, snapshot.Files.Count);
        await File.WriteAllTextAsync(Path.Combine(snapshot.WorkingProfile, "EBWebView", "Local State"), "working-state");
        await BrowserProfileSnapshot.VerifySourceAsync(snapshot);
        Assert.Equal("original-state", await File.ReadAllTextAsync(Path.Combine(snapshot.BackupDirectory, "original", "EBWebView", "Local State")));
        await File.WriteAllTextAsync(Path.Combine(source, "EBWebView", "Local State"), "changed-source");
        await Assert.ThrowsAsync<IOException>(() => BrowserProfileSnapshot.VerifySourceAsync(snapshot));
    }
    [Fact]
    public async Task SnapshotRejectsBackupInsideSourceAndInvalidProfile()
    {
        var source = await SourceAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => BrowserProfileSnapshot.CreateAsync(source, Path.Combine(source, "backups")));
        await Assert.ThrowsAsync<IOException>(() => BrowserProfileSnapshot.CreateAsync(Path.Combine(_root, "missing"), Path.Combine(_root, "backups")));
    }
    [Fact]
    public async Task VerificationDetectsFilesAddedAfterSnapshot()
    {
        var source = await SourceAsync();
        var snapshot = await BrowserProfileSnapshot.CreateAsync(source, Path.Combine(_root, "backups"));
        await File.WriteAllTextAsync(Path.Combine(source, "new-file"), "new-data");
        await Assert.ThrowsAsync<IOException>(() => BrowserProfileSnapshot.VerifySourceAsync(snapshot));
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}
