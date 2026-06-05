/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  devIndicators: false,
  productionBrowserSourceMaps: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  outputFileTracingRoot: path.join(__dirname, '../'),
  serverExternalPackages: ['sql.js', 'svg-captcha'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  transpilePackages: ['langium', 'vscode-jsonrpc', '@mermaid-js/parser'],
  turbopack: {
    resolveAlias: {
      'vscode-languageserver-types': '',
      'vscode-languageserver': '',
      'vscode-uri': '',
    },
  },
}

module.exports = nextConfig
