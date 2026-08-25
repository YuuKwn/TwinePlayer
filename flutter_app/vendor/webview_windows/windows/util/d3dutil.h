#pragma once

#include <D3d11.h>

using D3D11CreateDeviceFunction = decltype(&D3D11CreateDevice);

inline HRESULT CreateD3DDevice(
    IDXGIAdapter* adapter, ID3D11Device** device,
    D3D11CreateDeviceFunction create_device = &D3D11CreateDevice) {
  if (adapter == nullptr || device == nullptr) {
    return E_INVALIDARG;
  }

  *device = nullptr;

  const UINT flags =
      D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;

  return create_device(adapter, D3D_DRIVER_TYPE_UNKNOWN, nullptr, flags,
                       nullptr, 0, D3D11_SDK_VERSION, device, nullptr,
                       nullptr);
}
