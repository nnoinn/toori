// 업종·서비스 종류 목록 (연결 #5, Issue #48 7장, docs/schema-v1.md 2장).
// DB 값 제한(check)과 화면(필터·메뉴 등록)이 같은 목록을 쓰도록 여기 한 곳에만 둔다.
// 화면('use client')에서도 가져다 쓰므로 server-only 표시를 하지 않는다. DB·비밀 키를 쓰는 코드를 넣지 않는다.

/** 업종. key는 DB(shops.category)·주소창에, label은 화면에 쓴다 */
export const SHOP_CATEGORIES = [
  { key: 'hair', label: '미용실' },
  { key: 'nail_lash', label: '네일·속눈썹' },
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number]['key'];

/** 업종별 서비스 종류. key는 DB(menus.service_type, slots.service_type)·필터에, label은 화면에 쓴다 */
export const SERVICE_TYPES_BY_CATEGORY = {
  hair: [
    { key: 'cut', label: '커트' },
    { key: 'perm', label: '펌' },
    { key: 'color', label: '염색' },
    { key: 'clinic', label: '클리닉' },
    { key: 'hair_other', label: '기타' },
  ],
  nail_lash: [
    { key: 'gel_nail', label: '젤네일' },
    { key: 'nail_care', label: '케어' },
    { key: 'pedicure', label: '페디' },
    { key: 'lash_extension', label: '속눈썹 연장' },
    { key: 'lash_perm', label: '속눈썹 펌' },
    { key: 'nail_lash_other', label: '기타' },
  ],
} as const satisfies Record<ShopCategory, readonly { key: string; label: string }[]>;

export type ServiceType = (typeof SERVICE_TYPES_BY_CATEGORY)[ShopCategory][number]['key'];

/** 업종 key 목록 (DB check용) */
export const SHOP_CATEGORY_KEYS: readonly ShopCategory[] = SHOP_CATEGORIES.map((c) => c.key);

/** 모든 업종의 서비스 종류 key 목록 (DB check용) */
export const SERVICE_TYPE_KEYS: readonly ServiceType[] = Object.values(
  SERVICE_TYPES_BY_CATEGORY,
).flatMap((types) => types.map((t) => t.key));
