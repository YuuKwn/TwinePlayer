using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Persistence;

public sealed class StoryIdentityStore
{
    private readonly NativeDatabase _database;
    public StoryIdentityStore(string root) : this(new NativeDatabase(root)) { }
    public StoryIdentityStore(NativeDatabase database) => _database = database;
    public async Task<StoryIdentity> GetOrCreateAsync(string path, CancellationToken cancellationToken = default) =>
        (await _database.RegisterAsync(path, cancellationToken: cancellationToken)).Identity;
}
