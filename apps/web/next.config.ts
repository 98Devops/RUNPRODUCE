import type { NextConfig } from 'next';

const config: NextConfig = {
  // The engine ships TypeScript source, not a build.
  transpilePackages: ['@runproduce/engine'],
  webpack(webpackConfig) {
    // The engine imports its own modules as `./x.js` (ESM, verbatimModuleSyntax).
    webpackConfig.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return webpackConfig;
  }
};

export default config;
