const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getLiquidDomState,
  isLiquidDomEnabled,
  supportsLiquidDomHtml,
} = require('../src/shared/liquid-dom-support');

test('supportsLiquidDomHtml returns false outside a browser runtime', () => {
  assert.equal(supportsLiquidDomHtml(undefined), false);
});

test('supportsLiquidDomHtml requires WebGPU and HTML-in-Canvas capture support', () => {
  assert.equal(supportsLiquidDomHtml({ navigator: {} }), false);
  assert.equal(supportsLiquidDomHtml({ navigator: { gpu: {} } }), false);

  const runtime = {
    navigator: { gpu: {} },
    GPUQueue: function GPUQueue() {},
  };
  runtime.GPUQueue.prototype.copyElementImageToTexture = () => {};

  assert.equal(supportsLiquidDomHtml(runtime), true);
});

test('isLiquidDomEnabled only enables explicit opt-in values', () => {
  assert.equal(isLiquidDomEnabled(), false);
  assert.equal(isLiquidDomEnabled({ enableLiquidDom: false }), false);
  assert.equal(isLiquidDomEnabled({ enableLiquidDom: true }), true);
  assert.equal(isLiquidDomEnabled({ ENABLE_LIQUID_DOM: '1' }), true);
  assert.equal(isLiquidDomEnabled({ ENABLE_LIQUID_DOM: 'yes' }), true);
  assert.equal(isLiquidDomEnabled({ ENABLE_LIQUID_DOM: '0' }), false);
});

test('getLiquidDomState requires both feature support and the kill switch', () => {
  const runtime = {
    navigator: { gpu: {} },
    GPUQueue: function GPUQueue() {},
  };
  runtime.GPUQueue.prototype.copyElementImageToTexture = () => {};

  assert.deepEqual(getLiquidDomState({ runtime, flags: { enableLiquidDom: false } }), {
    enabled: false,
    supported: true,
    canUseLiquidDom: false,
  });

  assert.deepEqual(getLiquidDomState({ runtime, flags: { enableLiquidDom: true } }), {
    enabled: true,
    supported: true,
    canUseLiquidDom: true,
  });
});
