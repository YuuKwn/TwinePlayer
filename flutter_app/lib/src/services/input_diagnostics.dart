import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';

import 'build_identity.dart';

/// Privacy-safe in-memory input metadata. Coordinates, timestamps, key values,
/// paths and story content are intentionally absent from this model.
class InputDiagnosticEvent {
  const InputDiagnosticEvent({
    required this.kind,
    required this.category,
    required this.buttonCount,
    required this.contactCount,
    required this.origin,
  });

  final String kind;
  final String category;
  final int buttonCount;
  final int contactCount;
  final String origin;

  Map<String, Object?> toJson() => <String, Object?>{
    'kind': kind,
    'category': category,
    'buttons': buttonCount,
    'contacts': contactCount,
    'origin': origin,
  };

  static const allowedKinds = <String>{
    'mouse',
    'touch',
    'stylus',
    'invertedStylus',
    'trackpad',
    'unknown',
  };
  static const allowedCategories = <String>{
    'pointerdown',
    'pointerup',
    'pointercancel',
    'touchstart',
    'touchend',
    'touchcancel',
    'mousedown',
    'mouseup',
    'wheel',
    'click',
    'contextmenu',
  };
  static const allowedOrigins = <String>{'chrome', 'webview'};

  static String normalizeKind(Object? value) {
    final candidate = value is String ? value : '';
    if (candidate == 'pen') return 'stylus';
    return allowedKinds.contains(candidate) ? candidate : 'unknown';
  }

  static String? normalizeCategory(Object? value) {
    final candidate = value is String ? value : '';
    return allowedCategories.contains(candidate) ? candidate : null;
  }

  static String normalizeOrigin(Object? value) {
    final candidate = value is String ? value : '';
    return allowedOrigins.contains(candidate) ? candidate : 'unknown';
  }

  static InputDiagnosticEvent? fromWebViewMetadata({
    required Object? kind,
    required Object? category,
    required Object? buttons,
    required Object? contacts,
  }) {
    final normalizedCategory = normalizeCategory(category);
    if (normalizedCategory == null) return null;
    return InputDiagnosticEvent(
      kind: normalizeKind(kind),
      category: normalizedCategory,
      buttonCount: _clampInt(buttons, 0, 8),
      contactCount: _clampInt(contacts, 0, 10),
      origin: 'webview',
    );
  }

  static InputDiagnosticEvent fromPointerEvent(
    PointerEvent event, {
    required String category,
    required String origin,
    required int contactCount,
  }) {
    return InputDiagnosticEvent(
      kind: normalizeKind(event.kind.name),
      category: normalizeCategory(category) ?? 'pointerdown',
      buttonCount: _countBits(event.buttons),
      contactCount: contactCount.clamp(0, 10),
      origin: normalizeOrigin(origin),
    );
  }

  static int _clampInt(Object? value, int min, int max) {
    final number = value is num ? value.toInt() : 0;
    return number.clamp(min, max);
  }

  static int _countBits(int value) {
    var count = 0;
    var remaining = value;
    while (remaining != 0) {
      count += remaining & 1;
      remaining >>= 1;
    }
    return count;
  }
}

class InputDiagnosticsRecorder extends ChangeNotifier {
  InputDiagnosticsRecorder({
    this.capacity = 200,
    this.buildIdentity = const BuildIdentity.empty(),
  });

  static const int maxScenarioLabelLength = 64;

  final int capacity;
  final BuildIdentity buildIdentity;
  final List<InputDiagnosticEvent> _events = <InputDiagnosticEvent>[];
  final Set<int> _activePointers = <int>{};
  bool _enabled = false;
  String _scenarioLabel = '';

  bool get enabled => _enabled;
  String get scenarioLabel => _scenarioLabel;
  List<InputDiagnosticEvent> get events => List.unmodifiable(_events);

  /// Removes control/newline characters and bounds the value for a
  /// session-only, user-entered hardware-mode label. The label is never
  /// persisted and is included in reports only when non-empty.
  static String sanitizeScenarioLabel(Object? value) {
    if (value is! String) return '';
    final sanitized = value
        .replaceAll(RegExp(r'[\x00-\x1F\x7F]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (sanitized.length <= maxScenarioLabelLength) return sanitized;
    return sanitized.substring(0, maxScenarioLabelLength).trimRight();
  }

  void setScenarioLabel(String value) {
    final sanitized = sanitizeScenarioLabel(value);
    if (_scenarioLabel == sanitized) return;
    _scenarioLabel = sanitized;
    notifyListeners();
  }

  void setEnabled(bool value) {
    if (_enabled == value) return;
    _enabled = value;
    if (!value) _activePointers.clear();
    notifyListeners();
  }

  void clear() {
    if (_events.isEmpty && _activePointers.isEmpty) return;
    _events.clear();
    _activePointers.clear();
    notifyListeners();
  }

  void record(InputDiagnosticEvent event) {
    if (!_enabled) return;
    _events.add(event);
    if (_events.length > capacity) {
      _events.removeRange(0, _events.length - capacity);
    }
    notifyListeners();
  }

  void recordPointer(
    PointerEvent event, {
    String category = 'pointerdown',
    String origin = 'chrome',
  }) {
    if (!_enabled) return;
    final tracksContacts = switch (event.kind) {
      PointerDeviceKind.touch ||
      PointerDeviceKind.stylus ||
      PointerDeviceKind.invertedStylus => true,
      _ => false,
    };
    if (tracksContacts && event is PointerDownEvent) {
      _activePointers.add(event.pointer);
    }
    if (tracksContacts &&
        (event is PointerUpEvent || event is PointerCancelEvent)) {
      _activePointers.remove(event.pointer);
    }
    final contacts = tracksContacts ? _activePointers.length : 0;
    record(
      InputDiagnosticEvent.fromPointerEvent(
        event,
        category: category,
        origin: origin,
        contactCount: contacts,
      ),
    );
  }

  String serialize() {
    final counts = <String, int>{};
    for (final event in _events) {
      final key = '${event.origin}:${event.kind}:${event.category}';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    final report = <String, Object?>{
      'enabled': _enabled,
      'eventCount': _events.length,
      'summary': counts,
      'recent': _events
          .skip(_events.length > 40 ? _events.length - 40 : 0)
          .map((event) => event.toJson())
          .toList(),
    };
    if (_scenarioLabel.isNotEmpty) report['scenarioLabel'] = _scenarioLabel;
    report.addAll(buildIdentity.reportFields);
    return const JsonEncoder.withIndent('  ').convert(report);
  }
}
