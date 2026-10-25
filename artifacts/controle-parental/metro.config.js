const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const blockedPaths = [
  /[\\/]__tests__[\\/].*/,
  /[\\/]node_modules[\\/]\.vite[\\/].*/,
  /[\\/]node_modules[\\/]\.pnpm[\\/].*_tmp_[\\/].*/,
];

config.resolver.blockList = new RegExp(blockedPaths.map((pattern) => pattern.source).join('|'));

module.exports = config;
