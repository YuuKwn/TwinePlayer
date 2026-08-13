import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

const int commandBarPreferencesSchemaVersion = 1;

/// Stable command identifiers used by the configurable comfortable command
/// bar. Collapse remains a fixed leading affordance; Console and More are
/// always normalized to the final two positions.
const List<String> commandBarCommandIds = <String>[
  'back',
  'undo',
  'save',
  'load',
  'pageUp',
  'pageDown',
  'console',
  'more',
];

const List<String> defaultCommandBarOrder = <String>[
  'back',
  'undo',
  'save',
  'load',
  'console',
  'more',
];

enum CommandBarAlignment { start, center, end }

enum CommandBarSize { small, standard, large }

enum CommandBarReach { left, balanced, right }

extension CommandBarPreferenceLabels on CommandBarAlignment {
  String get label => switch (this) {
    CommandBarAlignment.start => 'Start',
    CommandBarAlignment.center => 'Center',
    CommandBarAlignment.end => 'End',
  };

  static CommandBarAlignment parse(Object? value) =>
      CommandBarAlignment.values.firstWhere(
        (item) => item.name == value,
        orElse: () => CommandBarAlignment.center,
      );
}

extension CommandBarSizeLabels on CommandBarSize {
  String get label => switch (this) {
    CommandBarSize.small => 'Small buttons',
    CommandBarSize.standard => 'Standard buttons',
    CommandBarSize.large => 'Large buttons',
  };

  static CommandBarSize parse(Object? value) {
    // Accept provisional labels so files written during early builds migrate
    // deterministically to the explicit button-size names.
    if (value == 'comfortable') return CommandBarSize.standard;
    if (value == 'compact') return CommandBarSize.small;
    return CommandBarSize.values.firstWhere(
      (item) => item.name == value,
      orElse: () => CommandBarSize.standard,
    );
  }
}

extension CommandBarReachLabels on CommandBarReach {
  String get label => switch (this) {
    CommandBarReach.left => 'Left reach',
    CommandBarReach.balanced => 'Balanced reach',
    CommandBarReach.right => 'Right reach',
  };

  static CommandBarReach parse(Object? value) =>
      CommandBarReach.values.firstWhere(
        (item) => item.name == value,
        orElse: () => CommandBarReach.balanced,
      );
}

/// App-level command-bar preferences. The normalized form is deliberately
/// deterministic so malformed or older files cannot displace the Console or
/// More affordances from their safety pins.
class CommandBarPreferences {
  const CommandBarPreferences({
    this.alignment = CommandBarAlignment.center,
    this.order = defaultCommandBarOrder,
    this.size = CommandBarSize.standard,
    this.reach = CommandBarReach.balanced,
    this.pageUpEnabled = false,
    this.pageDownEnabled = false,
  });

  static const defaults = CommandBarPreferences();

  final CommandBarAlignment alignment;
  final List<String> order;
  final CommandBarSize size;
  final CommandBarReach reach;
  final bool pageUpEnabled;
  final bool pageDownEnabled;

  CommandBarPreferences copyWith({
    CommandBarAlignment? alignment,
    List<String>? order,
    CommandBarSize? size,
    CommandBarReach? reach,
    bool? pageUpEnabled,
    bool? pageDownEnabled,
  }) => CommandBarPreferences(
    alignment: alignment ?? this.alignment,
    order: order ?? this.order,
    size: size ?? this.size,
    reach: reach ?? this.reach,
    pageUpEnabled: pageUpEnabled ?? this.pageUpEnabled,
    pageDownEnabled: pageDownEnabled ?? this.pageDownEnabled,
  );

  CommandBarPreferences get normalized {
    final seen = <String>{};
    final candidate = <String>[];
    for (final id in <String>[...order, ...defaultCommandBarOrder]) {
      if (!commandBarCommandIds.contains(id) || !seen.add(id)) continue;
      candidate.add(id);
    }
    candidate.remove('console');
    candidate.remove('more');
    candidate.add('console');
    candidate.add('more');
    return CommandBarPreferences(
      alignment: alignment,
      order: List<String>.unmodifiable(candidate),
      size: size,
      reach: reach,
      pageUpEnabled: pageUpEnabled,
      pageDownEnabled: pageDownEnabled,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is CommandBarPreferences &&
      other.alignment == alignment &&
      _listEquals(other.order, order) &&
      other.size == size &&
      other.reach == reach &&
      other.pageUpEnabled == pageUpEnabled &&
      other.pageDownEnabled == pageDownEnabled;

  @override
  int get hashCode => Object.hash(
    alignment,
    Object.hashAll(order),
    size,
    reach,
    pageUpEnabled,
    pageDownEnabled,
  );

  Map<String, Object?> toJson() {
    final value = normalized;
    return <String, Object?>{
      'alignment': value.alignment.name,
      'order': value.order,
      'size': value.size.name,
      'reach': value.reach.name,
      'pageUpEnabled': value.pageUpEnabled,
      'pageDownEnabled': value.pageDownEnabled,
    };
  }

  static CommandBarPreferences fromJson(Object? value) {
    if (value is! Map) return defaults;
    final rawOrder = value['order'];
    return CommandBarPreferences(
      alignment: CommandBarPreferenceLabels.parse(value['alignment']),
      order: rawOrder is List
          ? rawOrder.whereType<String>().toList()
          : defaultCommandBarOrder,
      size: CommandBarSizeLabels.parse(value['size']),
      reach: CommandBarReachLabels.parse(value['reach']),
      pageUpEnabled: value['pageUpEnabled'] is bool
          ? value['pageUpEnabled'] as bool
          : false,
      pageDownEnabled: value['pageDownEnabled'] is bool
          ? value['pageDownEnabled'] as bool
          : false,
    ).normalized;
  }

  static bool _listEquals(List<String> left, List<String> right) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index++) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }
}

/// JSON-backed app-level command-bar preferences. Invalid files fall back to
/// defaults and never block startup.
class CommandBarPreferencesStore {
  CommandBarPreferencesStore(this._file, {CommandBarPreferences? memoryValue})
    : _memoryValue = memoryValue ?? CommandBarPreferences.defaults;

  CommandBarPreferencesStore.inMemory({CommandBarPreferences? initial})
    : _file = null,
      _memoryValue = initial ?? CommandBarPreferences.defaults;

  final File? _file;
  CommandBarPreferences _memoryValue;

  static Future<CommandBarPreferencesStore> create() async {
    final supportDir = await getApplicationSupportDirectory();
    final appDir = Directory(p.join(supportDir.path, 'TwinePlayerFlutter'));
    await appDir.create(recursive: true);
    return CommandBarPreferencesStore(
      File(p.join(appDir.path, 'command-bar-preferences.json')),
    );
  }

  Future<CommandBarPreferences> load() async {
    final file = _file;
    if (file == null) return _memoryValue.normalized;
    if (!await file.exists()) return CommandBarPreferences.defaults;
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) return CommandBarPreferences.defaults;
      final payload = decoded['preferences'] is Map
          ? decoded['preferences']
          : decoded;
      return CommandBarPreferences.fromJson(payload);
    } catch (_) {
      return CommandBarPreferences.defaults;
    }
  }

  Future<void> save(CommandBarPreferences preferences) async {
    final normalized = preferences.normalized;
    final file = _file;
    if (file == null) {
      _memoryValue = normalized;
      return;
    }
    await file.parent.create(recursive: true);
    await file.writeAsString(
      JsonEncoder.withIndent('  ').convert(<String, Object?>{
        'version': commandBarPreferencesSchemaVersion,
        'preferences': normalized.toJson(),
      }),
    );
  }
}

/// Change-notifying controller shared by library settings and player chrome.
class CommandBarPreferencesController extends ChangeNotifier {
  CommandBarPreferencesController({
    required this.store,
    CommandBarPreferences initial = CommandBarPreferences.defaults,
  }) : _preferences = initial.normalized;

  final CommandBarPreferencesStore store;
  CommandBarPreferences _preferences;
  Future<void> _writeQueue = Future<void>.value();

  CommandBarPreferences get preferences => _preferences;

  Future<void> load() async {
    final next = await store.load();
    if (next == _preferences) return;
    _preferences = next;
    notifyListeners();
  }

  Future<void> update(CommandBarPreferences next) {
    final normalized = next.normalized;
    if (normalized == _preferences) return Future<void>.value();
    _preferences = normalized;
    notifyListeners();
    final operation = _writeQueue.then((_) => store.save(normalized));
    _writeQueue = operation.catchError((_) {});
    return operation;
  }

  Future<void> reset() => update(CommandBarPreferences.defaults);
}
