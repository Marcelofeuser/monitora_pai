const { getDefaultConfig } = require('expo/metro-config');
const { exclusionList } = require('metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = exclusionList([
  /[\\/]node_modules[\\/]\.vite[\\/].*/,
  /[\\/]node_modules[\\/]\.pnpm[\\/].*_tmp_[\\/].*/,
]);

module.exports = config;
