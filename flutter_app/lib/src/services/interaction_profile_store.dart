import 'dart:convert';
import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// The input density selected by the user.
enum InteractionProfile { auto, comfortable, compact }

extension InteractionProfileLabel on InteractionProfile {
  String get label => switch (this) {
    InteractionProfile.auto => 'Auto',
    InteractionProfile.comfortable => 'Comfortable',
    InteractionProfile.compact => 'Compact',
  };

  String get description => switch (this) {
    InteractionProfile.auto => 'Use recent touch or mouse input to adapt.',
    InteractionProfile.comfortable =>
      'Larger controls and a reach-friendly command bar.',
    InteractionProfile.compact => 'Dense controls for keyboard and mouse.',
  };

  static InteractionProfile parse(Object? value) {
    if (value is! String) return InteractionProfile.auto;
    return InteractionProfile.values.firstWhere(
      (item) => item.name == value,
      orElse: () => InteractionProfile.auto,
    );
  }
}

/// Small JSON-backed preferences store. Invalid data is intentionally treated
/// as an empty preference file so startup can never be blocked by corruption.
class InteractionProfileStore {
  InteractionProfileStore(this.file);

  final File file;

  static Future<InteractionProfileStore> create() async {
    final supportDir = await getApplicationSupportDirectory();
    final appDir = Directory(p.join(supportDir.path, 'TwinePlayerFlutter'));
    await appDir.create(recursive: true);
    return InteractionProfileStore(
      File(p.join(appDir.path, 'preferences.json')),
    );
  }

  Future<InteractionProfile> load() async {
    if (!await file.exists()) return InteractionProfile.auto;
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) return InteractionProfile.auto;
      return InteractionProfileLabel.parse(decoded['interactionProfile']);
    } catch (_) {
      return InteractionProfile.auto;
    }
  }

  Future<void> save(InteractionProfile profile) async {
    await file.parent.create(recursive: true);
    await file.writeAsString(
      JsonEncoder.withIndent('  ').convert(<String, Object?>{
        'version': 1,
        'interactionProfile': profile.name,
      }),
    );
  }
}

/// Application-level profile state shared by the library, dialogs and player.
class InteractionProfileController extends ChangeNotifier {
  InteractionProfileController({
    required this.store,
    InteractionProfile initial = InteractionProfile.auto,
  }) : _selected = initial,
       _effective = initial == InteractionProfile.comfortable
           ? InteractionProfile.comfortable
           : InteractionProfile.compact;

  final InteractionProfileStore store;
  InteractionProfile _selected;
  InteractionProfile _effective;
  DateTime? _lastAutomaticChange;

  InteractionProfile get selected => _selected;
  InteractionProfile get effective => _effective;
  bool get isComfortable => _effective == InteractionProfile.comfortable;

  Future<void> setSelected(InteractionProfile profile) async {
    if (_selected == profile) return;
    _selected = profile;
    _lastAutomaticChange = null;
    if (profile == InteractionProfile.comfortable) {
      _effective = InteractionProfile.comfortable;
    } else if (profile == InteractionProfile.compact) {
      _effective = InteractionProfile.compact;
    }
    notifyListeners();
    await store.save(profile);
  }

  /// Observe trustworthy activation input. Hover/move events are deliberately
  /// not passed here, so Auto cannot flicker while a pointer merely traverses
  /// the window. Unknown device kinds leave the current choice unchanged.
  void observePointer(PointerDeviceKind kind) {
    if (_selected != InteractionProfile.auto) return;
    final next = switch (kind) {
      PointerDeviceKind.touch ||
      PointerDeviceKind.stylus ||
      PointerDeviceKind.invertedStylus => InteractionProfile.comfortable,
      PointerDeviceKind.mouse => InteractionProfile.compact,
      _ => null,
    };
    if (next == null || next == _effective) return;
    final now = DateTime.now();
    final previous = _lastAutomaticChange;
    if (previous != null &&
        now.difference(previous) < const Duration(milliseconds: 350)) {
      return;
    }
    _lastAutomaticChange = now;
    _effective = next;
    notifyListeners();
  }
}

class InteractionProfileScope
    extends InheritedNotifier<InteractionProfileController> {
  const InteractionProfileScope({
    super.key,
    required super.notifier,
    required super.child,
  });

  static InteractionProfileController of(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<InteractionProfileScope>();
    assert(
      scope != null,
      'InteractionProfileScope is missing above this context.',
    );
    return scope!.notifier!;
  }
}
