(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TwinePlayerLiquidDomSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const isEnabledValue = (value) => {
    if (value === true) return true;
    if (typeof value !== 'string') return false;

    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  };

  const isLiquidDomEnabled = (flags = {}) => {
    if (!flags || typeof flags !== 'object') return false;
    return isEnabledValue(flags.enableLiquidDom) || isEnabledValue(flags.ENABLE_LIQUID_DOM);
  };

  const supportsLiquidDomHtml = (runtime = typeof globalThis !== 'undefined' ? globalThis : undefined) => {
    if (!runtime || typeof runtime !== 'object') {
      return false;
    }

    const navigatorRef = runtime.navigator;
    if (!navigatorRef || typeof navigatorRef !== 'object' || !('gpu' in navigatorRef)) {
      return false;
    }

    const queuePrototype = runtime.GPUQueue && runtime.GPUQueue.prototype;
    return Boolean(
      queuePrototype &&
      Object.prototype.hasOwnProperty.call(queuePrototype, 'copyElementImageToTexture')
    );
  };

  const getLiquidDomState = ({
    runtime = typeof globalThis !== 'undefined' ? globalThis : undefined,
    flags = {},
  } = {}) => {
    const enabled = isLiquidDomEnabled(flags);
    const supported = supportsLiquidDomHtml(runtime);

    return {
      enabled,
      supported,
      canUseLiquidDom: enabled && supported,
    };
  };

  return {
    getLiquidDomState,
    isLiquidDomEnabled,
    supportsLiquidDomHtml,
  };
});
