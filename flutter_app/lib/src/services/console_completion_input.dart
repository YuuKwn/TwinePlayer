bool inputLooksCompletable(String input) {
  final text = input.trimRight();
  if (text.isEmpty) return false;
  final token = RegExp(
    r'(^|[^0-9a-zA-Z_$])(([a-zA-Z_$][0-9a-zA-Z_$]*\.)*[a-zA-Z_$][0-9a-zA-Z_$]*\.?[0-9a-zA-Z_$]*)$',
  ).firstMatch(text)?.group(2);
  if (token == null) return false;
  if (token.contains('.')) return true;
  return token == text && token.length >= 2;
}
