#!/usr/bin/env node

const fs = require('fs');
const config = `const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  // Customize the config before returning it.
  if (!config.plugins) {
    config.plugins = [];
  }
  config.plugins.push(new BundleAnalyzerPlugin());
  return config;
};`;
fs.writeFileSync('webpack.config.js', config, 'utf8');
