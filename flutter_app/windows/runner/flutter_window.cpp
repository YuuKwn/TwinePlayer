#include "flutter_window.h"

#include <algorithm>
#include <optional>
#include <variant>

#include <windows.h>

#include "flutter/generated_plugin_registrant.h"

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  window_channel_ = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      flutter_controller_->engine()->messenger(), "twine_player/window",
      &flutter::StandardMethodCodec::GetInstance());
  window_channel_->SetMethodCallHandler(
      [this](const flutter::MethodCall<flutter::EncodableValue>& call,
             std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
        if (call.method_name() == "setFullscreen") {
          const auto* value = std::get_if<bool>(call.arguments());
          const bool enabled = value != nullptr && *value;
          result->Success(flutter::EncodableValue(SetFullscreen(enabled)));
          return;
        }
        result->NotImplemented();
      });
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  flutter_controller_->engine()->SetNextFrameCallback([&]() {
    this->Show();
  });

  // Flutter can complete the first frame before the "show window" callback is
  // registered. The following call ensures a frame is pending to ensure the
  // window is shown. It is a no-op if the first frame hasn't completed yet.
  flutter_controller_->ForceRedraw();

  return true;
}

void FlutterWindow::OnDestroy() {
  window_channel_.reset();
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

bool FlutterWindow::SetFullscreen(bool enabled) {
  HWND hwnd = GetHandle();
  if (!hwnd || enabled == is_fullscreen_) return is_fullscreen_;
  if (enabled) {
    previous_style_ = GetWindowLongPtr(hwnd, GWL_STYLE);
    previous_ex_style_ = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
    GetWindowRect(hwnd, &previous_rect_);
    const auto style = previous_style_ & ~(WS_CAPTION | WS_THICKFRAME |
                                            WS_MINIMIZE | WS_MAXIMIZE | WS_SYSMENU);
    const auto ex_style = previous_ex_style_ & ~(WS_EX_DLGMODALFRAME |
                                                  WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
    SetWindowLongPtr(hwnd, GWL_STYLE, style);
    SetWindowLongPtr(hwnd, GWL_EXSTYLE, ex_style);
    is_fullscreen_ = true;
    if (!ApplyFullscreenBounds()) {
      is_fullscreen_ = false;
      SetWindowLongPtr(hwnd, GWL_STYLE, previous_style_);
      SetWindowLongPtr(hwnd, GWL_EXSTYLE, previous_ex_style_);
      return false;
    }
  } else {
    SetWindowLongPtr(hwnd, GWL_STYLE, previous_style_);
    SetWindowLongPtr(hwnd, GWL_EXSTYLE, previous_ex_style_);
    RECT restored = previous_rect_;
    const LONG width = std::max<LONG>(1, restored.right - restored.left);
    const LONG height = std::max<LONG>(1, restored.bottom - restored.top);
    HMONITOR monitor = MonitorFromRect(&restored, MONITOR_DEFAULTTONEAREST);
    MONITORINFO monitor_info{sizeof(MONITORINFO)};
    if (monitor && GetMonitorInfo(monitor, &monitor_info)) {
      const LONG work_width = monitor_info.rcWork.right - monitor_info.rcWork.left;
      const LONG work_height = monitor_info.rcWork.bottom - monitor_info.rcWork.top;
      const LONG bounded_width = std::min(width, std::max<LONG>(1, work_width));
      const LONG bounded_height = std::min(height, std::max<LONG>(1, work_height));
      restored.left = std::clamp(restored.left, monitor_info.rcWork.left,
                                 monitor_info.rcWork.right - bounded_width);
      restored.top = std::clamp(restored.top, monitor_info.rcWork.top,
                                monitor_info.rcWork.bottom - bounded_height);
      restored.right = restored.left + bounded_width;
      restored.bottom = restored.top + bounded_height;
    }
    const BOOL moved = SetWindowPos(hwnd, nullptr, restored.left, restored.top,
                                    restored.right - restored.left,
                                    restored.bottom - restored.top,
                                    SWP_NOOWNERZORDER | SWP_FRAMECHANGED |
                                        SWP_SHOWWINDOW);
    is_fullscreen_ = false;
    if (!moved) return false;
  }
  return is_fullscreen_;
}

bool FlutterWindow::ApplyFullscreenBounds() {
  HWND hwnd = GetHandle();
  if (!hwnd || !is_fullscreen_) return false;
  MONITORINFO monitor_info{sizeof(MONITORINFO)};
  HMONITOR monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (!monitor || !GetMonitorInfo(monitor, &monitor_info)) return false;
  const RECT& bounds = monitor_info.rcMonitor;
  return SetWindowPos(hwnd, HWND_TOP, bounds.left, bounds.top,
                      bounds.right - bounds.left, bounds.bottom - bounds.top,
                      SWP_NOOWNERZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW) !=
      FALSE;
}

LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_DISPLAYCHANGE:
    case WM_DPICHANGED:
    case WM_EXITSIZEMOVE:
      // A monitor/DPI topology change can invalidate the old fullscreen
      // rectangle. Re-query the nearest monitor while fullscreen; windowed
      // DPI messages continue through Win32Window's suggested-rect handling.
      if (is_fullscreen_) {
        if (ApplyFullscreenBounds()) return 0;
      }
      break;
    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
