/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@dct-crm/db', '@dct-crm/shared'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'zod$': require.resolve('zod'),
    };
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    const configuredDialpadUrl = new URL(process.env.DIALPAD_URL || 'https://bizcall.cxteletech.com/embed/dialpad');
    if (process.env.NODE_ENV === 'production' && configuredDialpadUrl.protocol !== 'https:') {
      throw new Error('DIALPAD_URL must use HTTPS in production.');
    }
    const dialpadOrigin = configuredDialpadUrl.origin;
    return [{
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: `frame-src 'self' blob: ${dialpadOrigin}`,
        },
        {
          key: 'Permissions-Policy',
          value: `microphone=(self "${dialpadOrigin}")`,
        },
      ],
    }];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL
      || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:3001' : '');
    const destination = backendUrl
      ? `${backendUrl.replace(/\/+$/, '')}/api/:path*`
      : '/api/proxy/api/:path*';

    return {
      beforeFiles: [],
      afterFiles: [{ source: '/api/:path((?!proxy).*)', destination }],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
