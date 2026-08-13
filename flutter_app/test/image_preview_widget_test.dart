import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';
import 'package:twine_player_flutter/src/twine_player_app.dart';

void main() {
  const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  testWidgets('image preview exposes touch-safe transform controls', (
    tester,
  ) async {
    final controller = InteractionProfileController(
      store: InteractionProfileStore(File('image-preview-preferences.json')),
      initial: InteractionProfile.comfortable,
    );
    await tester.pumpWidget(
      InteractionProfileScope(
        notifier: controller,
        child: const MaterialApp(
          home: ImagePreviewDialog(src: image, alt: 'Fixture image'),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    for (final tooltip in [
      'Zoom in image',
      'Zoom out image',
      'Reset image zoom',
      'Close preview',
    ]) {
      expect(
        tester.getSize(find.byTooltip(tooltip)).height,
        greaterThanOrEqualTo(44),
      );
    }
    final viewer = find.byType(InteractiveViewer);
    final transformation = tester
        .widget<InteractiveViewer>(viewer)
        .transformationController!;
    expect(transformation.value.getMaxScaleOnAxis(), 1);

    await tester.tap(find.byTooltip('Zoom in image'));
    await tester.pump();
    expect(transformation.value.getMaxScaleOnAxis(), greaterThan(1));
    await tester.tap(find.byTooltip('Reset image zoom'));
    await tester.pump();
    expect(transformation.value.getMaxScaleOnAxis(), 1);
  });

  testWidgets('double-tap zoom stays off until explicitly enabled', (
    tester,
  ) async {
    final controller = InteractionProfileController(
      store: InteractionProfileStore(File('image-preview-preferences.json')),
      initial: InteractionProfile.comfortable,
    );
    await tester.pumpWidget(
      InteractionProfileScope(
        notifier: controller,
        child: const MaterialApp(
          home: ImagePreviewDialog(src: image, alt: 'Fixture image'),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    final viewer = find.byType(InteractiveViewer);
    final transformation = tester
        .widget<InteractiveViewer>(viewer)
        .transformationController!;
    await tester.tapAt(const Offset(400, 330));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tapAt(const Offset(400, 330));
    await tester.pump();
    expect(transformation.value.getMaxScaleOnAxis(), 1);

    await tester.tap(find.byTooltip('Enable double-tap zoom'));
    await tester.pump();
    await tester.tapAt(const Offset(400, 330));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tapAt(const Offset(400, 330));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(transformation.value.getMaxScaleOnAxis(), greaterThan(1));
  });
}
