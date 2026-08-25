#include "util/d3dutil.h"

#include <iostream>

namespace {

struct CreateDeviceCall {
  int count = 0;
  IDXGIAdapter* adapter = nullptr;
  D3D_DRIVER_TYPE driver_type = D3D_DRIVER_TYPE_UNKNOWN;
  HMODULE software = nullptr;
  UINT flags = 0;
  const D3D_FEATURE_LEVEL* feature_levels = nullptr;
  UINT feature_level_count = 0;
  UINT sdk_version = 0;
};

CreateDeviceCall g_call;
HRESULT g_result = S_OK;

HRESULT WINAPI FakeD3D11CreateDevice(
    IDXGIAdapter* adapter, D3D_DRIVER_TYPE driver_type, HMODULE software,
    UINT flags, const D3D_FEATURE_LEVEL* feature_levels,
    UINT feature_level_count, UINT sdk_version, ID3D11Device** device,
    D3D_FEATURE_LEVEL* feature_level, ID3D11DeviceContext** immediate_context) {
  ++g_call.count;
  g_call.adapter = adapter;
  g_call.driver_type = driver_type;
  g_call.software = software;
  g_call.flags = flags;
  g_call.feature_levels = feature_levels;
  g_call.feature_level_count = feature_level_count;
  g_call.sdk_version = sdk_version;
  if (device != nullptr) {
    *device = nullptr;
  }
  if (feature_level != nullptr) {
    *feature_level = D3D_FEATURE_LEVEL_11_0;
  }
  if (immediate_context != nullptr) {
    *immediate_context = nullptr;
  }
  return g_result;
}

bool Check(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    return false;
  }
  return true;
}

bool TestAdapterAndDeviceArguments() {
  g_call = {};
  g_result = S_OK;
  auto* adapter = reinterpret_cast<IDXGIAdapter*>(0x1234);
  ID3D11Device* device = reinterpret_cast<ID3D11Device*>(0x5678);

  const HRESULT hr =
      CreateD3DDevice(adapter, &device, &FakeD3D11CreateDevice);
  return Check(SUCCEEDED(hr), "adapter-bound creation succeeds") &&
         Check(g_call.count == 1, "D3D11CreateDevice called once") &&
         Check(g_call.adapter == adapter, "exact adapter pointer is forwarded") &&
         Check(g_call.driver_type == D3D_DRIVER_TYPE_UNKNOWN,
               "non-null adapter uses UNKNOWN driver type") &&
         Check(g_call.software == nullptr, "software module is null") &&
         Check(g_call.flags == (D3D11_CREATE_DEVICE_BGRA_SUPPORT |
                                D3D11_CREATE_DEVICE_VIDEO_SUPPORT),
               "BGRA and VIDEO flags are preserved") &&
         Check(g_call.feature_levels == nullptr,
               "feature-level list remains unspecified") &&
         Check(g_call.feature_level_count == 0,
               "feature-level count remains zero") &&
         Check(g_call.sdk_version == D3D11_SDK_VERSION,
               "D3D11 SDK version is preserved") &&
         Check(device == nullptr, "fake leaves no device");
}

bool TestNullAdapterFailsClosed() {
  g_call = {};
  g_result = S_OK;
  ID3D11Device* device = nullptr;

  const HRESULT hr =
      CreateD3DDevice(nullptr, &device, &FakeD3D11CreateDevice);
  return Check(hr == E_INVALIDARG, "null adapter returns E_INVALIDARG") &&
         Check(g_call.count == 0, "null adapter does not call D3D11") &&
         Check(device == nullptr, "null adapter leaves device empty");
}

bool TestHRESULTPropagates() {
  g_call = {};
  g_result = DXGI_ERROR_UNSUPPORTED;
  auto* adapter = reinterpret_cast<IDXGIAdapter*>(0x4321);
  ID3D11Device* device = nullptr;

  const HRESULT hr =
      CreateD3DDevice(adapter, &device, &FakeD3D11CreateDevice);
  return Check(hr == DXGI_ERROR_UNSUPPORTED,
               "D3D11CreateDevice HRESULT is returned unchanged") &&
         Check(g_call.count == 1, "failure still makes one D3D11 call") &&
         Check(device == nullptr, "failed creation leaves device empty");
}

bool TestNullOutputFailsClosed() {
  g_call = {};
  g_result = S_OK;
  auto* adapter = reinterpret_cast<IDXGIAdapter*>(0x1111);

  const HRESULT hr =
      CreateD3DDevice(adapter, nullptr, &FakeD3D11CreateDevice);
  return Check(hr == E_INVALIDARG, "null device output returns E_INVALIDARG") &&
         Check(g_call.count == 0, "null device output does not call D3D11");
}

}  // namespace

int main() {
  return TestAdapterAndDeviceArguments() && TestNullAdapterFailsClosed() &&
                 TestHRESULTPropagates() && TestNullOutputFailsClosed()
             ? 0
             : 1;
}
