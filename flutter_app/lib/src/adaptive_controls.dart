import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'services/interaction_profile_store.dart';

double adaptiveTargetSize({
  required bool comfortable,
  bool highFrequency = false,
}) {
  if (!comfortable) return 36;
  return highFrequency ? 48 : 44;
}

int saveColumnCountForWidth(double width) => width >= 560 ? 2 : 1;

class ContextMenuIntent extends Intent {
  const ContextMenuIntent();
}

/// Shared tap, secondary-click, long-press and keyboard context-action seam.
class ContextActionSurface extends StatefulWidget {
  const ContextActionSurface({
    super.key,
    required this.child,
    required this.onMenu,
    this.onActivate,
    required this.semanticLabel,
  });

  final Widget child;
  final VoidCallback onMenu;
  final VoidCallback? onActivate;
  final String semanticLabel;

  @override
  State<ContextActionSurface> createState() => _ContextActionSurfaceState();
}

class _ContextActionSurfaceState extends State<ContextActionSurface> {
  var _showFocusHighlight = false;

  @override
  Widget build(BuildContext context) {
    return Shortcuts(
      shortcuts: <LogicalKeySet, Intent>{
        LogicalKeySet(LogicalKeyboardKey.shift, LogicalKeyboardKey.f10):
            const ContextMenuIntent(),
        LogicalKeySet(LogicalKeyboardKey.contextMenu):
            const ContextMenuIntent(),
      },
      child: FocusableActionDetector(
        mouseCursor: SystemMouseCursors.click,
        actions: <Type, Action<Intent>>{
          ContextMenuIntent: CallbackAction<ContextMenuIntent>(
            onInvoke: (_) {
              widget.onMenu();
              return null;
            },
          ),
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onActivate?.call();
              return null;
            },
          ),
        },
        onShowFocusHighlight: (value) {
          if (mounted && value != _showFocusHighlight) {
            setState(() => _showFocusHighlight = value);
          }
        },
        child: GestureDetector(
          onSecondaryTap: widget.onMenu,
          onLongPress: widget.onMenu,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            decoration: _showFocusHighlight
                ? BoxDecoration(
                    border: Border.all(
                      color: Theme.of(context).colorScheme.primary,
                      width: 2,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  )
                : null,
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                canRequestFocus: false,
                excludeFromSemantics: true,
                onTap: widget.onActivate,
                focusColor: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.12),
                hoverColor: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.06),
                child: Semantics(
                  container: true,
                  button: true,
                  label: widget.semanticLabel,
                  onTap: widget.onActivate,
                  onLongPress: widget.onMenu,
                  enabled: true,
                  child: widget.child,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class AdaptiveIconButton extends StatelessWidget {
  const AdaptiveIconButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.semanticLabel,
    this.highFrequency = false,
    this.minimumSize,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;
  final String? semanticLabel;
  final bool highFrequency;
  final double? minimumSize;

  @override
  Widget build(BuildContext context) {
    final controller = InteractionProfileScope.of(context);
    final comfortable = controller.isComfortable;
    final minimum =
        minimumSize ??
        adaptiveTargetSize(
          comfortable: comfortable,
          highFrequency: highFrequency,
        );
    return Semantics(
      container: true,
      button: true,
      label: semanticLabel ?? tooltip,
      enabled: onPressed != null,
      child: IconButton(
        onPressed: onPressed,
        tooltip: tooltip,
        icon: Icon(icon, size: 18),
        constraints: BoxConstraints(minWidth: minimum, minHeight: minimum),
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.standard,
        style: IconButton.styleFrom(
          minimumSize: Size(minimum, minimum),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    );
  }
}

class AdaptiveLabelButton extends StatelessWidget {
  const AdaptiveLabelButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.filled = false,
    this.highFrequency = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool filled;
  final bool highFrequency;

  @override
  Widget build(BuildContext context) {
    final controller = InteractionProfileScope.of(context);
    final comfortable = controller.isComfortable;
    final minimum = adaptiveTargetSize(
      comfortable: comfortable,
      highFrequency: highFrequency,
    );
    final colorScheme = Theme.of(context).colorScheme;
    final style = ButtonStyle(
      minimumSize: WidgetStatePropertyAll(Size(minimum, minimum)),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      padding: WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: comfortable ? 12 : 9, vertical: 6),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      backgroundColor: filled
          ? WidgetStatePropertyAll(colorScheme.secondaryContainer)
          : null,
    );
    final button = filled
        ? FilledButton.icon(
            onPressed: onPressed,
            style: style,
            icon: Icon(icon, size: comfortable ? 19 : 16),
            label: Text(label),
          )
        : TextButton.icon(
            onPressed: onPressed,
            style: style,
            icon: Icon(icon, size: comfortable ? 19 : 16),
            label: Text(label),
          );
    return button;
  }
}
