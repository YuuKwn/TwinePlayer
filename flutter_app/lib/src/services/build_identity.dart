import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// The bounded, privacy-safe identity of the compiled application.
///
/// The values are compile-time Flutter build metadata, never runtime paths,
/// story data, or user-entered diagnostics. Invalid values are omitted rather
/// than truncated so the UI never presents a shortened value as authoritative.
@immutable
class BuildIdentity {
  BuildIdentity({String? name, String? number})
    : name = _normalize(name),
      number = _normalize(number);

  const BuildIdentity.empty() : name = null, number = null;

  factory BuildIdentity.fromFlutter() =>
      BuildIdentity(name: appBuildName, number: appBuildNumber);

  static const int maxPartLength = 64;
  static final RegExp _controlCharacter = RegExp(r'[\x00-\x1F\x7F]');
  static final RegExp _allowedPart = RegExp(
    r'^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$',
  );

  final String? name;
  final String? number;

  bool get isEmpty => name == null && number == null;

  String get display {
    if (name != null && number != null) return '$name+$number';
    if (name != null) return name!;
    if (number != null) return 'build number $number';
    return 'unavailable';
  }

  Map<String, String> get reportFields => <String, String>{
    'appBuildName': ?name,
    'appBuildNumber': ?number,
  };

  static String? _normalize(String? value) {
    if (value == null || _controlCharacter.hasMatch(value)) return null;
    final normalized = value.trim();
    if (normalized.isEmpty || normalized.length > maxPartLength) return null;
    return _allowedPart.hasMatch(normalized) ? normalized : null;
  }
}
