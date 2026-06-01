import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:webview_windows/webview_windows.dart';

import 'models.dart';
import 'services/console_command_store.dart';
import 'services/game_metadata_service.dart';
import 'services/history_store.dart';
import 'services/save_service.dart';
import 'services/webview_scripts.dart';

class TwinePlayerDependencies {
  const TwinePlayerDependencies({
    required this.historyStore,
    required this.consoleCommandStore,
    required this.metadataService,
    required this.saveService,
  });

  final HistoryStore historyStore;
  final ConsoleCommandStore consoleCommandStore;
  final GameMetadataService metadataService;
  final SaveService saveService;

  static Future<TwinePlayerDependencies> create() async {
    return TwinePlayerDependencies(
      historyStore: await HistoryStore.create(),
      consoleCommandStore: await ConsoleCommandStore.create(),
      metadataService: GameMetadataService(),
      saveService: SaveService(),
    );
  }
}

class TwinePlayerApp extends StatelessWidget {
  const TwinePlayerApp({super.key, required this.dependencies});

  final TwinePlayerDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Twine Player',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff0078d4),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xff202020),
        fontFamily: 'Segoe UI',
        visualDensity: VisualDensity.compact,
        cardTheme: CardThemeData(
          color: const Color(0xff2b2b2b),
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: Color(0xff3a3a3a)),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xff2b2b2b),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xff474747)),
          ),
          isDense: true,
        ),
        dividerTheme: const DividerThemeData(
          color: Color(0xff3a3a3a),
          thickness: 1,
          space: 1,
        ),
        useMaterial3: true,
      ),
      home: LibraryScreen(dependencies: dependencies),
    );
  }
}

enum _LibraryAction { open, relink, copyPath, reveal, remove }

enum _SaveAction { activate, delete }

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.dependencies});

  final TwinePlayerDependencies dependencies;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _searchController = TextEditingController();
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
    setState(() {
      _entries = _entries.where((item) => item.path != entry.path).toList();
      _missingPaths.remove(entry.path);
    });
    await _persist();
  }

  Future<void> _copyPath(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Path copied')));
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
    final position = details.globalPosition;
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
            child: _ContextMenuLabel(icon: Icons.play_arrow, label: 'Play'),
          ),
        const PopupMenuItem(
          value: _LibraryAction.relink,
          child: _ContextMenuLabel(icon: Icons.link, label: 'Relink'),
        ),
        const PopupMenuItem(
          value: _LibraryAction.copyPath,
          child: _ContextMenuLabel(icon: Icons.copy, label: 'Copy path'),
        ),
        const PopupMenuItem(
          value: _LibraryAction.reveal,
          child: _ContextMenuLabel(
            icon: Icons.folder_open,
            label: 'Reveal in Explorer',
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: _LibraryAction.remove,
          child: _ContextMenuLabel(
            icon: Icons.delete_outline,
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
    return Scaffold(
      body: SafeArea(
        child: Row(
          children: [
            _LibraryRail(
              total: _entries.length,
              missing: _missingPaths.length,
              onLoadGame: _pickGame,
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Your Library',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        SizedBox(
                          width: 360,
                          child: TextField(
                            controller: _searchController,
                            onChanged: (_) => setState(() {}),
                            decoration: const InputDecoration(
                              hintText: 'Search library',
                              prefixIcon: Icon(Icons.search),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        SegmentedButton<LibrarySortMode>(
                          showSelectedIcon: false,
                          style: SegmentedButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                          ),
                          segments: const [
                            ButtonSegment(
                              value: LibrarySortMode.lastPlayed,
                              icon: Icon(Icons.history),
                              label: Text('Recent'),
                            ),
                            ButtonSegment(
                              value: LibrarySortMode.title,
                              icon: Icon(Icons.sort_by_alpha),
                              label: Text('Title'),
                            ),
                            ButtonSegment(
                              value: LibrarySortMode.path,
                              icon: Icon(Icons.folder),
                              label: Text('Path'),
                            ),
                          ],
                          selected: {_sortMode},
                          onSelectionChanged: (value) =>
                              setState(() => _sortMode = value.first),
                        ),
                      ],
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      _InlineError(
                        message: _error!,
                        onDismiss: () => setState(() => _error = null),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Expanded(
                      child: _isLoading
                          ? const Center(child: CircularProgressIndicator())
                          : visibleEntries.isEmpty
                          ? Center(
                              child: Text(
                                _entries.isEmpty
                                    ? 'No games in your library yet.'
                                    : 'No games match your search.',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            )
                          : GridView.builder(
                              gridDelegate:
                                  const SliverGridDelegateWithMaxCrossAxisExtent(
                                    maxCrossAxisExtent: 300,
                                    mainAxisExtent: 132,
                                    mainAxisSpacing: 8,
                                    crossAxisSpacing: 8,
                                  ),
                              itemCount: visibleEntries.length,
                              itemBuilder: (context, index) {
                                final entry = visibleEntries[index];
                                return _LibraryCard(
                                  entry: entry,
                                  isMissing: _missingPaths.contains(entry.path),
                                  onOpen: () => _openPlayer(entry),
                                  onRemove: () => _removeGame(entry),
                                  onRelink: () => _relinkGame(entry),
                                  onCopyPath: () => _copyPath(entry.path),
                                  onReveal: () => _revealInExplorer(entry.path),
                                  onSecondaryTapDown: (details) =>
                                      _showLibraryContextMenu(entry, details),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            ),
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
  });

  final TwinePlayerDependencies dependencies;
  final LibraryEntry entry;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  final _controller = WebviewController();
  final _subscriptions = <StreamSubscription<dynamic>>[];
  final _consoleInput = TextEditingController();
  var _logs = <_ConsoleLog>[];
  var _savedCommands = <String, List<String>>{};
  var _suggestions = <String>[];
  var _isWebViewReady = false;
  var _isConsoleOpen = false;
  var _isConsoleSideBySide = false;
  var _isLoading = true;
  var _currentIfid = '';
  String? _webViewError;

  @override
  void initState() {
    super.initState();
    _loadConsoleCommands();
    unawaited(_initializeWebView());
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    _consoleInput.dispose();
    unawaited(_controller.dispose());
    super.dispose();
  }

  Future<void> _loadConsoleCommands() async {
    final commands = await widget.dependencies.consoleCommandStore.load();
    if (mounted) setState(() => _savedCommands = commands);
  }

  Future<void> _initializeWebView() async {
    try {
      await _controller.initialize();
      await _controller.setBackgroundColor(Colors.transparent);
      await _controller.setPopupWindowPolicy(WebviewPopupWindowPolicy.deny);
      _subscriptions.add(
        _controller.loadingState.listen((state) {
          if (mounted) {
            setState(() => _isLoading = state == LoadingState.loading);
          }
        }),
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
      if (!mounted) return;
      setState(() => _isWebViewReady = true);
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
        _ConsoleLog(message: message, type: type, timestamp: DateTime.now()),
      ].takeLast(300).toList();
    });
  }

  void _logCommand(String command) {
    if (!mounted) return;
    setState(() {
      _logs = [
        ..._logs,
        _ConsoleLog(
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
  }

  Future<void> _captureAndSave() async {
    final result = await _executeJsonScript(r'''
(function () { return JSON.stringify(window.__twinePlayerCaptureSave()); })();
''');
    if (result is! Map || result['ok'] != true) {
      _log(
        '${result is Map ? (result['error'] ?? 'Unable to capture save.') : 'Unable to capture save.'}',
        'error',
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
    await _openSaveManager(SaveManagerMode.save, pendingSaveBytes: data);
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
  }

  Future<void> _openSaveManager(
    SaveManagerMode mode, {
    Uint8List? pendingSaveBytes,
  }) async {
    final result = await showDialog<_SaveDialogResult>(
      context: context,
      barrierDismissible: true,
      builder: (_) => SaveManagerDialog(
        mode: mode,
        gamePath: widget.entry.path,
        saveService: widget.dependencies.saveService,
        pendingSaveBytes: pendingSaveBytes,
      ),
    );
    if (result == null) return;
    if (result.loadedSave != null) {
      await _restoreSave(result.loadedSave!);
    } else if (result.savedFilename != null) {
      _log('Saved successfully to ${result.savedFilename}', 'result');
    }
  }

  Future<void> _showImagePreview({
    required String src,
    required String alt,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _ImagePreviewDialog(src: src, alt: alt),
    );
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
    final console = _ConsolePanel(
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
    );

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _PlayerToolbar(
              title: widget.entry.title,
              onBackToLibrary: () => Navigator.of(context).pop(),
              onUndo: _undo,
              onSave: _captureAndSave,
              onLoad: _openLoadManager,
              onConsole: () => setState(() => _isConsoleOpen = true),
              onDevTools: _controller.openDevTools,
            ),
            Expanded(
              child: Row(
                children: [
                  Expanded(child: _buildWebView()),
                  if (_isConsoleOpen && _isConsoleSideBySide)
                    SizedBox(width: 520, child: console),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomSheet: _isConsoleOpen && !_isConsoleSideBySide
          ? Padding(
              padding: const EdgeInsets.fromLTRB(50, 0, 50, 8),
              child: SizedBox(height: 360, child: console),
            )
          : null,
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
      return const Center(child: CircularProgressIndicator());
    }
    return Stack(
      children: [
        Webview(_controller),
        if (_isLoading) const LinearProgressIndicator(minHeight: 3),
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
    setState(() => _isBusy = true);
    try {
      await widget.saveService.writeSave(widget.gamePath, filename, bytes);
      if (!mounted) return;
      Navigator.of(
        context,
      ).pop(_SaveDialogResult(savedFilename: normalizeSaveFilename(filename)));
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
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (accepted != true) return;
    await widget.saveService.deleteSave(widget.gamePath, save.filename);
    await _refresh();
  }

  void _activateSave(SaveEntry save, bool isSaveMode) {
    if (isSaveMode) {
      _write(save.filename);
    } else {
      Navigator.of(context).pop(_SaveDialogResult(loadedSave: save));
    }
  }

  Future<void> _showSaveContextMenu(
    SaveEntry save,
    bool isSaveMode,
    TapDownDetails details,
  ) async {
    final position = details.globalPosition;
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
            icon: isSaveMode ? Icons.save : Icons.upload_file,
            label: isSaveMode ? 'Overwrite save' : 'Load save',
          ),
        ),
        const PopupMenuItem(
          value: _SaveAction.delete,
          child: _ContextMenuLabel(
            icon: Icons.delete_outline,
            label: 'Delete save',
          ),
        ),
      ],
    );

    switch (selected) {
      case _SaveAction.activate:
        _activateSave(save, isSaveMode);
      case _SaveAction.delete:
        await _delete(save);
      case null:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSaveMode = widget.mode == SaveManagerMode.save;
    return AlertDialog(
      title: Row(
        children: [
          Icon(isSaveMode ? Icons.save_alt : Icons.file_upload_outlined),
          const SizedBox(width: 8),
          Text(isSaveMode ? 'Save Game' : 'Load Game'),
        ],
      ),
      content: SizedBox(
        width: 760,
        height: 520,
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
                    child: TextField(
                      controller: _filenameController,
                      decoration: const InputDecoration(
                        labelText: 'New save filename',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: _write,
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: _isBusy
                        ? null
                        : () => _write(_filenameController.text),
                    icon: const Icon(Icons.add),
                    label: const Text('Save New'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            Expanded(
              child: _isBusy
                  ? const Center(child: CircularProgressIndicator())
                  : _saves.isEmpty
                  ? Center(
                      child: Text(
                        isSaveMode
                            ? 'No saves yet. Create the first one above.'
                            : 'No saves found.',
                      ),
                    )
                  : GridView.builder(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            childAspectRatio: 3.4,
                            mainAxisSpacing: 8,
                            crossAxisSpacing: 8,
                          ),
                      itemCount: _pageSaves.length,
                      itemBuilder: (context, index) {
                        final save = _pageSaves[index];
                        return GestureDetector(
                          onSecondaryTapDown: (details) =>
                              _showSaveContextMenu(save, isSaveMode, details),
                          child: Card(
                            child: ListTile(
                              dense: true,
                              title: Text(
                                save.filename.replaceFirst(
                                  RegExp(r'\.save$', caseSensitive: false),
                                  '',
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(
                                '${formatBytes(save.size)}  ${MaterialLocalizations.of(context).formatShortDate(save.modified)}',
                              ),
                              leading: Icon(
                                isSaveMode ? Icons.save : Icons.upload_file,
                              ),
                              trailing: IconButton(
                                tooltip: 'Delete save',
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () => _delete(save),
                              ),
                              onTap: () => _activateSave(save, isSaveMode),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${_saves.length} saves total'),
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Previous page',
                      onPressed: _page == 0
                          ? null
                          : () => setState(() => _page--),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text('Page ${_page + 1} / ${_lastPage + 1}'),
                    IconButton(
                      tooltip: 'Next page',
                      onPressed: _page >= _lastPage
                          ? null
                          : () => setState(() => _page++),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
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

class _PlayerToolbar extends StatelessWidget {
  const _PlayerToolbar({
    required this.title,
    required this.onBackToLibrary,
    required this.onUndo,
    required this.onSave,
    required this.onLoad,
    required this.onConsole,
    required this.onDevTools,
  });

  final String title;
  final VoidCallback onBackToLibrary;
  final VoidCallback onUndo;
  final VoidCallback onSave;
  final VoidCallback onLoad;
  final VoidCallback onConsole;
  final VoidCallback onDevTools;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xff191d24),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            TextButton.icon(
              onPressed: onBackToLibrary,
              icon: const Icon(Icons.arrow_back),
              label: const Text('Library'),
            ),
            IconButton(
              onPressed: onUndo,
              icon: const Icon(Icons.undo),
              tooltip: 'Undo / Back one turn',
            ),
            Expanded(
              child: Text(
                title,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            TextButton.icon(
              onPressed: onSave,
              icon: const Icon(Icons.save_alt),
              label: const Text('Save'),
            ),
            TextButton.icon(
              onPressed: onLoad,
              icon: const Icon(Icons.file_upload_outlined),
              label: const Text('Load'),
            ),
            TextButton.icon(
              onPressed: onConsole,
              icon: const Icon(Icons.terminal),
              label: const Text('Console'),
            ),
            IconButton(
              onPressed: onDevTools,
              icon: const Icon(Icons.developer_mode),
              tooltip: 'Open WebView DevTools',
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsolePanel extends StatefulWidget {
  const _ConsolePanel({
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
  });

  final TextEditingController inputController;
  final List<_ConsoleLog> logs;
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

  @override
  State<_ConsolePanel> createState() => _ConsolePanelState();
}

class _ConsolePanelState extends State<_ConsolePanel> {
  var _savedExpanded = false;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(14);
    return Material(
      elevation: 18,
      color: Colors.transparent,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xff151922),
          borderRadius: radius,
          border: Border.all(color: const Color(0xff303747)),
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
              subtitle: const Text('Runs JavaScript inside the loaded game'),
              trailing: Wrap(
                spacing: 4,
                children: [
                  IconButton(
                    tooltip: widget.isSideBySide
                        ? 'Use overlay layout'
                        : 'Use side-by-side layout',
                    onPressed: widget.onToggleLayout,
                    icon: Icon(
                      widget.isSideBySide
                          ? Icons.vertical_split
                          : Icons.view_sidebar,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close console',
                    onPressed: widget.onClose,
                    icon: const Icon(Icons.close),
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
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        scrollDirection: Axis.horizontal,
                        itemCount: widget.suggestions.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 6),
                        itemBuilder: (context, index) => ActionChip(
                          label: Text(widget.suggestions[index]),
                          onPressed: () {
                            widget.inputController.text =
                                widget.suggestions[index];
                            widget.inputController.selection =
                                TextSelection.collapsed(
                                  offset: widget.suggestions[index].length,
                                );
                          },
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: widget.inputController,
                            onChanged: widget.onChanged,
                            onSubmitted: widget.onRun,
                            decoration: const InputDecoration(
                              hintText: 'Enter JavaScript...',
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          tooltip: 'Save command',
                          onPressed: widget.onSave,
                          icon: const Icon(Icons.check),
                        ),
                        FilledButton(
                          onPressed: () =>
                              widget.onRun(widget.inputController.text),
                          child: const Text('Run'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsoleLogRow extends StatefulWidget {
  const _ConsoleLogRow({
    required this.log,
    required this.onRun,
    required this.onSave,
  });

  final _ConsoleLog log;
  final VoidCallback? onRun;
  final VoidCallback? onSave;

  @override
  State<_ConsoleLogRow> createState() => _ConsoleLogRowState();
}

class _ConsoleLogRowState extends State<_ConsoleLogRow> {
  var _hovering = false;

  @override
  Widget build(BuildContext context) {
    final isCommand = widget.log.command != null;
    return MouseRegion(
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
              if (isCommand && (_hovering || widget.log.type == 'input')) ...[
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Run again',
                  onPressed: widget.onRun,
                  icon: const Icon(Icons.play_arrow, size: 17),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Save command',
                  onPressed: widget.onSave,
                  icon: const Icon(Icons.check, size: 17),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SavedCommandsBar extends StatelessWidget {
  const _SavedCommandsBar({
    required this.commands,
    required this.expanded,
    required this.onToggle,
    required this.onUse,
    required this.onRun,
    required this.onDelete,
  });

  final List<String> commands;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<String> onUse;
  final ValueChanged<String> onRun;
  final ValueChanged<int> onDelete;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xff303747))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(
                    expanded ? Icons.expand_more : Icons.chevron_right,
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
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                      scrollDirection: Axis.horizontal,
                      itemCount: commands.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final command = commands[index];
                        return _SavedCommandChip(
                          command: command,
                          onUse: () => onUse(command),
                          onRun: () => onRun(command),
                          onDelete: () => onDelete(index),
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
}

class _SavedCommandChip extends StatelessWidget {
  const _SavedCommandChip({
    required this.command,
    required this.onUse,
    required this.onRun,
    required this.onDelete,
  });

  final String command;
  final VoidCallback onUse;
  final VoidCallback onRun;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 260,
      decoration: BoxDecoration(
        color: const Color(0xff202631),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xff384354)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onUse,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  command,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontFamily: 'Consolas', fontSize: 12),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Run saved command',
                onPressed: onRun,
                icon: const Icon(Icons.play_arrow, size: 18),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Delete saved command',
                onPressed: onDelete,
                icon: const Icon(Icons.close, size: 18),
              ),
            ],
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
  });

  final int total;
  final int missing;
  final VoidCallback onLoadGame;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 248,
      color: const Color(0xff1f1f1f),
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
                    color: const Color(0xff0078d4),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.auto_stories, color: Colors.white),
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
            FilledButton.icon(
              onPressed: onLoadGame,
              icon: const Icon(Icons.add),
              label: const Text('Load Game'),
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
              'Right-click games for file actions.',
              style: Theme.of(context).textTheme.bodySmall,
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
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xff2b2b2b),
        border: Border.all(color: const Color(0xff3a3a3a)),
        borderRadius: BorderRadius.circular(10),
      ),
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

class _ImagePreviewDialog extends StatelessWidget {
  const _ImagePreviewDialog({required this.src, required this.alt});

  final String src;
  final String alt;

  @override
  Widget build(BuildContext context) {
    final title = alt.trim().isEmpty ? 'Image Preview' : alt.trim();
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
                  IconButton(
                    tooltip: 'Copy image source',
                    onPressed: () =>
                        Clipboard.setData(ClipboardData(text: src)),
                    icon: const Icon(Icons.copy),
                  ),
                  IconButton(
                    tooltip: 'Close preview',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: InteractiveViewer(
                maxScale: 6,
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: _PreviewImage(src: src),
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
    required this.onRemove,
    required this.onRelink,
    required this.onCopyPath,
    required this.onReveal,
    required this.onSecondaryTapDown,
  });

  final LibraryEntry entry;
  final bool isMissing;
  final VoidCallback onOpen;
  final VoidCallback onRemove;
  final VoidCallback onRelink;
  final VoidCallback onCopyPath;
  final VoidCallback onReveal;
  final GestureTapDownCallback onSecondaryTapDown;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onSecondaryTapDown: onSecondaryTapDown,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: isMissing ? null : onOpen,
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
                    IconButton(
                      tooltip: 'Remove from library',
                      onPressed: onRemove,
                      icon: const Icon(Icons.close),
                      visualDensity: VisualDensity.compact,
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
                  Row(
                    children: [
                      const Expanded(child: Text('Missing file')),
                      TextButton(
                        onPressed: onRelink,
                        child: const Text('Relink'),
                      ),
                    ],
                  )
                else
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Last played ${MaterialLocalizations.of(context).formatShortDate(entry.lastPlayed.toLocal())}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        tooltip: 'Copy path',
                        onPressed: onCopyPath,
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.copy, size: 18),
                      ),
                      IconButton(
                        tooltip: 'Reveal in Explorer',
                        onPressed: onReveal,
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.folder_open, size: 18),
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
    return Material(
      color: const Color(0xff4a1f24),
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            const Icon(Icons.error_outline, color: Color(0xffffb4b4)),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
            IconButton(onPressed: onDismiss, icon: const Icon(Icons.close)),
          ],
        ),
      ),
    );
  }
}

class _ConsoleLog {
  const _ConsoleLog({
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
