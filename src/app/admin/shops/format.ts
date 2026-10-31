// 입점 심사 화면 표시 모양 (A-101). 화면 코드에서만 쓰는 이름 바꾸기라 이 폴더에 둔다.

import type { PgSellerStatus } from '@/db/schema/shops';
import { BANKS, SHOP_CATEGORIES } from '@/server/policy';

/** 사업자등록번호 10자리 → 000-00-00000. 저장은 숫자 10자리(#117) */
export function formatBusinessNumber(digits: string): string {
  return /^\d{10}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    : digits;
}

export function labelBank(code: string): string {
  return BANKS.find((bank) => bank.code === code)?.name ?? code;
}

export function labelCategory(key: string): string {
  return SHOP_CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

const PG_SELLER_STATUS_LABELS: Record<PgSellerStatus, string> = {
  not_registered: '등록 전',
  requested: '등록 요청함',
  approved: '등록됨',
  rejected: '등록 거절',
};

/** PG 지급대행 셀러 등록 상태(W20에서 등록) */
export function labelPgSellerStatus(status: string): string {
  return PG_SELLER_STATUS_LABELS[status as PgSellerStatus] ?? status;
}

const REVIEW_ACTION_LABELS: Record<string, string> = {
  'shop.approve': '승인',
  'shop.reject': '반려',
};

/** 운영자 작업 기록(admin_actions.action)의 화면 이름 */
export function labelReviewAction(action: string): string {
  return REVIEW_ACTION_LABELS[action] ?? action;
}
