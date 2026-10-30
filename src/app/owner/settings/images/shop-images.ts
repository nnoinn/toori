// 매장 설정 > 사진·링크 값과 입력 검사 (O6, S-104·S-105, #23 D6). 화면과 서버가 같이 쓴다.
// 파일 크기(5MB)와 형식은 정책값(UPLOAD_MAX_BYTES, UPLOAD_ALLOWED_TYPES)을 쓰고, 장수·줄이는 크기는 여기 한 곳에 둔다.

import { z } from 'zod';

import type { ShopImageKind } from '@/db/schema/shops';

export const SHOP_IMAGE_LIMITS = {
  /** 대표 사진 장수(D6) */
  main: 1,
  /** 스타일 사진 최대 장수(D6) */
  style: 10,
  /** 올리기 전에 브라우저에서 줄이는 긴 변(px, D6) */
  longSide: 1600,
} as const;

export const SHOP_IMAGE_KIND_LABELS: Record<ShopImageKind, string> = {
  main: '대표 사진',
  style: '스타일 사진',
};

export const SHOP_IMAGE_ERRORS = {
  NOT_FOUND: '사진을 찾을 수 없어요. 새로고침해 주세요',
  STYLE_LIMIT: `스타일 사진은 ${SHOP_IMAGE_LIMITS.style}장까지 올릴 수 있어요`,
  MENU_NOT_FOUND: '메뉴를 다시 골라 주세요',
} as const;

/** 올린 사진 정보 저장 입력. 경로가 내 샵 폴더인지는 서버가 assertShopImagePath로 따로 확인한다 */
export const shopImageInputSchema = z.object({
  // 화면에서도 쓰는 파일이라 스키마 파일의 값(SHOP_IMAGE_KINDS)은 가져오지 않고 타입으로 맞춘다
  kind: z.enum(['main', 'style'] as const satisfies readonly ShopImageKind[]),
  path: z.string().min(1).max(200),
});

/** 스타일 사진에 연결할 메뉴. null이면 연결하지 않음 */
export const imageMenuSchema = z.uuid().nullable();

// ---- 외부 링크 (S-105) ----

export type ShopLinkField = 'instagramUrl' | 'naverPlaceUrl';
export type ShopLinks = Record<ShopLinkField, string | null>;
export type ShopLinkErrors = Partial<Record<ShopLinkField, string>>;

const LINK_MAX_LENGTH = 300;

/** 칸마다 받는 주소(https, 이 도메인만) */
export const SHOP_LINK_RULES: Record<ShopLinkField, { label: string; hosts: readonly string[] }> = {
  instagramUrl: { label: '인스타그램', hosts: ['instagram.com', 'www.instagram.com'] },
  naverPlaceUrl: {
    label: '네이버 플레이스',
    hosts: ['naver.me', 'place.naver.com', 'm.place.naver.com', 'map.naver.com'],
  },
};

/** 링크 하나를 검사한다. 비우면 null(등록 안 함) */
function checkLink(
  field: ShopLinkField,
  raw: unknown,
): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined) return { value: null };
  if (typeof raw !== 'string') return { error: '주소를 다시 입력해 주세요' };
  const text = raw.trim();
  if (text === '') return { value: null };
  const rule = SHOP_LINK_RULES[field];
  const example = `https://${rule.hosts[0]}/...`;
  if (text.length > LINK_MAX_LENGTH) return { error: `${LINK_MAX_LENGTH}자 이하로 입력해 주세요` };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: `${example} 모양으로 입력해 주세요` };
  }
  if (url.protocol !== 'https:' || !rule.hosts.includes(url.hostname)) {
    return { error: `${rule.label} 주소만 넣을 수 있어요(${example})` };
  }
  return { value: url.toString() };
}

/** 외부 링크 두 칸을 검사한다. 둘 다 비워도 된다 */
export function validateShopLinks(
  input: unknown,
): { ok: true; data: ShopLinks } | { ok: false; fieldErrors: ShopLinkErrors } {
  const source = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const data: ShopLinks = { instagramUrl: null, naverPlaceUrl: null };
  const fieldErrors: ShopLinkErrors = {};
  for (const field of Object.keys(SHOP_LINK_RULES) as ShopLinkField[]) {
    const checked = checkLink(field, source[field]);
    if ('error' in checked) fieldErrors[field] = checked.error;
    else data[field] = checked.value;
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, data };
}
