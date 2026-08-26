import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/build_identity.dart';

void main() {
  test(
    'formats complete, partial, and absent identities deterministically',
    () {
      final complete = BuildIdentity(name: '1.0.0', number: '10');
      expect(complete.display, '1.0.0+10');
      expect(complete.isEmpty, isFalse);

      expect(BuildIdentity(name: '1.0.0').display, '1.0.0');
      expect(BuildIdentity(number: '10').display, 'build number 10');

      final empty = const BuildIdentity.empty();
      expect(empty.display, 'unavailable');
      expect(empty.isEmpty, isTrue);
      expect(BuildIdentity(name: null, number: '').display, 'unavailable');
    },
  );

  test('trims valid values and rejects unsafe or invalid values', () {
    final identity = BuildIdentity(name: '  1.0.0-rc.1  ', number: ' 42 ');
    expect(identity.name, '1.0.0-rc.1');
    expect(identity.number, '42');

    expect(BuildIdentity(name: '1.0.0\nrc.1').name, isNull);
    expect(BuildIdentity(name: r'C:\stories\fixture.html').name, isNull);
    expect(BuildIdentity(name: '1.0.0 beta').name, isNull);
    expect(BuildIdentity(name: 'x' * 64).name, 'x' * 64);
    expect(BuildIdentity(name: 'x' * 65).name, isNull);
    expect(BuildIdentity(number: '9' * 64).number, '9' * 64);
    expect(BuildIdentity(number: '9' * 65).number, isNull);
  });

  test(
    'fromFlutter maps the compile-time Flutter values through normalization',
    () {
      final identity = BuildIdentity.fromFlutter();
      final expected = BuildIdentity(
        name: appBuildName,
        number: appBuildNumber,
      );

      expect(identity.name, expected.name);
      expect(identity.number, expected.number);
      expect(identity.display, expected.display);
    },
  );
}
