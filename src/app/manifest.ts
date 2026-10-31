import type { MetadataRoute } from 'next';

import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

// PWA 설정. 홈 화면 아이콘은 흰 바탕 로고(라이트, public/brand/web/). 정사각형이고 글자가 가운데 안전 영역 안이라 maskable로도 쓴다.
// 다크(검정 바탕) 아이콘으로 바꾸려면 파일 이름의 light를 dark로 바꾼다(docs/brand.md).
const ICON = '/brand/web/pwa-icon-light';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f4f6',
    theme_color: '#ffffff',
    lang: 'ko',
    icons: [192, 512].flatMap((size) =>
      (['any', 'maskable'] as const).map((purpose) => ({
        src: `${ICON}-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose,
      })),
    ),
  };
}
