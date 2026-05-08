/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  devIndicators: false,
  productionBrowserSourceMaps: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  outputFileTracingRoot: path.join(__dirname, '../'),
  experimental: {
    // appDir: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  transpilePackages: ['langium', 'vscode-languageserver-types', 'vscode-languageserver', 'vscode-uri', '@mermaid-js/parser'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
      config.resolve.alias = {
        ...config.resolve.alias,
        'vscode-languageserver-types': false,
        'vscode-languageserver': false,
        'vscode-uri': false,
      }
    }
    return config
  },
}

module.exports = nextConfig