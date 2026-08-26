import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/build_identity.dart';
import 'package:twine_player_flutter/src/services/input_diagnostics.dart';

void main() {
  test('diagnostics remain disabled and do not retain events by default', () {
    final recorder = InputDiagnosticsRecorder(capacity: 2);
    recorder.record(
      const InputDiagnosticEvent(
        kind: 'touch',
        category: 'pointerdown',
        buttonCount: 1,
        contactCount: 1,
        origin: 'webview',
      ),
    );
    expect(recorder.events, isEmpty);
    expect(recorder.serialize(), isNot(contains('scenarioLabel')));
  });

  test(
    'scenario labels are sanitized, bounded, session-only, and optional',
    () {
      final recorder = InputDiagnosticsRecorder();
      recorder.setScenarioLabel('  VoidLink\n\t native\u0000 touch  ');
      expect(recorder.scenarioLabel, 'VoidLink native touch');
      expect(
        recorder.serialize(),
        contains('"scenarioLabel": "VoidLink native touch"'),
      );

      recorder.setScenarioLabel('x' * 200);
      expect(
        recorder.scenarioLabel.length,
        InputDiagnosticsRecorder.maxScenarioLabelLength,
      );
      recorder.setScenarioLabel('');
      expect(recorder.serialize(), isNot(contains('scenarioLabel')));
      expect(InputDiagnosticsRecorder.sanitizeScenarioLabel(null), '');
    },
  );

  test(
    'clearing events preserves the session label until explicitly edited',
    () {
      final recorder = InputDiagnosticsRecorder()
        ..setScenarioLabel('Quest hand tracking')
        ..setEnabled(true);
      recorder.record(
        const InputDiagnosticEvent(
          kind: 'touch',
          category: 'pointerdown',
          buttonCount: 1,
          contactCount: 1,
          origin: 'webview',
        ),
      );
      recorder.clear();
      expect(recorder.events, isEmpty);
      expect(recorder.scenarioLabel, 'Quest hand tracking');
      recorder.setScenarioLabel('');
      expect(recorder.serialize(), isNot(contains('scenarioLabel')));
    },
  );

  test('build identity fields are additive, allowlisted, and partial-safe', () {
    final complete = InputDiagnosticsRecorder(
      buildIdentity: BuildIdentity(name: '1.0.0', number: '10'),
    )..setScenarioLabel('native touch');
    final completeReport =
        jsonDecode(complete.serialize()) as Map<String, dynamic>;
    expect(completeReport['appBuildName'], '1.0.0');
    expect(completeReport['appBuildNumber'], '10');
    expect(completeReport['scenarioLabel'], 'native touch');
    expect(complete.serialize(), isNot(contains('coordinates')));
    expect(complete.serialize(), isNot(contains('timestamp')));
    expect(complete.serialize(), isNot(contains('story')));
    expect(complete.serialize(), isNot(contains('key')));

    final nameOnly = InputDiagnosticsRecorder(
      buildIdentity: BuildIdentity(name: '1.0.0'),
    );
    final nameOnlyReport =
        jsonDecode(nameOnly.serialize()) as Map<String, dynamic>;
    expect(nameOnlyReport['appBuildName'], '1.0.0');
    expect(nameOnlyReport, isNot(contains('appBuildNumber')));

    final numberOnly = InputDiagnosticsRecorder(
      buildIdentity: BuildIdentity(number: '10'),
    );
    final numberOnlyReport =
        jsonDecode(numberOnly.serialize()) as Map<String, dynamic>;
    expect(numberOnlyReport['appBuildNumber'], '10');
    expect(numberOnlyReport, isNot(contains('appBuildName')));

    final absent = InputDiagnosticsRecorder(
      buildIdentity: const BuildIdentity.empty(),
    );
    final absentReport = jsonDecode(absent.serialize()) as Map<String, dynamic>;
    expect(absentReport, isNot(contains('appBuildName')));
    expect(absentReport, isNot(contains('appBuildNumber')));
  });

  test('bounded report contains exact privacy-safe metadata keys', () {
    final recorder = InputDiagnosticsRecorder(capacity: 2)..setEnabled(true);
    for (var index = 0; index < 4; index++) {
      recorder.record(
        const InputDiagnosticEvent(
          kind: 'mouse',
          category: 'click',
          buttonCount: 1,
          contactCount: 0,
          origin: 'chrome',
        ),
      );
    }
    expect(recorder.events, hasLength(2));
    final decoded = jsonDecode(recorder.serialize()) as Map<String, dynamic>;
    expect(decoded.keys.toSet(), <String>{
      'enabled',
      'eventCount',
      'summary',
      'recent',
    });
    final recent = decoded['recent'] as List<dynamic>;
    final event = recent.last as Map<String, dynamic>;
    expect(event.keys.toSet(), <String>{
      'kind',
      'category',
      'buttons',
      'contacts',
      'origin',
    });
    expect(event, isNot(contains('time')));
    expect(recorder.serialize(), isNot(contains('coordinates')));
    expect(recorder.serialize(), isNot(contains('story')));
  });

  test('pointer metadata counts button bits and active contacts', () {
    final recorder = InputDiagnosticsRecorder()..setEnabled(true);
    recorder.recordPointer(
      const PointerDownEvent(kind: PointerDeviceKind.touch, buttons: 3),
      category: 'pointerdown',
      origin: 'chrome',
    );
    expect(recorder.events.single.kind, 'touch');
    expect(recorder.events.single.category, 'pointerdown');
    expect(recorder.events.single.buttonCount, 2);
    expect(recorder.events, hasLength(1));
    expect(recorder.events.last.contactCount, 1);
  });

  test('mouse and trackpad metadata never reports touch contacts', () {
    final recorder = InputDiagnosticsRecorder()..setEnabled(true);
    recorder.recordPointer(
      const PointerDownEvent(kind: PointerDeviceKind.mouse),
      category: 'pointerdown',
      origin: 'chrome',
    );
    recorder.recordPointer(
      const PointerHoverEvent(kind: PointerDeviceKind.trackpad, pointer: 2),
      category: 'pointerdown',
      origin: 'chrome',
    );
    expect(recorder.events.map((event) => event.contactCount), [0, 0]);
  });

  test('disabling diagnostics clears active contacts before re-enable', () {
    final recorder = InputDiagnosticsRecorder()..setEnabled(true);
    recorder.recordPointer(
      const PointerDownEvent(kind: PointerDeviceKind.touch, pointer: 7),
      category: 'pointerdown',
      origin: 'chrome',
    );
    recorder.setEnabled(false);
    recorder.setEnabled(true);
    recorder.recordPointer(
      const PointerDownEvent(kind: PointerDeviceKind.touch, pointer: 8),
      category: 'pointerdown',
      origin: 'chrome',
    );
    expect(recorder.events, hasLength(2));
    expect(recorder.events.last.contactCount, 1);
  });

  test(
    'untrusted WebView metadata is allowlisted and pointer moves rejected',
    () {
      final recorder = InputDiagnosticsRecorder()..setEnabled(true);
      expect(
        InputDiagnosticEvent.fromWebViewMetadata(
          kind: 'story-secret',
          category: 'pointermove',
          buttons: 99,
          contacts: 99,
        ),
        isNull,
      );
      final unknown = InputDiagnosticEvent.fromWebViewMetadata(
        kind: 'story-secret',
        category: 'click',
        buttons: 0,
        contacts: 0,
      );
      expect(unknown?.kind, 'unknown');
      final safe = InputDiagnosticEvent.fromWebViewMetadata(
        kind: 'pen',
        category: 'click',
        buttons: 99,
        contacts: 99,
      );
      recorder.record(safe!);
      expect(recorder.events.single.kind, 'stylus');
      expect(recorder.events.single.buttonCount, 8);
      expect(recorder.events.single.contactCount, 10);
      expect(recorder.events.single.origin, 'webview');
    },
  );
}
