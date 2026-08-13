import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/adaptive_controls.dart';

void main() {
  test('adaptive target sizing keeps comfortable controls touch friendly', () {
    expect(adaptiveTargetSize(comfortable: true), 44);
    expect(adaptiveTargetSize(comfortable: true, highFrequency: true), 48);
    expect(adaptiveTargetSize(comfortable: false), 36);
  });
}
