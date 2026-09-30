import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // OAuth discovery for the MCP server (lib/oauth.ts): the well-known URLs clients look up
  async rewrites() {
    return [
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/metadata' },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/api/oauth/metadata' },
      { source: '/.well-known/openid-configuration', destination: '/api/oauth/metadata' },
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/resource?path=/mcp/account' },
      { source: '/.well-known/oauth-protected-resource/mcp', destination: '/api/oauth/resource?path=/mcp' },
      { source: '/.well-known/oauth-protected-resource/mcp/account', destination: '/api/oauth/resource?path=/mcp/account' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
