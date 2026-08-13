import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/console_completion_input.dart';

void main() {
  test('requests completions for property access and identifier prefixes', () {
    expect(inputLooksCompletable('Su'), isTrue);
    expect(inputLooksCompletable('SugarCube'), isTrue);
    expect(inputLooksCompletable('SugarCube.'), isTrue);
    expect(inputLooksCompletable('SugarCube.State.va'), isTrue);
    expect(inputLooksCompletable('return SugarCube.State.'), isTrue);

    expect(inputLooksCompletable('S'), isFalse);
    expect(inputLooksCompletable('plain text'), isFalse);
    expect(inputLooksCompletable('1.'), isFalse);
    expect(inputLooksCompletable(''), isFalse);
  });
}
