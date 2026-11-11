import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // เว็บเรียก /api/* แล้ว Next.js ส่งต่อไปที่ NestJS → cookie เป็นของโดเมนเว็บเอง (first-party)
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  transpilePackages: ['@tembo/shared'],
};

export default nextConfig;
