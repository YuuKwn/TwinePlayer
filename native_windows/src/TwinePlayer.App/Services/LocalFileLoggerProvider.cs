using Microsoft.Extensions.Logging;
using System.Threading.Channels;

namespace TwinePlayer.Native.App.Services;

public sealed class LocalFileLoggerProvider : ILoggerProvider
{
    private readonly Channel<string> _queue = Channel.CreateBounded<string>(new BoundedChannelOptions(256) { SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Task _writer;
    public LocalFileLoggerProvider(string directory) => _writer = Task.Run(async () =>
    {
        try
        {
            Directory.CreateDirectory(directory);
            await foreach (var message in _queue.Reader.ReadAllAsync())
            {
                var path = Path.Combine(directory, $"native-{DateTime.UtcNow:yyyyMMdd}.log");
                if (File.Exists(path) && new FileInfo(path).Length >= 4 * 1024 * 1024) File.Move(path, path + ".previous", overwrite: true);
                await File.AppendAllTextAsync(path, message).ConfigureAwait(false);
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { System.Diagnostics.Debug.WriteLine(error); }
    });
    public ILogger CreateLogger(string categoryName) => new LocalLogger(this, categoryName);
    public void Dispose() { _queue.Writer.TryComplete(); _writer.GetAwaiter().GetResult(); }
    private sealed class LocalLogger(LocalFileLoggerProvider owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(level)) return;
            var text = $"{DateTime.UtcNow:O} {level} {category}: {formatter(state, exception)} {exception}";
            owner._queue.Writer.TryWrite(text[..Math.Min(text.Length, 8192)] + "\n");
        }
    }
}
