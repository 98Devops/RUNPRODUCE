import type { NextConfig } from 'next';

const config: NextConfig = {
  // U9 v1 one-off deploy only. The Netlify Next runtime's server handler breaks
  // when built on Windows (it bakes `\var\task` into an import path), and U9 v1
  // is `force-static`, so it ships as plain files. Unset, the build is the
  // normal AD-9 one.
  ...(process.env.RUNPRODUCE_STATIC_EXPORT === '1' ? { output: 'export' as const } : {}),
  // The engine ships TypeScript source, not a build.
  transpilePackages: ['@runproduce/engine'],
  webpack(webpackConfig) {
    // The engine imports its own modules as `./x.js` (ESM, verbatimModuleSyntax).
    webpackConfig.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return webpackConfig;
  }
};

export default config;
