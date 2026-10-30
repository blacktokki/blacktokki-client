/* eslint-env node */
// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const path = require('path');

// Create the default Expo config for Metro
// This includes the automatic monorepo configuration for workspaces
// See: https://docs.expo.dev/guides/monorepos/#automatic-configuration
const config = getDefaultConfig(__dirname);

// Use turborepo to restore the cache when possible
config.cacheStores = [
  new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
];

// Use unminified ONNX bundles, including the WebGPU entry used by Transformers.js v4,
// to avoid the minified magic comment issue
// where /*webpackIgnore:true*/ without space fails Metro bundler check.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'onnxruntime-web' || moduleName === 'onnxruntime-web/webgpu') {
    const onnxDir = path.dirname(require.resolve('onnxruntime-web'));
    return {
      filePath: path.join(
        onnxDir,
        moduleName === 'onnxruntime-web/webgpu' ? 'ort.webgpu.js' : 'ort.all.js'
      ),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
