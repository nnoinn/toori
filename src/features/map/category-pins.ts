// 홈 지도의 업종별 핀 그림 (#204). 화면에서 쓴다. 화면 없이 테스트한다.
// 두 업종 모두 브랜드 색 핀이고, 안쪽 아이콘으로 구분한다(미용실 가위, 네일·속눈썹 반짝임).
// 색은 화면에서 테마 색 이름(--primary)을 읽어 넘긴다. 코드에 색 코드를 쓰지 않는다(conventions "화면 문구와 디자인").
// 아이콘 모양은 lucide(Scissors, Sparkles, ISC 라이선스)의 선을 그대로 쓴다.

import type { MapShop } from './types';

type Category = NonNullable<MapShop['category']>;

/** 24×24 칸 기준 아이콘 선 */
const ICONS: Record<Category, string> = {
  hair:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/>' +
    '<circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  nail_lash:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 ' +
    '9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 ' +
    '0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
};

/** 핀 그림 크기와 끝(좌표에 닿는 점) */
export const PIN_SIZE = { width: 32, height: 42 } as const;
export const PIN_TIP = { x: 16, y: 41 } as const;

/** 업종별 핀 그림(SVG를 data URL로). color는 테마 색 값(예: getComputedStyle의 --primary) */
export function categoryPinUrl(category: Category, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_SIZE.width}" height="${PIN_SIZE.height}" viewBox="0 0 32 42">` +
    `<path d="M16 41S2 28.2 2 16a14 14 0 0 1 28 0c0 12.2-14 25-14 25z" fill="${color}" stroke="white" stroke-width="2"/>` +
    '<circle cx="16" cy="16" r="10" fill="white"/>' +
    `<g transform="translate(8 8) scale(0.6667)" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">` +
    `${ICONS[category]}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
