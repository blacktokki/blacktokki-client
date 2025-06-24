const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('./node_modules/')) {
    return context.resolveRequest(context, moduleName.slice(15), platform);
  }
  if (moduleName.startsWith('./packages/')) {
    return context.resolveRequest(context, '../../' + moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
