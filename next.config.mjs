import withPWA from 'next-pwa';

const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const baseConfig = {
  images: {
    remotePatterns: []
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // The compliance preview frames the owner's own PDF inside the app.
        // Same origin only; listed after the rule above so it overrides it.
        source: '/api/images/compliance/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default withPWA({
  dest: 'public',
  disable: !isProd,
  register: true,
  skipWaiting: true
})(baseConfig);
