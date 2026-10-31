/* eslint-env node */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { native: { unstable_transformProfile: 'hermes-v0' } }]],
  };
};
