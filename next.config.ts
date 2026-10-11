import type { NextConfig } from 'next';

// 우리 Supabase 프로젝트 주소(.env.local / Vercel 환경변수)에서 호스트만 꺼낸다.
// 다른 프로젝트의 이미지까지 허용하면 남이 우리 이미지 최적화 사용량을 쓸 수 있어서 우리 것만 허용한다.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // 샵·스타일 이미지(Supabase Storage 공개 버킷)를 next/image로 보여준다
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
