cmake_minimum_required(VERSION 3.15)

project(webview_windows_native_tests LANGUAGES CXX)

include(CTest)

if(NOT WIN32)
  message(FATAL_ERROR "webview_windows native tests require Windows")
endif()

add_executable(webview_windows_d3dutil_test d3dutil_test.cc)
target_compile_features(webview_windows_d3dutil_test PRIVATE cxx_std_17)
target_include_directories(webview_windows_d3dutil_test PRIVATE
  "${CMAKE_CURRENT_LIST_DIR}/.."
)

if(MSVC)
  target_compile_options(webview_windows_d3dutil_test PRIVATE /W4 /WX /EHsc)
endif()

target_link_libraries(webview_windows_d3dutil_test PRIVATE d3d11)

add_test(
  NAME webview_windows_d3dutil_test
  COMMAND webview_windows_d3dutil_test
)
