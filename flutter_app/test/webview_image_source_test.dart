import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:twine_player_flutter/src/services/webview_image_source.dart';

void main() {
  test('maps twineplayer virtual host images to local file URLs', () {
    final gamePath = p.join('C:\\', 'Games', 'Story', 'game.html');
    final resolved = resolveWebViewImageSource(
      src: 'https://twineplayer.local/images/cover.png',
      gamePath: gamePath,
    );

    expect(resolved, startsWith('file:///'));
    expect(resolved, contains('/Games/Story/images/cover.png'));
  });

  test('leaves non-virtual image sources untouched', () {
    const src = 'data:image/png;base64,AAAA';

    expect(
      resolveWebViewImageSource(
        src: src,
        gamePath: p.join('C:\\', 'Games', 'Story', 'game.html'),
      ),
      src,
    );
  });

  test('rejects virtual host paths outside the game directory', () {
    const src = 'https://twineplayer.local/%2e%2e/secret.png';

    expect(
      resolveWebViewImageSource(
        src: src,
        gamePath: p.join('C:\\', 'Games', 'Story', 'game.html'),
      ),
      src,
    );
  });
}
