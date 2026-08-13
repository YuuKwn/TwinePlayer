import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:forui/forui.dart';
import 'package:path/path.dart' as p;
import 'package:webview_windows/webview_windows.dart';

import 'adaptive_controls.dart';
import 'models.dart';
import 'services/console_command_store.dart';
import 'services/command_bar_preferences_store.dart';
import 'services/game_metadata_service.dart';
import 'services/history_store.dart';
import 'services/input_diagnostics.dart';
import 'services/interaction_profile_store.dart';
import 'services/fullscreen_service.dart';
import 'services/input_lab_service.dart';
import 'services/save_service.dart';
import 'services/story_assistance_store.dart';
import 'services/webview_scripts.dart';

class TwinePlayerDependencies {
  TwinePlayerDependencies({
    required this.historyStore,
    required this.consoleCommandStore,
    required this.metadataService,
    required this.saveService,
    required this.profileController,
    required this.diagnostics,
    required this.storyAssistanceStore,
    CommandBarPreferencesController? commandBarController,
    InputLabService? inputLabService,
  }) : commandBarController =
           commandBarController ??
           CommandBarPreferencesController(
             store: CommandBarPreferencesStore.inMemory(),
           ),
       inputLabService = inputLabService ?? InputLabService();

  final HistoryStore historyStore;
  final ConsoleCommandStore consoleCommandStore;
  final GameMetadataService metadataService;
  final SaveService saveService;
  final InteractionProfileController profileController;
  final InputDiagnosticsRecorder diagnostics;
  final StoryAssistanceStore storyAssistanceStore;
  final CommandBarPreferencesController commandBarController;
  final InputLabService inputLabService;

  static Future<TwinePlayerDependencies> create() async {
    final profileStore = await InteractionProfileStore.create();
    final profile = await profileStore.load();
    final commandBarStore = await CommandBarPreferencesStore.create();
    final commandBarPreferences = await commandBarStore.load();
    return TwinePlayerDependencies(
      historyStore: await HistoryStore.create(),
      consoleCommandStore: await ConsoleCommandStore.create(),
      metadataService: GameMetadataService(),
      saveService: SaveService(),
      profileController: InteractionProfileController(
        store: profileStore,
        initial: profile,
      ),
      diagnostics: InputDiagnosticsRecorder(),
      storyAssistanceStore: await StoryAssistanceStore.create(),
      commandBarController: CommandBarPreferencesController(
        store: commandBarStore,
        initial: commandBarPreferences,
      ),
      inputLabService: InputLabService(),
    );
  }
}

class TwinePlayerApp extends StatelessWidget {
  const TwinePlayerApp({super.key, required this.dependencies});

  final TwinePlayerDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: dependencies.profileController,
      builder: (context, _) {
        final comfortable = dependencies.profileController.isComfortable;
        final theme = comfortable
            ? FThemes.zinc.dark.touch
            : FThemes.zinc.dark.desktop;
        return InteractionProfileScope(
          notifier: dependencies.profileController,
          child: Listener(
            onPointerDown: (event) {
              dependencies.profileController.observePointer(event.kind);
            },
            child: MaterialApp(
              title: 'Twine Player',
              debugShowCheckedModeBanner: false,
              locale: const Locale('en', 'US'),
              localizationsDelegates: FLocalizations.localizationsDelegates,
              supportedLocales: FLocalizations.supportedLocales,
              theme: theme.toApproximateMaterialTheme().copyWith(
                visualDensity: comfortable
                    ? VisualDensity.standard
                    : VisualDensity.compact,
              ),
              builder: (context, child) => FTheme(
                data: theme,
                platform: FPlatformVariant.macOS,
                child: child!,
              ),
              home: LibraryScreen(dependencies: dependencies),
            ),
          ),
        );
      },
    );
  }
}

enum _LibraryAction { open, relink, copyPath, reveal, remove }

enum _SaveAction { activate, delete }

enum _ConsoleLogAction { runAgain, saveCommand }

enum _MoreAction { console, devTools, settings, report, fullscreen }

class _ToggleFullscreenIntent extends Intent {
  const _ToggleFullscreenIntent();
}

class _ExitFullscreenIntent extends Intent {
  const _ExitFullscreenIntent();
}

const double kMinimumPlayerSurfaceWidth = 240;

/// Returns a bounded side-by-side console width for the exact player content
/// area. The story surface always retains a meaningful minimum width.
double consolePanelWidthFor(double availableWidth) {
  if (!availableWidth.isFinite || availableWidth <= 0) return 0;
  final maximumPanelWidth = availableWidth > kMinimumPlayerSurfaceWidth
      ? availableWidth - kMinimumPlayerSurfaceWidth
      : 0.0;
  if (maximumPanelWidth <= 0) return 0;
  final preferredWidth = (availableWidth * 0.42).clamp(320.0, 520.0).toDouble();
  return preferredWidth.clamp(0.0, maximumPanelWidth).toDouble();
}

/// Keeps the native WebView surface aligned to the exact Flutter content
/// bounds. This is deliberately a Flutter-only seam; story DOM layout is not
/// modified here.
class PlayerContentSurface extends StatelessWidget {
  const PlayerContentSurface({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.hasBoundedWidth ? constraints.maxWidth : null;
        final height = constraints.hasBoundedHeight
            ? constraints.maxHeight
            : null;
        return SizedBox(
          key: const ValueKey<String>('player-content-surface'),
          width: width,
          height: height,
          child: Align(
            alignment: Alignment.center,
            child: SizedBox(width: width, height: height, child: child),
          ),
        );
      },
    );
  }
}

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.dependencies});

  final TwinePlayerDependencies dependencies;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _toastAnchorKey = GlobalKey();
  final _searchController = TextEditingController();
  FToasterEntry? _removalToast;
  var _entries = <LibraryEntry>[];
  final _missingPaths = <String>{};
  var _sortMode = LibrarySortMode.lastPlayed;
  var _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    final entries = await widget.dependencies.historyStore.load();
    if (!mounted) return;
    setState(() {
      _entries = entries;
      _isLoading = false;
    });
    unawaited(_refreshMissingStates());
  }

  Future<void> _persist() => widget.dependencies.historyStore.save(_entries);

  Future<void> _refreshMissingStates() async {
    final missing = <String>{};
    for (final entry in _entries) {
      if (!await File(entry.path).exists()) missing.add(entry.path);
    }
    if (!mounted) return;
    setState(() {
      _missingPaths
        ..clear()
        ..addAll(missing);
    });
  }

  Future<void> _pickGame() async {
    setState(() => _error = null);
    const typeGroup = XTypeGroup(
      label: 'Twine Games',
      extensions: <String>['html', 'htm'],
    );
    final file = await openFile(
      acceptedTypeGroups: const <XTypeGroup>[typeGroup],
    );
    if (file == null) return;
    await _addOrOpenGame(file.path);
  }

  Future<void> _addOrOpenGame(String path) async {
    try {
      final normalized = File(path).absolute.path;
      await _validateGamePath(normalized);
      final metadata = await widget.dependencies.metadataService.extract(
        normalized,
      );
      final entry = LibraryEntry(
        path: normalized,
        title: metadata.title,
        lastPlayed: DateTime.now().toUtc(),
      );
      setState(() {
        _entries = [
          entry,
          ..._entries.where((item) => item.path != normalized),
        ];
        _missingPaths.remove(normalized);
      });
      await _persist();
      if (!mounted) return;
      await _openPlayer(entry);
    } catch (err) {
      setState(() => _error = err.toString());
    }
  }

  Future<void> _validateGamePath(String path) async {
    final extension = p.extension(path).toLowerCase();
    if (extension != '.html' && extension != '.htm') {
      throw ArgumentError('Game path must point to an .html or .htm file.');
    }
    final file = File(path);
    if (!await file.exists()) throw ArgumentError('Game file does not exist.');
    final stat = await file.stat();
    if (stat.type != FileSystemEntityType.file) {
      throw ArgumentError('Game path must point to a readable file.');
    }
  }

  Future<void> _openPlayer(LibraryEntry entry) async {
    if (!await File(entry.path).exists()) {
      setState(() => _missingPaths.add(entry.path));
      return;
    }
    final updated = LibraryEntry(
      path: entry.path,
      title: entry.title,
      lastPlayed: DateTime.now().toUtc(),
    );
    setState(() {
      _entries = [
        updated,
        ..._entries.where((item) => item.path != entry.path),
      ];
    });
    await _persist();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            PlayerScreen(dependencies: widget.dependencies, entry: updated),
      ),
    );
    unawaited(_refreshMissingStates());
  }

  Future<void> _relinkGame(LibraryEntry entry) async {
    const typeGroup = XTypeGroup(
      label: 'Twine Games',
      extensions: <String>['html', 'htm'],
    );
    final file = await openFile(
      acceptedTypeGroups: const <XTypeGroup>[typeGroup],
    );
    if (file == null) return;
    try {
      await _validateGamePath(file.path);
      final metadata = await widget.dependencies.metadataService.extract(
        file.path,
      );
      final replacement = LibraryEntry(
        path: File(file.path).absolute.path,
        title: metadata.title,
        lastPlayed: DateTime.now().toUtc(),
      );
      setState(() {
        _entries = [
          replacement,
          ..._entries.where(
            (item) => item.path != entry.path && item.path != replacement.path,
          ),
        ];
        _missingPaths.remove(entry.path);
        _missingPaths.remove(replacement.path);
      });
      await _persist();
    } catch (err) {
      setState(() => _error = err.toString());
    }
  }

  Future<void> _removeGame(LibraryEntry entry) async {
    final removedIndex = _entries.indexWhere((item) => item.path == entry.path);
    final wasMissing = _missingPaths.contains(entry.path);
    setState(() {
      _entries = _entries.where((item) => item.path != entry.path).toList();
      _missingPaths.remove(entry.path);
    });
    await _persist();
    if (!mounted) return;
    _removalToast?.dismiss();
    _removalToast = showFToast(
      context: _toastAnchorKey.currentContext ?? context,
      title: Text('Removed “${entry.title}” from the library.'),
      icon: const Icon(FLucideIcons.trash),
      alignment: FToastAlignment.topCenter,
      duration: const Duration(seconds: 8),
      suffixBuilder: (_, toast) => AdaptiveLabelButton(
        label: 'Undo',
        icon: FLucideIcons.undo2,
        onPressed: () {
          if (!mounted || _entries.any((item) => item.path == entry.path)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (toast.showing) toast.dismiss();
            });
            return;
          }
          final restored = [..._entries];
          final index = removedIndex.clamp(0, restored.length);
          restored.insert(index, entry);
          setState(() {
            _entries = restored;
            if (wasMissing) _missingPaths.add(entry.path);
          });
          unawaited(_persist());
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (toast.showing) toast.dismiss();
          });
        },
      ),
    );
  }

  Future<void> _copyPath(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    showFToast(
      context: _toastAnchorKey.currentContext ?? context,
      title: const Text('Path copied'),
      icon: const Icon(FLucideIcons.copyCheck),
    );
  }

  Future<void> _revealInExplorer(String filePath) async {
    try {
      await Process.start('explorer.exe', ['/select,', filePath]);
    } catch (err) {
      if (!mounted) return;
      setState(() => _error = 'Could not reveal file: $err');
    }
  }

  Future<void> _showLibraryContextMenu(
    LibraryEntry entry,
    TapDownDetails details,
  ) async {
    final position = details.globalPosition == Offset.zero
        ? MediaQuery.sizeOf(context).center(Offset.zero)
        : details.globalPosition;
    final selected = await showMenu<_LibraryAction>(
      context: context,
      position: RelativeRect.fromLTRB(
        position.dx,
        position.dy,
        position.dx,
        position.dy,
      ),
      items: [
        if (!_missingPaths.contains(entry.path))
          const PopupMenuItem(
            value: _LibraryAction.open,
            child: _ContextMenuLabel(icon: FLucideIcons.play, label: 'Play'),
          ),
        const PopupMenuItem(
          value: _LibraryAction.relink,
          child: _ContextMenuLabel(icon: FLucideIcons.link, label: 'Relink'),
        ),
        const PopupMenuItem(
          value: _LibraryAction.copyPath,
          child: _ContextMenuLabel(icon: FLucideIcons.copy, label: 'Copy path'),
        ),
        const PopupMenuItem(
          value: _LibraryAction.reveal,
          child: _ContextMenuLabel(
            icon: FLucideIcons.folderOpen,
            label: 'Reveal in Explorer',
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: _LibraryAction.remove,
          child: _ContextMenuLabel(
            icon: FLucideIcons.trash,
            label: 'Remove from library',
          ),
        ),
      ],
    );

    switch (selected) {
      case _LibraryAction.open:
        await _openPlayer(entry);
      case _LibraryAction.relink:
        await _relinkGame(entry);
      case _LibraryAction.copyPath:
        await _copyPath(entry.path);
      case _LibraryAction.reveal:
        await _revealInExplorer(entry.path);
      case _LibraryAction.remove:
        await _removeGame(entry);
      case null:
        break;
    }
  }

  Future<void> _showSettings() async {
    await showDialog<void>(
      context: context,
      builder: (_) => _ChromeInputRegion(
        diagnostics: widget.dependencies.diagnostics,
        child: _SettingsDialog(
          profileController: widget.dependencies.profileController,
          diagnostics: widget.dependencies.diagnostics,
          commandBarController: widget.dependencies.commandBarController,
          onLaunchInputLab: _launchInputLab,
        ),
      ),
    );
  }

  Future<void> _launchInputLab() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Open Input Lab?'),
        content: const Text(
          'Input Lab is an offline manual fixture for checking touch, mouse, '
          'focus, scrolling, and story-WebView boundaries. It never enters '
          'library history. Input diagnostics stay off until you enable them.',
        ),
        actions: <Widget>[
          AdaptiveLabelButton(
            label: 'Cancel',
            icon: Icons.close,
            onPressed: () => Navigator.of(context).pop(false),
          ),
          AdaptiveLabelButton(
            label: 'Launch Input Lab',
            icon: Icons.science_outlined,
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => InputLabScreen(dependencies: widget.dependencies),
      ),
    );
  }

  List<LibraryEntry> get _visibleEntries {
    final query = _searchController.text.trim().toLowerCase();
    final filtered = query.isEmpty
        ? [..._entries]
        : _entries
              .where(
                (entry) =>
                    entry.title.toLowerCase().contains(query) ||
                    entry.path.toLowerCase().contains(query),
              )
              .toList();
    filtered.sort((a, b) {
      switch (_sortMode) {
        case LibrarySortMode.title:
          return a.title.toLowerCase().compareTo(b.title.toLowerCase());
        case LibrarySortMode.path:
          return a.path.toLowerCase().compareTo(b.path.toLowerCase());
        case LibrarySortMode.lastPlayed:
          return b.lastPlayed.compareTo(a.lastPlayed);
      }
    });
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final visibleEntries = _visibleEntries;
    return _ChromeInputRegion(
      diagnostics: widget.dependencies.diagnostics,
      child: FToaster(
        style: const FToasterStyleDelta.delta(
          expandBehavior: FToasterExpandBehavior.always,
        ),
        child: Builder(
          key: _toastAnchorKey,
          builder: (context) => FScaffold(
            childPad: false,
            child: SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final showRail = constraints.maxWidth >= 920;
                  return Row(
                    children: [
                      if (showRail)
                        _LibraryRail(
                          total: _entries.length,
                          missing: _missingPaths.length,
                          onLoadGame: _pickGame,
                          onSettings: _showSettings,
                        ),
                      if (showRail) const VerticalDivider(width: 1),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (!showRail)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          '${_entries.length} games · ${_missingPaths.length} unavailable',
                                          style: Theme.of(
                                            context,
                                          ).textTheme.bodySmall,
                                        ),
                                      ),
                                      AdaptiveIconButton(
                                        tooltip: 'Settings',
                                        icon: Icons.settings_outlined,
                                        onPressed: _showSettings,
                                      ),
                                      AdaptiveLabelButton(
                                        label: 'Load Game',
                                        icon: FLucideIcons.filePlus,
                                        onPressed: _pickGame,
                                      ),
                                    ],
                                  ),
                                ),
                              Wrap(
                                spacing: 10,
                                runSpacing: 8,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  const Text(
                                    'Your Library',
                                    style: TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  SizedBox(
                                    width: constraints.maxWidth < 620
                                        ? constraints.maxWidth - 36
                                        : 360,
                                    child: FTextField(
                                      control: FTextFieldControl.managed(
                                        controller: _searchController,
                                        onChange: (_) => setState(() {}),
                                      ),
                                      hint: 'Search library',
                                      prefixBuilder:
                                          (context, style, variants) =>
                                              FTextField.prefixIconBuilder(
                                                context,
                                                style,
                                                variants,
                                                const Icon(FLucideIcons.search),
                                              ),
                                      clearable: (value) =>
                                          value.text.isNotEmpty,
                                      size: FTextFieldSizeVariant.sm,
                                    ),
                                  ),
                                  _SortModeSelector(
                                    value: _sortMode,
                                    onChange: (value) =>
                                        setState(() => _sortMode = value),
                                  ),
                                ],
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: 10),
                                _InlineError(
                                  message: _error!,
                                  onDismiss: () =>
                                      setState(() => _error = null),
                                ),
                              ],
                              const SizedBox(height: 12),
                              Expanded(
                                child: _isLoading
                                    ? const _LoadingState(
                                        label: 'Loading library...',
                                      )
                                    : visibleEntries.isEmpty
                                    ? Center(
                                        child: Text(
                                          _entries.isEmpty
                                              ? 'No games in your library yet.'
                                              : 'No games match your search.',
                                          style: Theme.of(
                                            context,
                                          ).textTheme.titleMedium,
                                        ),
                                      )
                                    : GridView.builder(
                                        gridDelegate:
                                            const SliverGridDelegateWithMaxCrossAxisExtent(
                                              maxCrossAxisExtent: 300,
                                              mainAxisExtent: 148,
                                              mainAxisSpacing: 8,
                                              crossAxisSpacing: 8,
                                            ),
                                        itemCount: visibleEntries.length,
                                        itemBuilder: (context, index) {
                                          final entry = visibleEntries[index];
                                          return _LibraryCard(
                                            entry: entry,
                                            isMissing: _missingPaths.contains(
                                              entry.path,
                                            ),
                                            onOpen: () => _openPlayer(entry),
                                            onMenu: (details) =>
                                                _showLibraryContextMenu(
                                                  entry,
                                                  details,
                                                ),
                                          );
                                        },
                                      ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Explicitly routes the bundled fixture through the same PlayerScreen chrome,
/// focus, fullscreen, diagnostics, and profile seams as a real game. The
/// fixture mode bypasses HistoryStore and per-game assistance persistence.
class InputLabScreen extends StatelessWidget {
  const InputLabScreen({super.key, required this.dependencies});

  final TwinePlayerDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    return PlayerScreen.inputLab(dependencies: dependencies);
  }
}

class _SortModeSelector extends StatelessWidget {
  const _SortModeSelector({required this.value, required this.onChange});

  final LibrarySortMode value;
  final ValueChanged<LibrarySortMode> onChange;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: context.theme.colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SortButton(
            label: 'Recent',
            icon: FLucideIcons.history,
            selected: value == LibrarySortMode.lastPlayed,
            onPress: () => onChange(LibrarySortMode.lastPlayed),
          ),
          _SortButton(
            label: 'Title',
            icon: FLucideIcons.arrowDownAZ,
            selected: value == LibrarySortMode.title,
            onPress: () => onChange(LibrarySortMode.title),
          ),
          _SortButton(
            label: 'Path',
            icon: FLucideIcons.folder,
            selected: value == LibrarySortMode.path,
            onPress: () => onChange(LibrarySortMode.path),
          ),
        ],
      ),
    );
  }
}

class _SortButton extends StatelessWidget {
  const _SortButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onPress,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback? onPress;

  @override
  Widget build(BuildContext context) {
    return FButton(
      variant: selected ? FButtonVariant.secondary : FButtonVariant.ghost,
      size: FButtonSizeVariant.sm,
      onPress: onPress,
      prefix: Icon(icon),
      child: Text(label),
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox(
        width: 220,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FProgress(),
            const SizedBox(height: 12),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class PlayerScreen extends StatefulWidget {
  const PlayerScreen({
    super.key,
    required this.dependencies,
    required this.entry,
  }) : fixtureMode = false;

  PlayerScreen.inputLab({super.key, required this.dependencies})
    : entry = LibraryEntry(
        path: 'input-lab://bundled',
        title: 'Input Lab',
        lastPlayed: DateTime.utc(1970),
      ),
      fixtureMode = true;

  final TwinePlayerDependencies dependencies;
  final LibraryEntry entry;
  final bool fixtureMode;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  final _controller = WebviewController();
  final _subscriptions = <StreamSubscription<dynamic>>[];
  final _consoleInput = TextEditingController();
  final _webViewFocusNode = FocusNode(
    debugLabel: 'Twine game WebView focus sentinel',
  );
  final _fullscreen = FullscreenController();
  var _logs = <ConsoleLog>[];
  var _savedCommands = <String, List<String>>{};
  var _suggestions = <String>[];
  var _isWebViewReady = false;
  var _isConsoleOpen = false;
  var _isConsoleSideBySide = false;
  var _isCommandBarCollapsed = false;
  var _isLoading = true;
  var _currentIfid = '';
  var _storyAssistance = StoryAssistancePreferences.defaults;
  var _storyAssistanceStatus = 'Engine status: unknown until the story loads.';
  Future<void> _storyAssistanceMutationQueue = Future<void>.value();
  String? _webViewError;
  var _isFullscreen = false;

  @override
  void initState() {
    super.initState();
    widget.dependencies.commandBarController.addListener(
      _onCommandBarPreferencesChanged,
    );
    _loadConsoleCommands();
    unawaited(_loadStoryAssistance());
    unawaited(_initializeWebView());
  }

  @override
  void dispose() {
    widget.dependencies.commandBarController.removeListener(
      _onCommandBarPreferencesChanged,
    );
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    _consoleInput.dispose();
    _webViewFocusNode.dispose();
    if (_isFullscreen || _fullscreen.isFullscreen) {
      // Route disposal cannot await. Make a best-effort host reset so a later
      // player/library reopen never inherits this screen's fullscreen style.
      unawaited(_fullscreen.setFullscreen(false));
    }
    unawaited(_controller.dispose());
    super.dispose();
  }

  void _onCommandBarPreferencesChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _loadConsoleCommands() async {
    final commands = await widget.dependencies.consoleCommandStore.load();
    if (mounted) setState(() => _savedCommands = commands);
  }

  Future<void> _loadStoryAssistance() async {
    if (widget.fixtureMode) return;
    final preferences = await widget.dependencies.storyAssistanceStore
        .loadForGame(widget.entry.path);
    if (!mounted) return;
    setState(() => _storyAssistance = preferences);
    if (_isWebViewReady) await _applyStoryAssistance();
  }

  Future<void> _saveStoryAssistance() async {
    if (widget.fixtureMode) return;
    await widget.dependencies.storyAssistanceStore.saveForGame(
      widget.entry.path,
      _storyAssistance,
    );
  }

  Future<void> _applyStoryAssistance() async {
    if (!_isWebViewReady) return;
    await _controller.setZoomFactor(_storyAssistance.zoomFactor);
    if (!mounted || !_isWebViewReady) return;
    await _controller.executeScript(
      'window.__twinePlayerSetEnhancedChoices && window.__twinePlayerSetEnhancedChoices(${_storyAssistance.enhancedChoices ? 'true' : 'false'});',
    );
    final config = <String, Object?>{
      'enabled': _storyAssistance.readabilityEnabled,
      'textScale': _storyAssistance.textScale,
      'lineHeight': _storyAssistance.lineHeight,
      'paragraphSpacing': _storyAssistance.paragraphSpacing,
      'readableLineLengthEnabled': _storyAssistance.readableLineLengthEnabled,
      'readableLineLength': _storyAssistance.readableLineLength,
      'targetSpacing': _storyAssistance.targetSpacing,
    };
    final encoded = jsonEncode(config);
    final result = await _controller.executeScript(
      'JSON.stringify(window.__twinePlayerSetStoryAssistance ? window.__twinePlayerSetStoryAssistance($encoded) : {engine:"unknown",reason:"bridge-unavailable"});',
    );
    _updateStoryAssistanceStatus(result);
  }

  void _updateStoryAssistanceStatus(Object? result) {
    if (!mounted || result == null) return;
    Object? value = result;
    if (value is String) {
      try {
        value = jsonDecode(value);
      } catch (_) {
        return;
      }
    }
    if (value is! Map) return;
    final engine = value['engine'] is String
        ? value['engine'] as String
        : 'unknown';
    final verified = value['verified'] == true;
    final enabled = value['enabled'] == true;
    final reason = value['reason'] is String
        ? value['reason'] as String
        : 'unknown';
    setState(() {
      _storyAssistanceStatus = enabled
          ? 'Engine: $engine (${verified ? 'verified' : reason}).'
          : 'Engine: $engine; readability is off.';
    });
  }

  Future<void> _initializeWebView() async {
    try {
      await _controller.initialize();
      await _controller.setBackgroundColor(Colors.transparent);
      await _controller.setPopupWindowPolicy(WebviewPopupWindowPolicy.deny);
      _subscriptions.add(
        _controller.loadingState.listen((state) {
          if (!mounted) return;
          setState(() => _isLoading = state == LoadingState.loading);
          if (state == LoadingState.navigationCompleted) {
            // Document-created scripts run before the new document exists,
            // so restore the current per-game settings once navigation has
            // completed. The helper owns its async error boundary because
            // this stream callback is intentionally fire-and-forget.
            unawaited(_reapplyWebViewStateAfterNavigation());
          }
        }, onError: (_, _) {}),
      );
      _subscriptions.add(_controller.webMessage.listen(_handleWebMessage));
      _subscriptions.add(
        _controller.onLoadError.listen((error) {
          if (mounted) {
            setState(() => _webViewError = 'WebView load error: $error');
          }
        }),
      );
      await _controller.addScriptToExecuteOnDocumentCreated(
        twineBridgeScript(),
      );
      if (widget.fixtureMode) {
        await _controller.loadStringContent(
          await widget.dependencies.inputLabService.loadFixture(),
        );
      } else {
        final gameFile = File(widget.entry.path);
        final gameDir = gameFile.parent.absolute.path;
        await _controller.addVirtualHostNameMapping(
          'twineplayer.local',
          gameDir,
          WebviewHostResourceAccessKind.allow,
        );
        await _controller.loadUrl(
          Uri(
            scheme: 'https',
            host: 'twineplayer.local',
            pathSegments: [p.basename(widget.entry.path)],
          ).toString(),
        );
      }
      if (!mounted) return;
      setState(() => _isWebViewReady = true);
      await _applyStoryAssistance();
      await _syncWebViewDiagnostics();
    } on PlatformException catch (err) {
      if (mounted) {
        setState(() => _webViewError = '${err.code}: ${err.message}');
      }
    } catch (err) {
      if (mounted) setState(() => _webViewError = err.toString());
    }
  }

  void _handleWebMessage(dynamic message) {
    try {
      final decoded = jsonDecode(
        message is String ? message : jsonEncode(message),
      );
      if (decoded is! Map<String, dynamic>) return;
      switch (decoded['type']) {
        case 'identity':
          final ifid =
              decoded['ifid'] is String &&
                  (decoded['ifid'] as String).trim().isNotEmpty
              ? (decoded['ifid'] as String).trim()
              : 'fallback_${widget.entry.path.hashCode}';
          setState(() => _currentIfid = ifid);
          _log(
            'Game linked: ${decoded['title'] ?? widget.entry.title}',
            'result',
          );
        case 'log':
          _log(
            '${decoded['message'] ?? ''}',
            '${decoded['level'] ?? 'normal'}',
          );
        case 'save-bytes':
          final bytes = decoded['bytes'];
          if (bytes is List) {
            final data = Uint8List.fromList(bytes.whereType<int>().toList());
            unawaited(
              _openSaveManager(SaveManagerMode.save, pendingSaveBytes: data),
            );
          }
        case 'load-request':
          unawaited(_openSaveManager(SaveManagerMode.load));
        case 'image-preview':
        case 'image-context':
          final src = decoded['src'];
          if (src is String && src.trim().isNotEmpty) {
            unawaited(
              _showImagePreview(
                src: src,
                alt: decoded['alt'] is String ? decoded['alt'] as String : '',
              ),
            );
          }
        case 'input-diagnostic':
          if (widget.dependencies.diagnostics.enabled) {
            final event = InputDiagnosticEvent.fromWebViewMetadata(
              kind: decoded['kind'],
              category: decoded['category'],
              buttons: decoded['buttons'],
              contacts: decoded['contacts'],
            );
            if (event != null) widget.dependencies.diagnostics.record(event);
          }
      }
    } catch (err) {
      _log('Bridge message failed: $err', 'error');
    }
  }

  void _log(String message, String type) {
    if (!mounted) return;
    setState(() {
      _logs = [
        ..._logs,
        ConsoleLog(message: message, type: type, timestamp: DateTime.now()),
      ].takeLast(300).toList();
    });
  }

  void _logCommand(String command) {
    if (!mounted) return;
    setState(() {
      _logs = [
        ..._logs,
        ConsoleLog(
          message: '> $command',
          type: 'input',
          timestamp: DateTime.now(),
          command: command,
        ),
      ].takeLast(300).toList();
    });
  }

  Future<dynamic> _executeJsonScript(String script) async {
    final result = await _controller.executeScript(script);
    if (result == null) return null;
    if (result is String) {
      return _decodeScriptResult(result);
    }
    return result;
  }

  dynamic _decodeScriptResult(String result) {
    dynamic decoded = result;
    for (var i = 0; i < 2; i++) {
      if (decoded is! String) return decoded;
      final trimmed = decoded.trim();
      if (trimmed.isEmpty) return decoded;
      try {
        decoded = jsonDecode(trimmed);
      } catch (_) {
        return decoded;
      }
    }
    return decoded;
  }

  Future<void> _undo() async {
    await _controller.executeScript(r'''
(function () {
  try {
    var sc = window.SugarCube || {};
    if (sc.Engine && typeof sc.Engine.backward === 'function') return sc.Engine.backward();
    if (window.Engine && typeof window.Engine.backward === 'function') return window.Engine.backward();
    if (window.history && typeof window.history.back === 'function') return window.history.back();
  } catch (err) {
    window.__twinePlayerLog('Undo failed: ' + err.message, 'error');
  }
})();
''');
    _restoreStoryFocus();
  }

  Future<void> _scrollStoryPage(int direction) async {
    if (!_isWebViewReady) return;
    await _executeJsonScript(
      'JSON.stringify(window.__twinePlayerScrollStoryPage ? window.__twinePlayerScrollStoryPage($direction) : {ok:false,reason:"bridge-unavailable"});',
    );
    _restoreStoryFocus();
  }

  Future<void> _captureAndSave() async {
    if (widget.fixtureMode) {
      _showFixtureMessage('Save');
      return;
    }
    dynamic result;
    try {
      result = await _executeJsonScript(r'''
(function () { return JSON.stringify(window.__twinePlayerCaptureSave()); })();
''');
    } catch (err) {
      _showSaveCaptureError('Unable to capture save: $err');
      return;
    }
    if (result is! Map || result['ok'] != true) {
      _showSaveCaptureError(
        result is Map
            ? '${result['error'] ?? 'Unable to capture save.'}'
            : 'Unable to capture save.',
      );
      return;
    }
    if (result['pending'] == true) {
      _log(
        'Capturing save via ${result['method'] ?? 'SugarCube'}...',
        'normal',
      );
      return;
    }
    final data = Uint8List.fromList(utf8.encode('${result['data'] ?? ''}'));
    try {
      await _openSaveManager(SaveManagerMode.save, pendingSaveBytes: data);
    } catch (err) {
      _showSaveCaptureError('Unable to open save manager: $err');
      return;
    }
    _restoreStoryFocus();
  }

  void _showSaveCaptureError(String detail) {
    final message = detail.trim().isEmpty ? 'Unable to capture save.' : detail;
    _log(message, 'error');
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('Save failed: $message')));
  }

  Future<void> _restoreSave(SaveEntry save) async {
    final bytes = await widget.dependencies.saveService.readSave(
      widget.entry.path,
      save.filename,
    );
    if (bytes == null) {
      _log('Save not found: ${save.filename}', 'error');
      return;
    }
    final encoded = jsonEncode(utf8.decode(bytes, allowMalformed: true));
    final decodedText = utf8.decode(bytes, allowMalformed: true).trim();
    if (decodedText.isEmpty || decodedText == 'null') {
      _log(
        'Invalid save file: "${save.filename}" contains no usable save data. Create a fresh save with the current build.',
        'error',
      );
      return;
    }
    final result = await _executeJsonScript(
      'JSON.stringify(window.__twinePlayerRestoreSave($encoded));',
    );
    if (result is Map && result['ok'] == true) {
      if (result['pending'] == true) {
        _log(
          'Loading save via ${result['method'] ?? 'SugarCube'}...',
          'normal',
        );
      } else {
        _log('Loaded save: ${save.filename}', 'result');
      }
    } else {
      _log(
        '${result is Map ? (result['error'] ?? 'Unable to load save.') : 'Unable to load save.'}',
        'error',
      );
    }
  }

  Future<void> _openLoadManager() async {
    if (widget.fixtureMode) {
      _showFixtureMessage('Load');
      return;
    }
    final result = await _executeJsonScript(
      'JSON.stringify(window.__twinePlayerPrepareNativeLoad());',
    );
    if (result is Map && result['ok'] == true) {
      _log(
        'Preparing native load bridge via ${result['method'] ?? 'SugarCube'}...',
        'normal',
      );
      return;
    }

    _log(
      '${result is Map ? (result['error'] ?? 'Opening TwinePlayer load manager.') : 'Opening TwinePlayer load manager.'}',
      'normal',
    );
    await _openSaveManager(SaveManagerMode.load);
    _restoreStoryFocus();
  }

  Future<void> _openSaveManager(
    SaveManagerMode mode, {
    Uint8List? pendingSaveBytes,
  }) async {
    if (widget.fixtureMode) {
      _showFixtureMessage(mode == SaveManagerMode.save ? 'Save' : 'Load');
      return;
    }
    final result = await showDialog<_SaveDialogResult>(
      context: context,
      barrierDismissible: true,
      builder: (_) => _ChromeInputRegion(
        diagnostics: widget.dependencies.diagnostics,
        child: SaveManagerDialog(
          mode: mode,
          gamePath: widget.entry.path,
          saveService: widget.dependencies.saveService,
          pendingSaveBytes: pendingSaveBytes,
        ),
      ),
    );
    if (result == null) {
      _restoreStoryFocus();
      return;
    }
    if (result.loadedSave != null) {
      await _restoreSave(result.loadedSave!);
    } else if (result.savedFilename != null) {
      _log('Saved successfully to ${result.savedFilename}', 'result');
    }
    _restoreStoryFocus();
  }

  void _restoreStoryFocus() {
    if (!mounted) return;
    _webViewFocusNode.requestFocus();
    if (_isWebViewReady) unawaited(_controller.focus());
  }

  void _showFixtureMessage(String operation) {
    if (!mounted) return;
    final message =
        'Input Lab does not use save files. $operation is disabled for this fixture.';
    _log(message, 'normal');
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
    _restoreStoryFocus();
  }

  Future<void> _syncWebViewDiagnostics() async {
    if (!mounted || !_isWebViewReady) return;
    await _controller.executeScript(
      'window.__twinePlayerSetDiagnosticsEnabled && window.__twinePlayerSetDiagnosticsEnabled(${widget.dependencies.diagnostics.enabled ? 'true' : 'false'});',
    );
  }

  Future<void> _reapplyWebViewStateAfterNavigation() async {
    if (!mounted || !_isWebViewReady) return;
    try {
      await _applyStoryAssistance();
      if (!mounted) return;
      await _syncWebViewDiagnostics();
    } catch (_) {
      // Navigation can race with route disposal or a WebView teardown. The
      // next successful navigation/initialization will retry the state sync.
    }
  }

  Future<void> _toggleFullscreen() async {
    final next = await _fullscreen.toggle();
    if (mounted) setState(() => _isFullscreen = next);
    _restoreStoryFocus();
  }

  Future<void> _exitFullscreen() async {
    if (!_isFullscreen && !_fullscreen.isFullscreen) return;
    final next = await _fullscreen.setFullscreen(false);
    if (mounted) setState(() => _isFullscreen = next);
    _restoreStoryFocus();
  }

  Future<void> _leavePlayer() async {
    // Restore the windowed style/rectangle before popping the route so a
    // subsequent library/player reopen cannot inherit a stale fullscreen
    // state from this screen.
    final wasFullscreen = _isFullscreen || _fullscreen.isFullscreen;
    await _exitFullscreen();
    // PopScope observes canPop from the most recent frame. Yield one frame
    // after leaving fullscreen so the now-windowed state is visible before
    // Navigator.pop is evaluated; otherwise a back tap can be rejected by
    // the stale fullscreen guard.
    if (mounted && wasFullscreen) {
      await WidgetsBinding.instance.endOfFrame;
    }
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _adjustStoryZoom(int direction) async {
    final zoomFactor = stepStoryZoom(_storyAssistance.zoomFactor, direction);
    if (zoomFactor == _storyAssistance.zoomFactor) return;
    setState(
      () =>
          _storyAssistance = _storyAssistance.copyWith(zoomFactor: zoomFactor),
    );
    if (_isWebViewReady) await _controller.setZoomFactor(zoomFactor);
    await _saveStoryAssistance();
    _restoreStoryFocus();
  }

  Future<void> _resetStoryZoom() async {
    if (_storyAssistance.zoomFactor == 1) return;
    setState(() => _storyAssistance = _storyAssistance.copyWith(zoomFactor: 1));
    if (_isWebViewReady) await _controller.setZoomFactor(1);
    await _saveStoryAssistance();
    _restoreStoryFocus();
  }

  Future<void> _setEnhancedChoices(bool enabled) async {
    if (_storyAssistance.enhancedChoices == enabled) return;
    setState(
      () => _storyAssistance = _storyAssistance.copyWith(
        enhancedChoices: enabled,
      ),
    );
    if (_isWebViewReady) {
      await _controller.executeScript(
        'window.__twinePlayerSetEnhancedChoices && window.__twinePlayerSetEnhancedChoices(${enabled ? 'true' : 'false'});',
      );
    }
    await _saveStoryAssistance();
    _restoreStoryFocus();
  }

  Future<void> _setStoryAssistancePreferences(
    StoryAssistancePreferences preferences,
  ) async {
    setState(() => _storyAssistance = preferences.normalized);
    // Slider drags and rapid switch changes may enqueue several updates. Run
    // WebView application and persistence in order so an older asynchronous
    // call can never overwrite the latest preference on disk.
    final operation = _storyAssistanceMutationQueue.then((_) async {
      if (!mounted) return;
      if (_isWebViewReady) await _applyStoryAssistance();
      await _saveStoryAssistance();
      _restoreStoryFocus();
    });
    _storyAssistanceMutationQueue = operation.catchError((_) {});
    await operation;
  }

  Future<void> _resetStoryReadability() async {
    await _setStoryAssistancePreferences(_storyAssistance.resetReadability());
  }

  Future<void> _showPlayerSettings() async {
    await showDialog<void>(
      context: context,
      builder: (_) => _ChromeInputRegion(
        diagnostics: widget.dependencies.diagnostics,
        child: _SettingsDialog(
          profileController: widget.dependencies.profileController,
          diagnostics: widget.dependencies.diagnostics,
          commandBarController: widget.dependencies.commandBarController,
          storyAssistance: _storyAssistance,
          storyAssistanceStatus: _storyAssistanceStatus,
          onZoomOut: () => unawaited(_adjustStoryZoom(-1)),
          onZoomIn: () => unawaited(_adjustStoryZoom(1)),
          onResetZoom: () => unawaited(_resetStoryZoom()),
          onEnhancedChoices: (value) => unawaited(_setEnhancedChoices(value)),
          onReadabilityChanged: (value) =>
              unawaited(_setStoryAssistancePreferences(value)),
          onResetReadability: () => unawaited(_resetStoryReadability()),
        ),
      ),
    );
    await _syncWebViewDiagnostics();
  }

  Future<void> _showPlayerMoreMenu() async {
    var sheetPreferences = _storyAssistance;
    final action = await showModalBottomSheet<_MoreAction>(
      context: context,
      builder: (context) => _ChromeInputRegion(
        diagnostics: widget.dependencies.diagnostics,
        child: ListenableBuilder(
          listenable: Listenable.merge(<Listenable>[
            widget.dependencies.profileController,
            widget.dependencies.diagnostics,
          ]),
          builder: (context, _) => SafeArea(
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  ListTile(
                    leading: const Icon(FLucideIcons.squareTerminal),
                    title: const Text('Developer Console'),
                    onTap: () => Navigator.of(context).pop(_MoreAction.console),
                  ),
                  ListTile(
                    leading: const Icon(FLucideIcons.bug),
                    title: const Text('WebView DevTools'),
                    onTap: () =>
                        Navigator.of(context).pop(_MoreAction.devTools),
                  ),
                  const Divider(height: 1),
                  StatefulBuilder(
                    builder: (context, setSheetState) {
                      return _StoryAssistanceSettingsSection(
                        preferences: sheetPreferences,
                        engineStatus: _storyAssistanceStatus,
                        onZoomOut: () {
                          sheetPreferences = sheetPreferences.copyWith(
                            zoomFactor: stepStoryZoom(
                              sheetPreferences.zoomFactor,
                              -1,
                            ),
                          );
                          setSheetState(() {});
                          unawaited(_adjustStoryZoom(-1));
                        },
                        onZoomIn: () {
                          sheetPreferences = sheetPreferences.copyWith(
                            zoomFactor: stepStoryZoom(
                              sheetPreferences.zoomFactor,
                              1,
                            ),
                          );
                          setSheetState(() {});
                          unawaited(_adjustStoryZoom(1));
                        },
                        onResetZoom: () {
                          sheetPreferences = sheetPreferences.copyWith(
                            zoomFactor: 1,
                          );
                          setSheetState(() {});
                          unawaited(_resetStoryZoom());
                        },
                        onEnhancedChoices: (value) {
                          sheetPreferences = sheetPreferences.copyWith(
                            enhancedChoices: value,
                          );
                          setSheetState(() {});
                          unawaited(_setEnhancedChoices(value));
                        },
                        onReadabilityChanged: (value) {
                          sheetPreferences = value;
                          setSheetState(() {});
                          unawaited(_setStoryAssistancePreferences(value));
                        },
                        onResetReadability: () {
                          sheetPreferences = sheetPreferences
                              .resetReadability();
                          setSheetState(() {});
                          unawaited(_resetStoryReadability());
                        },
                      );
                    },
                  ),
                  const Divider(height: 1),
                  const ListTile(
                    leading: Icon(Icons.tune),
                    title: Text('Interaction profile'),
                    dense: true,
                  ),
                  for (final profile in InteractionProfile.values)
                    RadioListTile<InteractionProfile>(
                      value: profile,
                      // ignore: deprecated_member_use
                      groupValue:
                          widget.dependencies.profileController.selected,
                      // ignore: deprecated_member_use
                      onChanged: (value) {
                        if (value != null) {
                          unawaited(
                            widget.dependencies.profileController.setSelected(
                              value,
                            ),
                          );
                        }
                      },
                      title: Text(profile.label),
                      subtitle: Text(profile.description),
                      contentPadding: const EdgeInsets.only(left: 16, right: 8),
                    ),
                  SwitchListTile(
                    value: widget.dependencies.diagnostics.enabled,
                    onChanged: widget.dependencies.diagnostics.setEnabled,
                    title: const Text('Enable input diagnostics'),
                    subtitle: const Text(
                      'Metadata only; kept in memory for this session.',
                    ),
                  ),
                  ListTile(
                    leading: const Icon(Icons.article_outlined),
                    title: const Text('View input diagnostics report'),
                    onTap: () => Navigator.of(context).pop(_MoreAction.report),
                  ),
                  ListTile(
                    leading: const Icon(Icons.delete_sweep_outlined),
                    title: const Text('Clear input diagnostics'),
                    onTap: widget.dependencies.diagnostics.clear,
                  ),
                  ListTile(
                    leading: const Icon(Icons.settings_outlined),
                    title: const Text('Open full settings'),
                    onTap: () =>
                        Navigator.of(context).pop(_MoreAction.settings),
                  ),
                  ListTile(
                    leading: Icon(
                      _isFullscreen ? Icons.fullscreen_exit : Icons.fullscreen,
                    ),
                    title: Text(
                      _isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
                    ),
                    onTap: () =>
                        Navigator.of(context).pop(_MoreAction.fullscreen),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    var restoreFocus = true;
    switch (action) {
      case _MoreAction.console:
        if (mounted) setState(() => _isConsoleOpen = true);
        restoreFocus = false;
      case _MoreAction.devTools:
        await _controller.openDevTools();
        restoreFocus = false;
      case _MoreAction.settings:
        await _showPlayerSettings();
      case _MoreAction.report:
        if (!mounted) break;
        await showDialog<void>(
          context: context,
          builder: (_) => _ChromeInputRegion(
            diagnostics: widget.dependencies.diagnostics,
            child: _DiagnosticsDialog(
              diagnostics: widget.dependencies.diagnostics,
            ),
          ),
        );
      case _MoreAction.fullscreen:
        await _toggleFullscreen();
      case null:
        break;
    }
    await _syncWebViewDiagnostics();
    if (restoreFocus) _restoreStoryFocus();
  }

  Future<void> _showImagePreview({
    required String src,
    required String alt,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _ChromeInputRegion(
        diagnostics: widget.dependencies.diagnostics,
        child: ImagePreviewDialog(src: src, alt: alt),
      ),
    );
    _restoreStoryFocus();
  }

  Future<void> _runConsoleCommand(String command) async {
    final trimmed = command.trim();
    if (trimmed.isEmpty) return;
    _logCommand(trimmed);
    final result = await _executeJsonScript(
      'JSON.stringify(window.__twinePlayerRunCommand(${jsonEncode(trimmed)}));',
    );
    if (result is Map && result['ok'] == true) {
      _log('<- ${result['result']}', 'result');
    } else {
      _log(
        'Err: ${result is Map ? result['error'] : 'Command failed'}',
        'error',
      );
    }
    _consoleInput.clear();
    setState(() => _suggestions = <String>[]);
  }

  Future<void> _saveConsoleCommand() async {
    await _saveConsoleCommandValue(_consoleInput.text);
  }

  Future<void> _saveConsoleCommandValue(String value) async {
    final command = value.trim();
    if (command.isEmpty) return;
    final ifid = _currentIfid.isEmpty
        ? 'fallback_${widget.entry.path.hashCode}'
        : _currentIfid;
    final commands = [...(_savedCommands[ifid] ?? <String>[])];
    if (!commands.contains(command)) commands.add(command);
    setState(() => _savedCommands = {..._savedCommands, ifid: commands});
    await widget.dependencies.consoleCommandStore.save(_savedCommands);
    _log('Command saved.', 'normal');
  }

  Future<void> _updateCompletions(String input) async {
    final result = await _executeJsonScript(
      'JSON.stringify(window.__twinePlayerCompletions(${jsonEncode(input)}));',
    );
    if (!mounted) return;
    setState(
      () => _suggestions = result is List
          ? result.whereType<String>().toList()
          : <String>[],
    );
  }

  @override
  Widget build(BuildContext context) {
    final console = _ChromeInputRegion(
      diagnostics: widget.dependencies.diagnostics,
      child: ConsolePanel(
        comfortable: widget.dependencies.profileController.isComfortable,
        inputController: _consoleInput,
        logs: _logs,
        savedCommands: _savedCommands[_currentIfid] ?? const <String>[],
        suggestions: _suggestions,
        onChanged: _updateCompletions,
        onRun: _runConsoleCommand,
        onSave: _saveConsoleCommand,
        onSaveCommand: _saveConsoleCommandValue,
        onClose: () => setState(() => _isConsoleOpen = false),
        onToggleLayout: () =>
            setState(() => _isConsoleSideBySide = !_isConsoleSideBySide),
        isSideBySide: _isConsoleSideBySide,
        onUseSaved: (command) {
          _consoleInput.text = command;
          _consoleInput.selection = TextSelection.collapsed(
            offset: command.length,
          );
        },
        onDeleteSaved: (index) async {
          final ifid = _currentIfid.isEmpty
              ? 'fallback_${widget.entry.path.hashCode}'
              : _currentIfid;
          final commands = [...(_savedCommands[ifid] ?? <String>[])];
          if (index < 0 || index >= commands.length) return;
          commands.removeAt(index);
          final next = {..._savedCommands};
          if (commands.isEmpty) {
            next.remove(ifid);
          } else {
            next[ifid] = commands;
          }
          setState(() => _savedCommands = next);
          await widget.dependencies.consoleCommandStore.save(_savedCommands);
        },
      ),
    );

    return PopScope<void>(
      canPop: !_isFullscreen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _isFullscreen) unawaited(_exitFullscreen());
      },
      child: Shortcuts(
        shortcuts: <LogicalKeySet, Intent>{
          LogicalKeySet(LogicalKeyboardKey.f11):
              const _ToggleFullscreenIntent(),
          if (_isFullscreen)
            LogicalKeySet(LogicalKeyboardKey.escape):
                const _ExitFullscreenIntent(),
        },
        child: Actions(
          actions: <Type, Action<Intent>>{
            _ToggleFullscreenIntent: CallbackAction<_ToggleFullscreenIntent>(
              onInvoke: (_) {
                unawaited(_toggleFullscreen());
                return null;
              },
            ),
            _ExitFullscreenIntent: CallbackAction<_ExitFullscreenIntent>(
              onInvoke: (_) {
                unawaited(_exitFullscreen());
                return null;
              },
            ),
          },
          child: Scaffold(
            body: SafeArea(
              child: Column(
                children: [
                  if (!widget.dependencies.profileController.isComfortable)
                    _ChromeInputRegion(
                      diagnostics: widget.dependencies.diagnostics,
                      child: CompactPlayerToolbar(
                        title: widget.entry.title,
                        onBackToLibrary: () => unawaited(_leavePlayer()),
                        onUndo: _undo,
                        onSave: _captureAndSave,
                        onLoad: _openLoadManager,
                        onConsole: () => setState(() => _isConsoleOpen = true),
                        onDevTools: _controller.openDevTools,
                        onMore: _showPlayerMoreMenu,
                        onFullscreen: _toggleFullscreen,
                        isFullscreen: _isFullscreen,
                      ),
                    )
                  else
                    _ChromeInputRegion(
                      diagnostics: widget.dependencies.diagnostics,
                      child: _PlayerTitleBar(
                        title: widget.entry.title,
                        onBackToLibrary: () => unawaited(_leavePlayer()),
                        onMore: _showPlayerMoreMenu,
                        onFullscreen: _toggleFullscreen,
                        isFullscreen: _isFullscreen,
                      ),
                    ),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final consoleWidth =
                            _isConsoleOpen && _isConsoleSideBySide
                            ? consolePanelWidthFor(constraints.maxWidth)
                            : 0.0;
                        return Row(
                          children: [
                            Expanded(
                              child: PlayerContentSurface(
                                child: _buildWebView(),
                              ),
                            ),
                            if (consoleWidth > 0)
                              SizedBox(width: consoleWidth, child: console),
                          ],
                        );
                      },
                    ),
                  ),
                  if (widget.dependencies.profileController.isComfortable)
                    _ChromeInputRegion(
                      diagnostics: widget.dependencies.diagnostics,
                      child: ComfortableCommandBar(
                        collapsed: _isCommandBarCollapsed,
                        onToggleCollapse: () => setState(
                          () =>
                              _isCommandBarCollapsed = !_isCommandBarCollapsed,
                        ),
                        onBackToLibrary: () => unawaited(_leavePlayer()),
                        onUndo: _undo,
                        onSave: _captureAndSave,
                        onLoad: _openLoadManager,
                        onConsole: () => setState(() => _isConsoleOpen = true),
                        onMore: _showPlayerMoreMenu,
                        commandBarPreferences: widget
                            .dependencies
                            .commandBarController
                            .preferences,
                        onPageUp: () => unawaited(_scrollStoryPage(-1)),
                        onPageDown: () => unawaited(_scrollStoryPage(1)),
                      ),
                    ),
                ],
              ),
            ),
            bottomSheet: _isConsoleOpen && !_isConsoleSideBySide
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(50, 0, 50, 8),
                    child: SizedBox(
                      height: (MediaQuery.sizeOf(context).height * 0.42)
                          .clamp(280.0, 480.0)
                          .toDouble(),
                      child: console,
                    ),
                  )
                : null,
          ),
        ),
      ),
    );
  }

  Widget _buildWebView() {
    if (_webViewError != null) {
      return Center(
        child: _InlineError(
          message: _webViewError!,
          onDismiss: () => setState(() => _webViewError = null),
        ),
      );
    }
    if (!_isWebViewReady) {
      return const _LoadingState(label: 'Preparing story view...');
    }
    return Stack(
      children: [
        Focus(
          focusNode: _webViewFocusNode,
          child: Listener(
            onPointerDown: (event) {
              _webViewFocusNode.requestFocus();
              widget.dependencies.diagnostics.recordPointer(
                event,
                category: 'pointerdown',
                origin: 'webview',
              );
              unawaited(_controller.focus());
            },
            onPointerUp: (event) {
              widget.dependencies.diagnostics.recordPointer(
                event,
                category: 'pointerup',
                origin: 'webview',
              );
            },
            onPointerCancel: (event) {
              widget.dependencies.diagnostics.recordPointer(
                event,
                category: 'pointercancel',
                origin: 'webview',
              );
            },
            child: Webview(_controller),
          ),
        ),
        if (_isLoading)
          const Positioned(left: 0, right: 0, top: 0, child: FProgress()),
      ],
    );
  }
}

class SaveManagerDialog extends StatefulWidget {
  const SaveManagerDialog({
    super.key,
    required this.mode,
    required this.gamePath,
    required this.saveService,
    this.pendingSaveBytes,
  });

  final SaveManagerMode mode;
  final String gamePath;
  final SaveService saveService;
  final Uint8List? pendingSaveBytes;

  @override
  State<SaveManagerDialog> createState() => _SaveManagerDialogState();
}

class _SaveManagerDialogState extends State<SaveManagerDialog> {
  final _filenameController = TextEditingController();
  var _saves = <SaveEntry>[];
  var _page = 0;
  var _isBusy = true;
  String? _error;

  static const _pageSize = 8;

  @override
  void initState() {
    super.initState();
    _filenameController.text =
        'save_${DateTime.now().millisecondsSinceEpoch}.save';
    unawaited(_refresh());
  }

  @override
  void dispose() {
    _filenameController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _isBusy = true;
      _error = null;
    });
    try {
      final saves = await widget.saveService.listSaves(widget.gamePath);
      if (!mounted) return;
      setState(() {
        _saves = saves;
        _page = _page.clamp(0, _lastPage);
      });
    } catch (err) {
      if (mounted) setState(() => _error = err.toString());
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  int get _lastPage => (_saves.isEmpty ? 0 : (_saves.length - 1) ~/ _pageSize);

  List<SaveEntry> get _pageSaves =>
      _saves.skip(_page * _pageSize).take(_pageSize).toList();

  Future<void> _write(String filename) async {
    final bytes = widget.pendingSaveBytes;
    if (bytes == null) {
      Navigator.of(context).pop();
      return;
    }
    final message = getSaveFilenameError(filename);
    if (message != null) {
      setState(() => _error = message);
      return;
    }
    final normalized = normalizeSaveFilename(filename);
    SaveEntry? existing;
    for (final save in _saves) {
      if (save.filename == normalized) {
        existing = save;
        break;
      }
    }
    if (existing != null) {
      final accepted = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Overwrite save?'),
          content: Text(
            'A save named “$normalized” already exists. Replace it?',
          ),
          actions: <Widget>[
            AdaptiveLabelButton(
              label: 'Cancel',
              icon: Icons.close,
              onPressed: () => Navigator.of(context).pop(false),
            ),
            AdaptiveLabelButton(
              label: 'Overwrite',
              icon: Icons.save_outlined,
              filled: true,
              onPressed: () => Navigator.of(context).pop(true),
            ),
          ],
        ),
      );
      if (accepted != true) return;
    }
    setState(() => _isBusy = true);
    try {
      await widget.saveService.writeSave(widget.gamePath, normalized, bytes);
      if (!mounted) return;
      Navigator.of(context).pop(_SaveDialogResult(savedFilename: normalized));
    } catch (err) {
      if (mounted) setState(() => _error = err.toString());
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _delete(SaveEntry save) async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Save'),
        content: Text('Delete "${save.filename}"?'),
        actions: [
          FButton(
            variant: FButtonVariant.ghost,
            onPress: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FButton(
            variant: FButtonVariant.destructive,
            onPress: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (accepted != true) return;
    await widget.saveService.deleteSave(widget.gamePath, save.filename);
    await _refresh();
  }

  Future<void> _activateSave(SaveEntry save, bool isSaveMode) async {
    if (isSaveMode) {
      await _write(save.filename);
    } else {
      Navigator.of(context).pop(_SaveDialogResult(loadedSave: save));
    }
  }

  Future<void> _showSaveContextMenu(
    SaveEntry save,
    bool isSaveMode,
    TapDownDetails details,
  ) async {
    final position = details.globalPosition == Offset.zero
        ? MediaQuery.sizeOf(context).center(Offset.zero)
        : details.globalPosition;
    final selected = await showMenu<_SaveAction>(
      context: context,
      position: RelativeRect.fromLTRB(
        position.dx,
        position.dy,
        position.dx,
        position.dy,
      ),
      items: [
        PopupMenuItem(
          value: _SaveAction.activate,
          child: _ContextMenuLabel(
            icon: isSaveMode ? FLucideIcons.save : FLucideIcons.upload,
            label: isSaveMode ? 'Overwrite save' : 'Load save',
          ),
        ),
        const PopupMenuItem(
          value: _SaveAction.delete,
          child: _ContextMenuLabel(
            icon: FLucideIcons.trash,
            label: 'Delete save',
          ),
        ),
      ],
    );

    switch (selected) {
      case _SaveAction.activate:
        await _activateSave(save, isSaveMode);
      case _SaveAction.delete:
        await _delete(save);
      case null:
        break;
    }
  }

  Widget _buildSaveCard(BuildContext context, SaveEntry save, bool isSaveMode) {
    return ContextActionSurface(
      semanticLabel: save.filename,
      onActivate: () => _activateSave(save, isSaveMode),
      onMenu: () => _showSaveContextMenu(
        save,
        isSaveMode,
        TapDownDetails(globalPosition: Offset.zero),
      ),
      child: FCard.raw(
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              Icon(isSaveMode ? FLucideIcons.save : FLucideIcons.upload),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      save.filename.replaceFirst(
                        RegExp(r'\.save$', caseSensitive: false),
                        '',
                      ),
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${formatBytes(save.size)}  ${MaterialLocalizations.of(context).formatShortDate(save.modified)}',
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              AdaptiveIconButton(
                tooltip: 'Save actions',
                icon: Icons.more_vert,
                onPressed: () => _showSaveContextMenu(
                  save,
                  isSaveMode,
                  TapDownDetails(globalPosition: Offset.zero),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isSaveMode = widget.mode == SaveManagerMode.save;
    return AlertDialog(
      title: Row(
        children: [
          Icon(isSaveMode ? FLucideIcons.download : FLucideIcons.upload),
          const SizedBox(width: 8),
          Text(isSaveMode ? 'Save Game' : 'Load Game'),
        ],
      ),
      content: Builder(
        builder: (context) {
          final viewport = MediaQuery.sizeOf(context);
          final width = (viewport.width - 48).clamp(320.0, 900.0).toDouble();
          final height = (viewport.height * 0.68)
              .clamp(300.0, 620.0)
              .toDouble();
          return SizedBox(
            width: width,
            height: height,
            child: Column(
              children: [
                if (_error != null)
                  _InlineError(
                    message: _error!,
                    onDismiss: () => setState(() => _error = null),
                  ),
                if (isSaveMode) ...[
                  Row(
                    children: [
                      Expanded(
                        child: FTextField(
                          control: FTextFieldControl.managed(
                            controller: _filenameController,
                          ),
                          label: const Text('New save filename'),
                          onSubmit: _write,
                          size: FTextFieldSizeVariant.sm,
                        ),
                      ),
                      const SizedBox(width: 8),
                      AdaptiveLabelButton(
                        onPressed: _isBusy
                            ? null
                            : () => _write(_filenameController.text),
                        icon: FLucideIcons.filePlus,
                        label: 'Save New',
                        highFrequency: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
                Expanded(
                  child: _isBusy
                      ? const _LoadingState(label: 'Reading saves...')
                      : _saves.isEmpty
                      ? Center(
                          child: Text(
                            isSaveMode
                                ? 'No saves yet. Create the first one above.'
                                : 'No saves found.',
                          ),
                        )
                      : LayoutBuilder(
                          builder: (context, viewport) => GridView.builder(
                            key: const ValueKey<String>('save-manager-grid'),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: saveColumnCountForWidth(
                                    viewport.maxWidth,
                                  ),
                                  childAspectRatio:
                                      saveColumnCountForWidth(
                                            viewport.maxWidth,
                                          ) ==
                                          2
                                      ? 3.4
                                      : 5.5,
                                  mainAxisSpacing: 8,
                                  crossAxisSpacing: 8,
                                ),
                            itemCount: _pageSaves.length,
                            itemBuilder: (context, index) {
                              final save = _pageSaves[index];
                              return _buildSaveCard(context, save, isSaveMode);
                            },
                          ),
                        ),
                ),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final controls = Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AdaptiveIconButton(
                          tooltip: 'Previous page',
                          onPressed: _page == 0
                              ? null
                              : () => setState(() => _page--),
                          icon: FLucideIcons.chevronLeft,
                        ),
                        Text('Page ${_page + 1} / ${_lastPage + 1}'),
                        AdaptiveIconButton(
                          tooltip: 'Next page',
                          onPressed: _page >= _lastPage
                              ? null
                              : () => setState(() => _page++),
                          icon: FLucideIcons.chevronRight,
                        ),
                      ],
                    );
                    if (constraints.maxWidth < 460) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${_saves.length} saves total'),
                          controls,
                        ],
                      );
                    }
                    return Row(
                      children: [
                        Expanded(child: Text('${_saves.length} saves total')),
                        controls,
                      ],
                    );
                  },
                ),
              ],
            ),
          );
        },
      ),
      actions: [
        AdaptiveLabelButton(
          label: 'Close',
          icon: Icons.close,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

class _SaveDialogResult {
  const _SaveDialogResult({this.savedFilename, this.loadedSave});

  final String? savedFilename;
  final SaveEntry? loadedSave;
}

class CompactPlayerToolbar extends StatelessWidget {
  const CompactPlayerToolbar({
    super.key,
    required this.title,
    required this.onBackToLibrary,
    required this.onUndo,
    required this.onSave,
    required this.onLoad,
    required this.onConsole,
    required this.onDevTools,
    required this.onMore,
    required this.onFullscreen,
    required this.isFullscreen,
  });

  final String title;
  final VoidCallback onBackToLibrary;
  final VoidCallback onUndo;
  final VoidCallback onSave;
  final VoidCallback onLoad;
  final VoidCallback onConsole;
  final VoidCallback onDevTools;
  final VoidCallback onMore;
  final VoidCallback onFullscreen;
  final bool isFullscreen;

  @override
  Widget build(BuildContext context) {
    final colors = context.theme.colors;
    return FocusTraversalGroup(
      policy: WidgetOrderTraversalPolicy(),
      child: Semantics(
        container: true,
        explicitChildNodes: true,
        label: 'Compact player toolbar',
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.background,
            border: Border(bottom: BorderSide(color: colors.border)),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final showLabels = constraints.maxWidth >= 760;
                return Row(
                  children: [
                    AdaptiveIconButton(
                      tooltip: 'Back to Library',
                      icon: FLucideIcons.arrowLeft,
                      onPressed: onBackToLibrary,
                    ),
                    if (showLabels)
                      Text(
                        'Library',
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                    const SizedBox(width: 4),
                    AdaptiveIconButton(
                      tooltip: 'Undo / Back one turn',
                      icon: FLucideIcons.undo2,
                      onPressed: onUndo,
                      highFrequency: true,
                    ),
                    Expanded(
                      child: Text(
                        title,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (showLabels)
                      AdaptiveLabelButton(
                        onPressed: onSave,
                        icon: FLucideIcons.download,
                        label: 'Save',
                        filled: true,
                        highFrequency: true,
                      )
                    else
                      AdaptiveIconButton(
                        tooltip: 'Save',
                        icon: FLucideIcons.download,
                        onPressed: onSave,
                        highFrequency: true,
                      ),
                    if (showLabels)
                      AdaptiveLabelButton(
                        onPressed: onLoad,
                        icon: FLucideIcons.upload,
                        label: 'Load',
                        filled: true,
                        highFrequency: true,
                      )
                    else
                      AdaptiveIconButton(
                        tooltip: 'Load',
                        icon: FLucideIcons.upload,
                        onPressed: onLoad,
                        highFrequency: true,
                      ),
                    if (showLabels)
                      AdaptiveLabelButton(
                        onPressed: onConsole,
                        icon: FLucideIcons.squareTerminal,
                        label: 'Console',
                        filled: true,
                      ),
                    AdaptiveIconButton(
                      tooltip: isFullscreen
                          ? 'Exit fullscreen'
                          : 'Enter fullscreen',
                      icon: isFullscreen
                          ? Icons.fullscreen_exit
                          : Icons.fullscreen,
                      onPressed: onFullscreen,
                    ),
                    AdaptiveIconButton(
                      tooltip: 'More player actions',
                      icon: Icons.more_vert,
                      onPressed: onMore,
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _ToolbarIconButton extends StatelessWidget {
  const _ToolbarIconButton({
    required this.tooltip,
    required this.icon,
    required this.onPress,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPress;

  @override
  Widget build(BuildContext context) {
    return AdaptiveIconButton(tooltip: tooltip, icon: icon, onPressed: onPress);
  }
}

class _PlayerTitleBar extends StatelessWidget {
  const _PlayerTitleBar({
    required this.title,
    required this.onBackToLibrary,
    required this.onMore,
    required this.onFullscreen,
    required this.isFullscreen,
  });

  final String title;
  final VoidCallback onBackToLibrary;
  final VoidCallback onMore;
  final VoidCallback onFullscreen;
  final bool isFullscreen;

  @override
  Widget build(BuildContext context) {
    return FocusTraversalGroup(
      policy: WidgetOrderTraversalPolicy(),
      child: Semantics(
        container: true,
        explicitChildNodes: true,
        label: 'Player title bar',
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 5, 8, 2),
          child: Row(
            children: [
              AdaptiveIconButton(
                tooltip: 'Back to Library',
                icon: FLucideIcons.arrowLeft,
                onPressed: onBackToLibrary,
              ),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              AdaptiveIconButton(
                tooltip: isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
                icon: isFullscreen ? Icons.fullscreen_exit : Icons.fullscreen,
                onPressed: onFullscreen,
              ),
              AdaptiveIconButton(
                tooltip: 'More player actions',
                icon: Icons.more_vert,
                onPressed: onMore,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ComfortableCommandBar extends StatelessWidget {
  const ComfortableCommandBar({
    super.key,
    required this.collapsed,
    required this.onToggleCollapse,
    required this.onBackToLibrary,
    required this.onUndo,
    required this.onSave,
    required this.onLoad,
    required this.onConsole,
    required this.onMore,
    this.commandBarPreferences = CommandBarPreferences.defaults,
    this.onPageUp,
    this.onPageDown,
  });

  final bool collapsed;
  final VoidCallback onToggleCollapse;
  final VoidCallback onBackToLibrary;
  final VoidCallback onUndo;
  final VoidCallback onSave;
  final VoidCallback onLoad;
  final VoidCallback onConsole;
  final VoidCallback onMore;
  final CommandBarPreferences commandBarPreferences;
  final VoidCallback? onPageUp;
  final VoidCallback? onPageDown;

  double get _commandTargetSize => switch (commandBarPreferences.size) {
    CommandBarSize.small => 44,
    CommandBarSize.standard => 48,
    CommandBarSize.large => 56,
  };

  Widget _commandButton(String command, {double? traversalOrder}) {
    final button = switch (command) {
      'back' => AdaptiveIconButton(
        tooltip: 'Back to Library',
        icon: FLucideIcons.arrowLeft,
        onPressed: onBackToLibrary,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'undo' => AdaptiveIconButton(
        tooltip: 'Undo / Back one turn',
        icon: FLucideIcons.undo2,
        onPressed: onUndo,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'save' => AdaptiveIconButton(
        tooltip: 'Save game',
        icon: FLucideIcons.download,
        onPressed: onSave,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'load' => AdaptiveIconButton(
        tooltip: 'Load game',
        icon: FLucideIcons.upload,
        onPressed: onLoad,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'pageUp' => AdaptiveIconButton(
        tooltip: 'Page Up',
        icon: Icons.keyboard_arrow_up,
        onPressed: onPageUp,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'pageDown' => AdaptiveIconButton(
        tooltip: 'Page Down',
        icon: Icons.keyboard_arrow_down,
        onPressed: onPageDown,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'console' => AdaptiveIconButton(
        tooltip: 'Console',
        icon: FLucideIcons.squareTerminal,
        onPressed: onConsole,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      'more' => AdaptiveIconButton(
        tooltip: 'More player actions',
        icon: Icons.more_vert,
        onPressed: onMore,
        highFrequency: true,
        minimumSize: _commandTargetSize,
      ),
      _ => const SizedBox.shrink(),
    };
    if (traversalOrder == null) return button;
    return FocusTraversalOrder(
      order: NumericFocusOrder(traversalOrder),
      child: button,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.theme.colors;
    final preferences = commandBarPreferences.normalized;
    final commandIds = preferences.order.where((command) {
      if (command == 'pageUp') return preferences.pageUpEnabled;
      if (command == 'pageDown') return preferences.pageDownEnabled;
      return true;
    }).toList();
    final middleCommandIds = commandIds
        .where((command) => command != 'console' && command != 'more')
        .toList();
    final middleAlignment = switch (preferences.reach) {
      CommandBarReach.left => Alignment.centerLeft,
      CommandBarReach.right => Alignment.centerRight,
      CommandBarReach.balanced => switch (preferences.alignment) {
        CommandBarAlignment.start => Alignment.centerLeft,
        CommandBarAlignment.center => Alignment.center,
        CommandBarAlignment.end => Alignment.centerRight,
      },
    };
    final verticalPadding = preferences.size == CommandBarSize.small
        ? 4.0
        : preferences.size == CommandBarSize.large
        ? 10.0
        : 8.0;
    return FocusTraversalGroup(
      policy: WidgetOrderTraversalPolicy(),
      child: Semantics(
        container: true,
        explicitChildNodes: true,
        label: 'Player command bar',
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.background,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(10, 6, 10, verticalPadding),
            child: collapsed
                ? Row(
                    children: [
                      AdaptiveIconButton(
                        tooltip: 'Expand command bar',
                        icon: Icons.keyboard_arrow_up,
                        onPressed: onToggleCollapse,
                        highFrequency: true,
                        minimumSize: _commandTargetSize,
                      ),
                      const Expanded(
                        child: Text(
                          'Commands collapsed',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  )
                : Row(
                    children: [
                      AdaptiveIconButton(
                        tooltip: 'Collapse command bar',
                        icon: Icons.keyboard_arrow_down,
                        onPressed: onToggleCollapse,
                        highFrequency: true,
                        minimumSize: _commandTargetSize,
                      ),
                      Expanded(
                        child: FocusTraversalGroup(
                          policy: OrderedTraversalPolicy(),
                          child: Row(
                            children: [
                              Expanded(
                                child: LayoutBuilder(
                                  builder: (context, constraints) =>
                                      SingleChildScrollView(
                                        scrollDirection: Axis.horizontal,
                                        child: ConstrainedBox(
                                          constraints: BoxConstraints(
                                            minWidth: constraints.maxWidth,
                                          ),
                                          child: Align(
                                            alignment: middleAlignment,
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                for (
                                                  var index = 0;
                                                  index <
                                                      middleCommandIds.length;
                                                  index++
                                                )
                                                  _commandButton(
                                                    middleCommandIds[index],
                                                    traversalOrder: index
                                                        .toDouble(),
                                                  ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                ),
                              ),
                              _commandButton(
                                'console',
                                traversalOrder: middleCommandIds.length
                                    .toDouble(),
                              ),
                              _commandButton(
                                'more',
                                traversalOrder: middleCommandIds.length + 1,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class ConsolePanel extends StatefulWidget {
  const ConsolePanel({
    super.key,
    required this.comfortable,
    required this.inputController,
    required this.logs,
    required this.savedCommands,
    required this.suggestions,
    required this.onChanged,
    required this.onRun,
    required this.onSave,
    required this.onSaveCommand,
    required this.onClose,
    required this.onToggleLayout,
    required this.isSideBySide,
    required this.onUseSaved,
    required this.onDeleteSaved,
    this.initialSavedCommandsExpanded = false,
  });

  final bool comfortable;
  final TextEditingController inputController;
  final List<ConsoleLog> logs;
  final List<String> savedCommands;
  final List<String> suggestions;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onRun;
  final VoidCallback onSave;
  final ValueChanged<String> onSaveCommand;
  final VoidCallback onClose;
  final VoidCallback onToggleLayout;
  final bool isSideBySide;
  final ValueChanged<String> onUseSaved;
  final ValueChanged<int> onDeleteSaved;
  final bool initialSavedCommandsExpanded;

  @override
  State<ConsolePanel> createState() => _ConsolePanelState();
}

class _ConsolePanelState extends State<ConsolePanel> {
  late var _savedExpanded = widget.initialSavedCommandsExpanded;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(14);
    final colors = context.theme.colors;
    return FocusTraversalGroup(
      policy: WidgetOrderTraversalPolicy(),
      child: Semantics(
        container: true,
        explicitChildNodes: true,
        label: 'Developer Console overlay',
        child: Material(
          elevation: 18,
          color: Colors.transparent,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colors.background,
              borderRadius: radius,
              border: Border.all(color: colors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x66000000),
                  blurRadius: 26,
                  offset: Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              children: [
                ListTile(
                  title: const Text('Developer Console'),
                  subtitle: const Text(
                    'Runs JavaScript inside the loaded game',
                  ),
                  trailing: Wrap(
                    spacing: 4,
                    children: [
                      _ToolbarIconButton(
                        tooltip: widget.isSideBySide
                            ? 'Use overlay layout'
                            : 'Use side-by-side layout',
                        onPress: widget.onToggleLayout,
                        icon: widget.isSideBySide
                            ? FLucideIcons.panelBottom
                            : FLucideIcons.panelRight,
                      ),
                      _ToolbarIconButton(
                        tooltip: 'Close console',
                        onPress: widget.onClose,
                        icon: FLucideIcons.x,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Expanded(
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                          itemCount: widget.logs.length,
                          itemBuilder: (context, index) {
                            final log = widget.logs[index];
                            return _ConsoleLogRow(
                              log: log,
                              comfortable: widget.comfortable,
                              onRun: log.command == null
                                  ? null
                                  : () => widget.onRun(log.command!),
                              onSave: log.command == null
                                  ? null
                                  : () => widget.onSaveCommand(log.command!),
                            );
                          },
                        ),
                      ),
                      _SavedCommandsBar(
                        comfortable: widget.comfortable,
                        commands: widget.savedCommands,
                        expanded: _savedExpanded,
                        onToggle: () =>
                            setState(() => _savedExpanded = !_savedExpanded),
                        onUse: widget.onUseSaved,
                        onRun: widget.onRun,
                        onDelete: widget.onDeleteSaved,
                      ),
                      if (widget.suggestions.isNotEmpty)
                        SizedBox(
                          height: 42,
                          child: _HorizontalWheelStrip(
                            scrollableKey: const ValueKey<String>(
                              'console-suggestions-scrollable',
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            itemCount: widget.suggestions.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 6),
                            itemBuilder: (context, index) => FButton(
                              size: widget.comfortable
                                  ? FButtonSizeVariant.md
                                  : FButtonSizeVariant.xs,
                              variant: FButtonVariant.secondary,
                              onPress: () {
                                widget.inputController.text =
                                    widget.suggestions[index];
                                widget.inputController.selection =
                                    TextSelection.collapsed(
                                      offset: widget.suggestions[index].length,
                                    );
                              },
                              child: Text(widget.suggestions[index]),
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final field = FTextField(
                              control: FTextFieldControl.managed(
                                controller: widget.inputController,
                                onChange: (value) =>
                                    widget.onChanged(value.text),
                              ),
                              hint: 'Enter JavaScript...',
                              onSubmit: widget.onRun,
                              size: FTextFieldSizeVariant.sm,
                            );
                            final actions = Wrap(
                              spacing: 8,
                              children: [
                                AdaptiveIconButton(
                                  tooltip: 'Save command',
                                  onPressed: widget.onSave,
                                  highFrequency: widget.comfortable,
                                  icon: FLucideIcons.check,
                                ),
                                AdaptiveLabelButton(
                                  label: 'Run',
                                  icon: FLucideIcons.play,
                                  onPressed: () =>
                                      widget.onRun(widget.inputController.text),
                                  highFrequency: widget.comfortable,
                                  filled: true,
                                ),
                              ],
                            );
                            if (constraints.maxWidth < 520) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  field,
                                  const SizedBox(height: 8),
                                  actions,
                                ],
                              );
                            }
                            return Row(
                              children: [
                                Expanded(child: field),
                                const SizedBox(width: 8),
                                actions,
                              ],
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ConsoleLogRow extends StatefulWidget {
  const _ConsoleLogRow({
    required this.log,
    required this.comfortable,
    required this.onRun,
    required this.onSave,
  });

  final ConsoleLog log;
  final bool comfortable;
  final VoidCallback? onRun;
  final VoidCallback? onSave;

  @override
  State<_ConsoleLogRow> createState() => _ConsoleLogRowState();
}

class _ConsoleLogRowState extends State<_ConsoleLogRow> {
  var _hovering = false;

  Future<void> _showActions() async {
    final selected = await showMenu<_ConsoleLogAction>(
      context: context,
      position: RelativeRect.fromLTRB(
        MediaQuery.sizeOf(context).width / 2,
        MediaQuery.sizeOf(context).height / 2,
        MediaQuery.sizeOf(context).width / 2,
        MediaQuery.sizeOf(context).height / 2,
      ),
      items: [
        if (widget.onRun != null)
          const PopupMenuItem(
            value: _ConsoleLogAction.runAgain,
            child: _ContextMenuLabel(
              icon: FLucideIcons.play,
              label: 'Run again',
            ),
          ),
        if (widget.onSave != null)
          const PopupMenuItem(
            value: _ConsoleLogAction.saveCommand,
            child: _ContextMenuLabel(
              icon: FLucideIcons.check,
              label: 'Save command',
            ),
          ),
      ],
    );
    switch (selected) {
      case _ConsoleLogAction.runAgain:
        widget.onRun?.call();
      case _ConsoleLogAction.saveCommand:
        widget.onSave?.call();
      case null:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCommand = widget.log.command != null;
    final content = MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: _hovering && isCommand
              ? const Color(0xff202a36)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SelectableText(
                  widget.log.message,
                  style: TextStyle(
                    color: switch (widget.log.type) {
                      'error' => const Color(0xffff8a8a),
                      'result' => const Color(0xff8ee6a1),
                      'input' => const Color(0xff8fd3ff),
                      _ => const Color(0xffd6deeb),
                    },
                    fontFamily: 'Consolas',
                    fontSize: 13,
                  ),
                ),
              ),
              if (isCommand &&
                  (!widget.comfortable &&
                      (_hovering || widget.log.type == 'input'))) ...[
                _ToolbarIconButton(
                  tooltip: 'Run again',
                  onPress: widget.onRun,
                  icon: FLucideIcons.play,
                ),
                _ToolbarIconButton(
                  tooltip: 'Save command',
                  onPress: widget.onSave,
                  icon: FLucideIcons.check,
                ),
              ],
              if (isCommand)
                AdaptiveIconButton(
                  tooltip: 'Console row actions',
                  icon: Icons.more_vert,
                  highFrequency: widget.comfortable,
                  onPressed: () => unawaited(_showActions()),
                ),
            ],
          ),
        ),
      ),
    );
    if (!isCommand) return content;
    return ContextActionSurface(
      semanticLabel: 'Console command actions',
      onMenu: () => unawaited(_showActions()),
      child: content,
    );
  }
}

class _HorizontalWheelStrip extends StatefulWidget {
  const _HorizontalWheelStrip({
    required this.scrollableKey,
    required this.padding,
    required this.itemCount,
    required this.itemBuilder,
    required this.separatorBuilder,
  });

  final Key scrollableKey;
  final EdgeInsetsGeometry padding;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final IndexedWidgetBuilder separatorBuilder;

  @override
  State<_HorizontalWheelStrip> createState() => _HorizontalWheelStripState();
}

class _HorizontalWheelStripState extends State<_HorizontalWheelStrip> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _handlePointerSignal(PointerSignalEvent event) {
    if (event is! PointerScrollEvent || !_scrollController.hasClients) return;
    final delta = event.scrollDelta.dx.abs() >= event.scrollDelta.dy.abs()
        ? event.scrollDelta.dx
        : event.scrollDelta.dy;
    if (delta == 0) return;
    final position = _scrollController.position;
    final target = (position.pixels + delta)
        .clamp(0.0, position.maxScrollExtent)
        .toDouble();
    if (target != position.pixels) _scrollController.jumpTo(target);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerSignal: _handlePointerSignal,
      child: Scrollbar(
        controller: _scrollController,
        thumbVisibility: true,
        child: ListView.separated(
          key: widget.scrollableKey,
          controller: _scrollController,
          padding: widget.padding,
          scrollDirection: Axis.horizontal,
          physics: const ClampingScrollPhysics(),
          itemCount: widget.itemCount,
          separatorBuilder: widget.separatorBuilder,
          itemBuilder: widget.itemBuilder,
        ),
      ),
    );
  }
}

class _SavedCommandsBar extends StatelessWidget {
  const _SavedCommandsBar({
    required this.comfortable,
    required this.commands,
    required this.expanded,
    required this.onToggle,
    required this.onUse,
    required this.onRun,
    required this.onDelete,
  });

  final bool comfortable;
  final List<String> commands;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<String> onUse;
  final ValueChanged<String> onRun;
  final ValueChanged<int> onDelete;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: context.theme.colors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ContextActionSurface(
            semanticLabel: expanded
                ? 'Collapse saved commands'
                : 'Expand saved commands',
            onActivate: onToggle,
            onMenu: onToggle,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: adaptiveTargetSize(comfortable: comfortable),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    Icon(
                      expanded
                          ? FLucideIcons.chevronDown
                          : FLucideIcons.chevronRight,
                      size: 18,
                    ),
                    const SizedBox(width: 6),
                    const Expanded(
                      child: Text(
                        'Saved Commands',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Text(
                      '${commands.length}',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: SizedBox(
              height: commands.isEmpty ? 46 : 96,
              child: commands.isEmpty
                  ? const Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: EdgeInsets.symmetric(horizontal: 18),
                        child: Text('No saved commands yet.'),
                      ),
                    )
                  : _HorizontalWheelStrip(
                      scrollableKey: const ValueKey<String>(
                        'console-saved-commands-scrollable',
                      ),
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                      itemCount: commands.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final command = commands[index];
                        return _SavedCommandChip(
                          command: command,
                          onUse: () => onUse(command),
                          onRun: () => onRun(command),
                          onDelete: () => onDelete(index),
                          onMenu: () => _showSavedCommandMenu(
                            context,
                            command,
                            () => onRun(command),
                            () => onDelete(index),
                          ),
                        );
                      },
                    ),
            ),
            crossFadeState: expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 160),
          ),
        ],
      ),
    );
  }

  Future<void> _showSavedCommandMenu(
    BuildContext context,
    String command,
    VoidCallback onRun,
    VoidCallback onDelete,
  ) async {
    final action = await showMenu<_ConsoleLogAction>(
      context: context,
      position: RelativeRect.fromLTRB(
        MediaQuery.sizeOf(context).width / 2,
        MediaQuery.sizeOf(context).height / 2,
        MediaQuery.sizeOf(context).width / 2,
        MediaQuery.sizeOf(context).height / 2,
      ),
      items: const [
        PopupMenuItem(
          value: _ConsoleLogAction.runAgain,
          child: _ContextMenuLabel(
            icon: FLucideIcons.play,
            label: 'Run saved command',
          ),
        ),
        PopupMenuItem(
          value: _ConsoleLogAction.saveCommand,
          child: _ContextMenuLabel(
            icon: FLucideIcons.trash,
            label: 'Delete saved command',
          ),
        ),
      ],
    );
    switch (action) {
      case _ConsoleLogAction.runAgain:
        onRun();
      case _ConsoleLogAction.saveCommand:
        onDelete();
      case null:
        break;
    }
  }
}

class _SavedCommandChip extends StatelessWidget {
  const _SavedCommandChip({
    required this.command,
    required this.onUse,
    required this.onRun,
    required this.onDelete,
    required this.onMenu,
  });

  final String command;
  final VoidCallback onUse;
  final VoidCallback onRun;
  final VoidCallback onDelete;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context) {
    return ContextActionSurface(
      semanticLabel: 'Saved command $command',
      onActivate: onUse,
      onMenu: onMenu,
      child: FCard.raw(
        clipBehavior: Clip.antiAlias,
        child: SizedBox(
          width: 260,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    command,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Consolas',
                      fontSize: 12,
                    ),
                  ),
                ),
                AdaptiveIconButton(
                  tooltip: 'Run saved command',
                  onPressed: onRun,
                  highFrequency: true,
                  icon: FLucideIcons.play,
                ),
                AdaptiveIconButton(
                  tooltip: 'Delete saved command',
                  onPressed: onDelete,
                  highFrequency: true,
                  icon: FLucideIcons.x,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LibraryRail extends StatelessWidget {
  const _LibraryRail({
    required this.total,
    required this.missing,
    required this.onLoadGame,
    required this.onSettings,
  });

  final int total;
  final int missing;
  final VoidCallback onLoadGame;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final colors = context.theme.colors;

    return Container(
      width: 248,
      color: colors.background,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: colors.primary,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    FLucideIcons.bookOpen,
                    color: colors.primaryForeground,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Twine Player',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            AdaptiveLabelButton(
              onPressed: onLoadGame,
              icon: FLucideIcons.filePlus,
              label: 'Load Game',
              highFrequency: true,
            ),
            const SizedBox(height: 18),
            _SummaryTile(
              label: 'Library',
              value: '$total ${total == 1 ? 'game' : 'games'}',
            ),
            const SizedBox(height: 8),
            _SummaryTile(
              label: 'Unavailable',
              value: '$missing ${missing == 1 ? 'file' : 'files'}',
            ),
            const SizedBox(height: 8),
            const _SummaryTile(label: 'Platform', value: 'Flutter Windows'),
            const Spacer(),
            Text(
              'Use each game’s menu for play, file actions, and removal.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            AdaptiveLabelButton(
              onPressed: onSettings,
              icon: Icons.settings_outlined,
              label: 'Settings',
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return FCard.raw(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 2),
            Text(value, style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}

class _ContextMenuLabel extends StatelessWidget {
  const _ContextMenuLabel({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [Icon(icon, size: 18), const SizedBox(width: 10), Text(label)],
    );
  }
}

class _ChromeInputRegion extends StatelessWidget {
  const _ChromeInputRegion({required this.diagnostics, required this.child});

  final InputDiagnosticsRecorder diagnostics;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (event) => diagnostics.recordPointer(
        event,
        category: 'pointerdown',
        origin: 'chrome',
      ),
      onPointerUp: (event) => diagnostics.recordPointer(
        event,
        category: 'pointerup',
        origin: 'chrome',
      ),
      onPointerCancel: (event) => diagnostics.recordPointer(
        event,
        category: 'pointercancel',
        origin: 'chrome',
      ),
      child: child,
    );
  }
}

class _SettingsDialog extends StatelessWidget {
  const _SettingsDialog({
    required this.profileController,
    required this.diagnostics,
    this.commandBarController,
    this.onLaunchInputLab,
    this.storyAssistance,
    this.storyAssistanceStatus,
    this.onZoomOut,
    this.onZoomIn,
    this.onResetZoom,
    this.onEnhancedChoices,
    this.onReadabilityChanged,
    this.onResetReadability,
  });

  final InteractionProfileController profileController;
  final InputDiagnosticsRecorder diagnostics;
  final CommandBarPreferencesController? commandBarController;
  final VoidCallback? onLaunchInputLab;
  final StoryAssistancePreferences? storyAssistance;
  final String? storyAssistanceStatus;
  final VoidCallback? onZoomOut;
  final VoidCallback? onZoomIn;
  final VoidCallback? onResetZoom;
  final ValueChanged<bool>? onEnhancedChoices;
  final ValueChanged<StoryAssistancePreferences>? onReadabilityChanged;
  final VoidCallback? onResetReadability;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Settings'),
      content: Builder(
        builder: (context) {
          final viewport = MediaQuery.sizeOf(context);
          final dialogWidth = (viewport.width - 48)
              .clamp(280.0, 560.0)
              .toDouble();
          final dialogHeight = (viewport.height - 180)
              .clamp(240.0, 560.0)
              .toDouble();
          return ListenableBuilder(
            listenable: Listenable.merge(<Listenable>[
              profileController,
              diagnostics,
              ?commandBarController,
            ]),
            builder: (context, _) => SizedBox(
              width: dialogWidth,
              height: dialogHeight,
              child: FocusTraversalGroup(
                policy: WidgetOrderTraversalPolicy(),
                child: Semantics(
                  container: true,
                  explicitChildNodes: true,
                  label: 'Settings dialog',
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        const Text(
                          'Interaction profile',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 6),
                        for (final profile in InteractionProfile.values)
                          // ignore: deprecated_member_use
                          RadioListTile<InteractionProfile>(
                            value: profile,
                            // ignore: deprecated_member_use
                            groupValue: profileController.selected,
                            // ignore: deprecated_member_use
                            onChanged: (value) {
                              if (value != null) {
                                unawaited(profileController.setSelected(value));
                              }
                            },
                            title: Text(profile.label),
                            subtitle: Text(profile.description),
                            contentPadding: EdgeInsets.zero,
                          ),
                        if (onLaunchInputLab != null) ...[
                          const Divider(),
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.science_outlined),
                            title: const Text('Input Lab'),
                            subtitle: const Text(
                              'Launch the bundled offline fixture for deliberate hardware checks.',
                            ),
                            onTap: onLaunchInputLab,
                          ),
                        ],
                        if (storyAssistance != null) ...[
                          const Divider(),
                          _StoryAssistanceSettingsSection(
                            preferences: storyAssistance!,
                            engineStatus: storyAssistanceStatus,
                            onZoomOut: onZoomOut,
                            onZoomIn: onZoomIn,
                            onResetZoom: onResetZoom,
                            onEnhancedChoices: onEnhancedChoices,
                            onReadabilityChanged: onReadabilityChanged,
                            onResetReadability: onResetReadability,
                          ),
                        ],
                        if (commandBarController != null) ...[
                          const Divider(),
                          _CommandBarSettingsSection(
                            controller: commandBarController!,
                          ),
                        ],
                        const Divider(),
                        SwitchListTile(
                          value: diagnostics.enabled,
                          onChanged: diagnostics.setEnabled,
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Input diagnostics'),
                          subtitle: const Text(
                            'Keep sanitized input metadata in memory for this session only.',
                          ),
                        ),
                        _ScenarioLabelField(diagnostics: diagnostics),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Wrap(
                            spacing: 8,
                            children: <Widget>[
                              AdaptiveLabelButton(
                                label: 'View report',
                                icon: Icons.article_outlined,
                                onPressed: () => showDialog<void>(
                                  context: context,
                                  builder: (_) => _DiagnosticsDialog(
                                    diagnostics: diagnostics,
                                  ),
                                ),
                              ),
                              AdaptiveLabelButton(
                                label: 'Close',
                                icon: Icons.close,
                                onPressed: () => Navigator.of(context).pop(),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CommandBarSettingsSection extends StatelessWidget {
  const _CommandBarSettingsSection({required this.controller});

  final CommandBarPreferencesController controller;

  Future<void> _setPageCommand(
    CommandBarPreferences preferences,
    String command,
    bool enabled,
  ) async {
    final order = [...preferences.order];
    if (enabled && !order.contains(command)) {
      final moreIndex = order.indexOf('console');
      order.insert(moreIndex < 0 ? order.length : moreIndex, command);
    } else if (!enabled) {
      order.remove(command);
    }
    await controller.update(
      preferences.copyWith(
        order: order,
        pageUpEnabled: command == 'pageUp'
            ? enabled
            : preferences.pageUpEnabled,
        pageDownEnabled: command == 'pageDown'
            ? enabled
            : preferences.pageDownEnabled,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final preferences = controller.preferences;
        final order = preferences.order
            .where(
              (command) => command != 'pageUp' || preferences.pageUpEnabled,
            )
            .where(
              (command) => command != 'pageDown' || preferences.pageDownEnabled,
            )
            .toList();
        final movableOrder = order
            .where((command) => command != 'console' && command != 'more')
            .toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Command bar',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                AdaptiveLabelButton(
                  label: 'Reset',
                  icon: Icons.restart_alt,
                  onPressed: () => unawaited(controller.reset()),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Preferences apply across games. Console stays immediately before More, and More stays rightmost.',
            ),
            const SizedBox(height: 8),
            _CommandBarChoiceRow<CommandBarAlignment>(
              label: 'Alignment',
              value: preferences.alignment,
              values: CommandBarAlignment.values,
              labelOf: (value) => value.label,
              onChanged: (value) => unawaited(
                controller.update(preferences.copyWith(alignment: value)),
              ),
            ),
            _CommandBarChoiceRow<CommandBarSize>(
              label: 'Button size',
              value: preferences.size,
              values: CommandBarSize.values,
              labelOf: (value) => value.label,
              onChanged: (value) => unawaited(
                controller.update(preferences.copyWith(size: value)),
              ),
            ),
            _CommandBarChoiceRow<CommandBarReach>(
              label: 'Reach mode',
              value: preferences.reach,
              values: CommandBarReach.values,
              labelOf: (value) => value.label,
              onChanged: (value) => unawaited(
                controller.update(preferences.copyWith(reach: value)),
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: preferences.pageUpEnabled,
              title: const Text('Show Page Up'),
              subtitle: const Text(
                'Scroll the story surface without edge gestures.',
              ),
              onChanged: (value) =>
                  unawaited(_setPageCommand(preferences, 'pageUp', value)),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: preferences.pageDownEnabled,
              title: const Text('Show Page Down'),
              subtitle: const Text(
                'Scroll the story surface without global shortcuts.',
              ),
              onChanged: (value) =>
                  unawaited(_setPageCommand(preferences, 'pageDown', value)),
            ),
            const Text('Pinned: Console → More (fixed at the far right)'),
            if (movableOrder.isNotEmpty) ...[
              const SizedBox(height: 4),
              const Text('Movable command order'),
              const SizedBox(height: 4),
              SizedBox(
                height: (movableOrder.length * 48.0).clamp(48.0, 240.0),
                child: ReorderableListView.builder(
                  buildDefaultDragHandles: true,
                  itemCount: movableOrder.length,
                  onReorderItem: (oldIndex, newIndex) {
                    final next = [...movableOrder];
                    final item = next.removeAt(oldIndex);
                    next.insert(newIndex, item);
                    next
                      ..add('console')
                      ..add('more');
                    unawaited(
                      controller.update(preferences.copyWith(order: next)),
                    );
                  },
                  itemBuilder: (context, index) {
                    final command = movableOrder[index];
                    return ListTile(
                      key: ValueKey(command),
                      dense: true,
                      title: Text(_commandBarLabel(command)),
                    );
                  },
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _CommandBarChoiceRow<T> extends StatelessWidget {
  const _CommandBarChoiceRow({
    required this.label,
    required this.value,
    required this.values,
    required this.labelOf,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<T> values;
  final String Function(T value) labelOf;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label)),
        DropdownButton<T>(
          value: value,
          items: [
            for (final option in values)
              DropdownMenuItem<T>(value: option, child: Text(labelOf(option))),
          ],
          onChanged: (next) {
            if (next != null) onChanged(next);
          },
        ),
      ],
    );
  }
}

String _commandBarLabel(String command) => switch (command) {
  'back' => 'Back to Library',
  'undo' => 'Undo / Back one turn',
  'save' => 'Save game',
  'load' => 'Load game',
  'pageUp' => 'Page Up',
  'pageDown' => 'Page Down',
  'console' => 'Console',
  'more' => 'More',
  _ => command,
};

class _ScenarioLabelField extends StatefulWidget {
  const _ScenarioLabelField({required this.diagnostics});

  final InputDiagnosticsRecorder diagnostics;

  @override
  State<_ScenarioLabelField> createState() => _ScenarioLabelFieldState();
}

class _ScenarioLabelFieldState extends State<_ScenarioLabelField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.diagnostics.scenarioLabel,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      maxLength: InputDiagnosticsRecorder.maxScenarioLabelLength,
      decoration: const InputDecoration(
        labelText: 'Scenario label (optional)',
        helperText:
            'Non-sensitive hardware mode only; session-only and sanitized.',
      ),
      onChanged: widget.diagnostics.setScenarioLabel,
    );
  }
}

class _StoryAssistanceSettingsSection extends StatefulWidget {
  const _StoryAssistanceSettingsSection({
    required this.preferences,
    this.engineStatus,
    required this.onZoomOut,
    required this.onZoomIn,
    required this.onResetZoom,
    required this.onEnhancedChoices,
    required this.onReadabilityChanged,
    required this.onResetReadability,
  });

  final StoryAssistancePreferences preferences;
  final String? engineStatus;
  final VoidCallback? onZoomOut;
  final VoidCallback? onZoomIn;
  final VoidCallback? onResetZoom;
  final ValueChanged<bool>? onEnhancedChoices;
  final ValueChanged<StoryAssistancePreferences>? onReadabilityChanged;
  final VoidCallback? onResetReadability;

  @override
  State<_StoryAssistanceSettingsSection> createState() =>
      _StoryAssistanceSettingsSectionState();
}

class _StoryAssistanceSettingsSectionState
    extends State<_StoryAssistanceSettingsSection> {
  late double _zoomFactor = widget.preferences.zoomFactor;
  late bool _enhancedChoices = widget.preferences.enhancedChoices;
  late bool _readabilityEnabled = widget.preferences.readabilityEnabled;
  late double _textScale = widget.preferences.textScale;
  late double _lineHeight = widget.preferences.lineHeight;
  late double _paragraphSpacing = widget.preferences.paragraphSpacing;
  late bool _readableLineLengthEnabled =
      widget.preferences.readableLineLengthEnabled;
  late double _readableLineLength = widget.preferences.readableLineLength;
  late double _targetSpacing = widget.preferences.targetSpacing;

  @override
  void didUpdateWidget(covariant _StoryAssistanceSettingsSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    _zoomFactor = widget.preferences.zoomFactor;
    _enhancedChoices = widget.preferences.enhancedChoices;
    _readabilityEnabled = widget.preferences.readabilityEnabled;
    _textScale = widget.preferences.textScale;
    _lineHeight = widget.preferences.lineHeight;
    _paragraphSpacing = widget.preferences.paragraphSpacing;
    _readableLineLengthEnabled = widget.preferences.readableLineLengthEnabled;
    _readableLineLength = widget.preferences.readableLineLength;
    _targetSpacing = widget.preferences.targetSpacing;
  }

  StoryAssistancePreferences get _currentPreferences =>
      widget.preferences.copyWith(
        readabilityEnabled: _readabilityEnabled,
        textScale: _textScale,
        lineHeight: _lineHeight,
        paragraphSpacing: _paragraphSpacing,
        readableLineLengthEnabled: _readableLineLengthEnabled,
        readableLineLength: _readableLineLength,
        targetSpacing: _targetSpacing,
      );

  void _notifyReadabilityChanged() {
    widget.onReadabilityChanged?.call(_currentPreferences);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Story assistance',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        const Text(
          'Zoom is remembered per game. Enhanced choices is optional and never changes colors, fonts, or story layout widths.',
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(
                'Story zoom: ${(_zoomFactor * 100).round()}%',
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            AdaptiveIconButton(
              tooltip: 'Zoom out story',
              icon: Icons.zoom_out,
              onPressed: widget.onZoomOut == null
                  ? null
                  : () {
                      setState(
                        () => _zoomFactor = stepStoryZoom(_zoomFactor, -1),
                      );
                      widget.onZoomOut!();
                    },
            ),
            AdaptiveIconButton(
              tooltip: 'Zoom in story',
              icon: Icons.zoom_in,
              onPressed: widget.onZoomIn == null
                  ? null
                  : () {
                      setState(
                        () => _zoomFactor = stepStoryZoom(_zoomFactor, 1),
                      );
                      widget.onZoomIn!();
                    },
            ),
            AdaptiveIconButton(
              tooltip: 'Reset story zoom',
              icon: Icons.restart_alt,
              onPressed: widget.onResetZoom == null
                  ? null
                  : () {
                      setState(() => _zoomFactor = 1);
                      widget.onResetZoom!();
                    },
            ),
          ],
        ),
        SwitchListTile(
          value: _enhancedChoices,
          onChanged: widget.onEnhancedChoices == null
              ? null
              : (value) {
                  setState(() => _enhancedChoices = value);
                  widget.onEnhancedChoices!(value);
                },
          contentPadding: EdgeInsets.zero,
          title: const Text('Enhanced choices (optional)'),
          subtitle: const Text(
            'Only this game is affected; turn it off any time to restore the original presentation.',
          ),
        ),
        SwitchListTile(
          value: _readabilityEnabled,
          onChanged: widget.onReadabilityChanged == null
              ? null
              : (value) {
                  setState(() => _readabilityEnabled = value);
                  _notifyReadabilityChanged();
                },
          contentPadding: EdgeInsets.zero,
          title: const Text('Readability assistance (optional)'),
          subtitle: Text(
            '${widget.engineStatus ?? 'Engine status: unknown until the story loads.'} Off is the default and leaves story markup untouched.',
          ),
        ),
        if (_readabilityEnabled) ...[
          _ReadabilitySlider(
            label: 'Text scale',
            value: _textScale,
            min: readabilityTextScaleMinimum,
            max: readabilityTextScaleMaximum,
            divisions: 8,
            display: '${(_textScale * 100).round()}%',
            onChanged: (value) {
              setState(() => _textScale = clampReadabilityTextScale(value));
            },
            onChangeEnd: (_) => _notifyReadabilityChanged(),
          ),
          _ReadabilitySlider(
            label: 'Line height',
            value: _lineHeight,
            min: readabilityLineHeightMinimum,
            max: readabilityLineHeightMaximum,
            divisions: 9,
            display: _lineHeight.toStringAsFixed(1),
            onChanged: (value) {
              setState(() => _lineHeight = clampReadabilityLineHeight(value));
            },
            onChangeEnd: (_) => _notifyReadabilityChanged(),
          ),
          _ReadabilitySlider(
            label: 'Paragraph spacing',
            value: _paragraphSpacing,
            min: readabilityParagraphSpacingMinimum,
            max: readabilityParagraphSpacingMaximum,
            divisions: 15,
            display: '${_paragraphSpacing.toStringAsFixed(1)}em',
            onChanged: (value) {
              setState(
                () =>
                    _paragraphSpacing = clampReadabilityParagraphSpacing(value),
              );
            },
            onChangeEnd: (_) => _notifyReadabilityChanged(),
          ),
          SwitchListTile(
            value: _readableLineLengthEnabled,
            onChanged: (value) {
              setState(() => _readableLineLengthEnabled = value);
              _notifyReadabilityChanged();
            },
            contentPadding: EdgeInsets.zero,
            title: const Text('Readable line length'),
            subtitle: const Text(
              'Opt-in max width for verified passage roots.',
            ),
          ),
          if (_readableLineLengthEnabled)
            _ReadabilitySlider(
              label: 'Maximum line length',
              value: _readableLineLength,
              min: readabilityLineLengthMinimum,
              max: readabilityLineLengthMaximum,
              divisions: 9,
              display: '${_readableLineLength.round()}ch',
              onChanged: (value) {
                setState(
                  () => _readableLineLength = clampReadabilityLineLength(value),
                );
              },
              onChangeEnd: (_) => _notifyReadabilityChanged(),
            ),
          _ReadabilitySlider(
            label: 'Target spacing',
            value: _targetSpacing,
            min: readabilityTargetSpacingMinimum,
            max: readabilityTargetSpacingMaximum,
            divisions: 10,
            display: '${_targetSpacing.toStringAsFixed(1)}x',
            onChanged: (value) {
              setState(
                () => _targetSpacing = clampReadabilityTargetSpacing(value),
              );
            },
            onChangeEnd: (_) => _notifyReadabilityChanged(),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: AdaptiveLabelButton(
              label: 'Reset readability',
              icon: Icons.restart_alt,
              onPressed: widget.onResetReadability == null
                  ? null
                  : () {
                      setState(() {
                        _readabilityEnabled = false;
                        _textScale =
                            StoryAssistancePreferences.defaults.textScale;
                        _lineHeight =
                            StoryAssistancePreferences.defaults.lineHeight;
                        _paragraphSpacing = StoryAssistancePreferences
                            .defaults
                            .paragraphSpacing;
                        _readableLineLengthEnabled = false;
                        _readableLineLength = StoryAssistancePreferences
                            .defaults
                            .readableLineLength;
                        _targetSpacing =
                            StoryAssistancePreferences.defaults.targetSpacing;
                      });
                      widget.onResetReadability!();
                    },
            ),
          ),
        ],
      ],
    );
  }
}

class _ReadabilitySlider extends StatelessWidget {
  const _ReadabilitySlider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.display,
    required this.onChanged,
    required this.onChangeEnd,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String display;
  final ValueChanged<double> onChanged;
  final ValueChanged<double> onChangeEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label)),
            Text(display),
          ],
        ),
        Slider(
          value: value.clamp(min, max).toDouble(),
          min: min,
          max: max,
          divisions: divisions,
          label: display,
          onChanged: onChanged,
          onChangeEnd: onChangeEnd,
        ),
      ],
    );
  }
}

class _DiagnosticsDialog extends StatelessWidget {
  const _DiagnosticsDialog({required this.diagnostics});

  final InputDiagnosticsRecorder diagnostics;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Input diagnostics'),
      content: Builder(
        builder: (context) {
          final viewport = MediaQuery.sizeOf(context);
          return ListenableBuilder(
            listenable: diagnostics,
            builder: (context, _) => SizedBox(
              width: (viewport.width - 48).clamp(280.0, 620.0),
              height: (viewport.height - 180).clamp(220.0, 420.0),
              child: Column(
                children: <Widget>[
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      diagnostics.enabled
                          ? '${diagnostics.events.length} events in memory'
                          : 'Diagnostics are off.',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: SingleChildScrollView(
                      child: SelectableText(diagnostics.serialize()),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
      actions: <Widget>[
        AdaptiveLabelButton(
          label: 'Copy report',
          icon: Icons.copy,
          onPressed: () async {
            await Clipboard.setData(
              ClipboardData(text: diagnostics.serialize()),
            );
            if (context.mounted) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('Report copied.')));
            }
          },
        ),
        AdaptiveLabelButton(
          label: 'Clear',
          icon: Icons.delete_sweep_outlined,
          onPressed: diagnostics.clear,
        ),
        AdaptiveLabelButton(
          label: 'Close',
          icon: Icons.close,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

class ImagePreviewDialog extends StatefulWidget {
  const ImagePreviewDialog({super.key, required this.src, required this.alt});

  final String src;
  final String alt;

  @override
  State<ImagePreviewDialog> createState() => _ImagePreviewDialogState();
}

class _ImagePreviewDialogState extends State<ImagePreviewDialog> {
  late final TransformationController _transformationController;
  var _doubleTapZoomEnabled = false;
  var _scale = 1.0;

  @override
  void initState() {
    super.initState();
    _transformationController = TransformationController();
  }

  @override
  void dispose() {
    _transformationController.dispose();
    super.dispose();
  }

  void _setScale(double scale) {
    final next = scale.clamp(1.0, 6.0).toDouble();
    setState(() => _scale = next);
    _transformationController.value = Matrix4.identity()
      ..scaleByDouble(next, next, next, 1);
  }

  void _adjustScale(int direction) {
    _setScale(_scale * (direction > 0 ? 1.25 : 0.8));
  }

  void _toggleDoubleTapZoom() {
    setState(() => _doubleTapZoomEnabled = !_doubleTapZoomEnabled);
    if (!_doubleTapZoomEnabled) _setScale(1);
  }

  void _handleDoubleTap() {
    if (!_doubleTapZoomEnabled) return;
    _setScale(_scale > 1 ? 1 : 2);
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.alt.trim().isEmpty
        ? 'Image Preview'
        : widget.alt.trim();
    return Dialog.fullscreen(
      backgroundColor: const Color(0xee101010),
      child: Column(
        children: [
          Material(
            color: const Color(0xff1f1f1f),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  AdaptiveIconButton(
                    tooltip: 'Copy image source',
                    onPressed: () =>
                        Clipboard.setData(ClipboardData(text: widget.src)),
                    icon: FLucideIcons.copy,
                  ),
                  AdaptiveIconButton(
                    tooltip: _doubleTapZoomEnabled
                        ? 'Disable double-tap zoom'
                        : 'Enable double-tap zoom',
                    onPressed: _toggleDoubleTapZoom,
                    icon: _doubleTapZoomEnabled
                        ? Icons.touch_app
                        : Icons.touch_app_outlined,
                  ),
                  AdaptiveIconButton(
                    tooltip: 'Zoom out image',
                    onPressed: _scale <= 1 ? null : () => _adjustScale(-1),
                    icon: Icons.zoom_out,
                  ),
                  AdaptiveIconButton(
                    tooltip: 'Zoom in image',
                    onPressed: _scale >= 6 ? null : () => _adjustScale(1),
                    icon: Icons.zoom_in,
                  ),
                  AdaptiveIconButton(
                    tooltip: 'Reset image zoom',
                    onPressed: _scale == 1 ? null : () => _setScale(1),
                    icon: Icons.restart_alt,
                  ),
                  AdaptiveIconButton(
                    tooltip: 'Close preview',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: FLucideIcons.x,
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: GestureDetector(
                onDoubleTap: _handleDoubleTap,
                child: InteractiveViewer(
                  transformationController: _transformationController,
                  minScale: 1,
                  maxScale: 6,
                  onInteractionUpdate: (_) {
                    final next = _transformationController.value
                        .getMaxScaleOnAxis()
                        .clamp(1.0, 6.0)
                        .toDouble();
                    if ((next - _scale).abs() > 0.01 && mounted) {
                      setState(() => _scale = next);
                    }
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: _PreviewImage(src: widget.src),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewImage extends StatelessWidget {
  const _PreviewImage({required this.src});

  final String src;

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(src);
    Widget errorBuilder(
      BuildContext context,
      Object error,
      StackTrace? stackTrace,
    ) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Text('Could not load image preview.'),
      );
    }

    if (uri != null && uri.scheme == 'file') {
      return Image.file(
        File.fromUri(uri),
        fit: BoxFit.contain,
        errorBuilder: errorBuilder,
      );
    }

    if (uri != null && uri.scheme == 'data') {
      final comma = src.indexOf(',');
      if (comma > -1 && src.substring(0, comma).contains(';base64')) {
        try {
          final bytes = base64Decode(src.substring(comma + 1));
          return Image.memory(
            bytes,
            fit: BoxFit.contain,
            errorBuilder: errorBuilder,
          );
        } catch (_) {
          return errorBuilder(context, Object(), null);
        }
      }
    }

    return Image.network(src, fit: BoxFit.contain, errorBuilder: errorBuilder);
  }
}

class _LibraryCard extends StatelessWidget {
  const _LibraryCard({
    required this.entry,
    required this.isMissing,
    required this.onOpen,
    required this.onMenu,
  });

  final LibraryEntry entry;
  final bool isMissing;
  final VoidCallback onOpen;
  final GestureTapDownCallback onMenu;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: isMissing ? 0.72 : 1,
      child: ContextActionSurface(
        semanticLabel: entry.title,
        onActivate: isMissing ? null : onOpen,
        onMenu: () => onMenu(TapDownDetails(globalPosition: Offset.zero)),
        child: FCard.raw(
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    AdaptiveIconButton(
                      tooltip: 'Game actions',
                      icon: Icons.more_vert,
                      onPressed: () =>
                          onMenu(TapDownDetails(globalPosition: Offset.zero)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  entry.path,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const Spacer(),
                if (isMissing)
                  Row(children: [const Expanded(child: Text('Missing file'))])
                else
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Last played ${MaterialLocalizations.of(context).formatShortDate(entry.lastPlayed.toLocal())}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.centerRight,
      children: [
        FAlert(
          variant: FAlertVariant.destructive,
          icon: const Icon(FLucideIcons.circleAlert),
          title: Text(message),
        ),
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: _ToolbarIconButton(
            tooltip: 'Dismiss',
            icon: FLucideIcons.x,
            onPress: onDismiss,
          ),
        ),
      ],
    );
  }
}

class ConsoleLog {
  const ConsoleLog({
    required this.message,
    required this.type,
    required this.timestamp,
    this.command,
  });

  final String message;
  final String type;
  final DateTime timestamp;
  final String? command;
}

extension _TakeLast<T> on Iterable<T> {
  Iterable<T> takeLast(int count) {
    final list = toList();
    if (list.length <= count) return list;
    return list.skip(list.length - count);
  }
}
