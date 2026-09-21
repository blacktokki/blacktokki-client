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

// Alias onnxruntime-web to unminified ort.all.js to avoid minified magic comment issue
// where /*webpackIgnore:true*/ without space fails Metro bundler check.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'onnxruntime-web') {
    const onnxDir = path.dirname(require.resolve('onnxruntime-web'));
    return {
      filePath: path.join(onnxDir, 'ort.all.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
