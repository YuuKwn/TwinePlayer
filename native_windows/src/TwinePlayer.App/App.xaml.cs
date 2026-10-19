using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml;
using TwinePlayer.Native.App.Services;
using TwinePlayer.Native.App.ViewModels;
using TwinePlayer.Native.Persistence;
using TwinePlayer.Native.Player;

namespace TwinePlayer.Native.App;

public partial class App : Application
{
    private ServiceProvider? _services;
    private MainWindow? _window;
    public App()
    {
        InitializeComponent();
        UnhandledException += (_, e) => _services?.GetRequiredService<ILogger<App>>().LogCritical(e.Exception, "Unhandled UI exception");
        AppDomain.CurrentDomain.UnhandledException += (_, e) => _services?.GetRequiredService<ILogger<App>>().LogCritical(e.ExceptionObject as Exception, "Unhandled application exception");
        TaskScheduler.UnobservedTaskException += (_, e) => _services?.GetRequiredService<ILogger<App>>().LogError(e.Exception, "Unobserved task exception");
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var root = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_DATA_ROOT")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TwinePlayer.Native");
        try { Directory.CreateDirectory(root); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        { ReportStartupFailure(root, error); return; }
        var services = new ServiceCollection();
        services.AddSingleton<ILoggerProvider>(_ => new LocalFileLoggerProvider(Path.Combine(root, "logs")));
        services.AddLogging();
        var database = new NativeDatabase(root);
        services.AddSingleton(database);
        services.AddSingleton(new StoryIdentityStore(database));
        services.AddSingleton<FlutterImporter>();
        services.AddSingleton<ConsoleCommandStore>();
        services.AddSingleton<StoryAssistanceStore>();
        services.AddSingleton(new NativePaths(database.Root));
        services.AddTransient<PlayerViewModel>();
        services.AddTransient<TwinePlayerService>();
        services.AddSingleton<SaveService>();
        services.AddSingleton<MainWindow>();
        _services = services.BuildServiceProvider();
        _window = _services.GetRequiredService<MainWindow>();
        _window.Closed += (_, _) => _services.Dispose();
        var smokeInput = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_SMOKE_INPUT");
        var smokeOutput = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_SMOKE_OUTPUT");
        var saveSmokeInput = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT");
        var benchmarkStory = Environment.GetEnvironmentVariable("TWINEPLAYER_BENCHMARK_STORY");
        var benchmarkRoot = Environment.GetEnvironmentVariable("TWINEPLAYER_BENCHMARK_ROOT");
        var migrationSmoke = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_BROWSER_MIGRATION_SMOKE");
        var deploymentSmoke = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_DEPLOYMENT_STORY");
        var shutdownSmoke = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_SHUTDOWN_SMOKE");
        var uxSmoke = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_UX_SMOKE");
        if (!string.IsNullOrEmpty(uxSmoke) && !string.IsNullOrEmpty(smokeOutput)) _window.ScheduleUxSmoke(uxSmoke, smokeOutput);
        else if (!string.IsNullOrEmpty(shutdownSmoke) && !string.IsNullOrEmpty(smokeOutput)) _window.ScheduleShutdownSmoke(shutdownSmoke, smokeOutput);
        else if (!string.IsNullOrEmpty(deploymentSmoke) && !string.IsNullOrEmpty(smokeOutput)) _window.ScheduleDeploymentSmoke(deploymentSmoke, smokeOutput, Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_EXPECT_MISSING_RUNTIME") == "1");
        else if (!string.IsNullOrEmpty(migrationSmoke) && !string.IsNullOrEmpty(smokeOutput)) _window.ScheduleBrowserMigrationSmoke(migrationSmoke, smokeOutput);
        else if (!string.IsNullOrEmpty(saveSmokeInput) && !string.IsNullOrEmpty(smokeOutput)) _window.ScheduleSaveSmoke(saveSmokeInput, smokeOutput);
        else if (!string.IsNullOrEmpty(smokeInput) && !string.IsNullOrEmpty(smokeOutput)) _window.ScheduleSmoke(smokeInput, smokeOutput);
        else if (!string.IsNullOrEmpty(benchmarkStory) && !string.IsNullOrEmpty(benchmarkRoot)) _window.ScheduleBenchmark(benchmarkStory, benchmarkRoot);
        _window.Activate();
    }
}

public sealed record NativePaths(string Root)
{
    public string BrowserData => Path.Combine(Root, "WebView2");
}
