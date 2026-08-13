import 'package:flutter/services.dart';

typedef InputLabFixtureLoader = Future<String> Function();

/// Loads the bundled, offline Input Lab fixture. The loader seam keeps the
/// launch path deterministic in widget/service tests without touching the
/// user's library or filesystem.
class InputLabService {
  InputLabService({InputLabFixtureLoader? loader})
    : _loader = loader ?? (() => rootBundle.loadString(assetPath));

  static const assetPath = 'assets/input_lab.html';

  final InputLabFixtureLoader _loader;

  Future<String> loadFixture() => _loader();
}
