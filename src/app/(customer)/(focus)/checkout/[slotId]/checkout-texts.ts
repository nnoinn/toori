// 예약 확인 화면 문구 (J10, C-401·C-402). 동의 문구 3장(docs/legal/consent-texts.md, 법률 검토 전 임시 문구).
// 환불 규정 3구간과 앞뒤 안내는 매물 상세와 같은 함수(detail-format.ts)로 정책값에서 만든다.

import { SITE_NAME } from '@/lib/site';

/** 결제 버튼 바로 위 필수 동의 2개(C-402). 둘 다 체크해야 결제할 수 있다 */
export const REFUND_CONSENT_LABEL = '(필수) 환불 규정을 확인했고 동의해요';

export function bookerInfoConsentLabel(shopName: string): string {
  return `(필수) 예약자 정보를 ${shopName}에 제공하는 데 동의해요`;
}

/** 예약자 정보 제공 동의 "보기"(동의 문구 3-1) */
export function bookerInfoRows(shopName: string) {
  return [
    { label: '받는 곳', value: shopName },
    { label: '목적', value: '예약 확인, 방문 안내, 변경·취소 연락' },
    { label: '항목', value: '닉네임, 휴대폰 번호, 예약 내용' },
    { label: '받는 곳의 보유 기간', value: '예약한 서비스 이용이 끝날 때까지' },
  ];
}

export const BOOKER_INFO_REFUSAL_NOTE =
  '동의하지 않을 수 있어요. 다만 동의하지 않으면 예약할 수 없어요.';

/** 통신판매중개자 안내(동의 문구 3장 끝) */
export function intermediaryNotice(shopName: string): string {
  return `${SITE_NAME}는 통신판매중개자로서 서비스의 당사자가 아니에요. 서비스에 대한 책임은 ${shopName}에 있어요.`;
}
