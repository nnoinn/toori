// 푸시 권한 안내 문구 (J14·O12, C-601·C-602·S-404). 예약 완료 화면, 고객 내 정보 > 알림, 원장님 내 계정이 같이 쓴다.
// 서비스 이름은 SITE_NAME에서 가져온다(conventions "화면 문구와 디자인").

import { SITE_NAME } from '@/lib/site';
import { REMINDER_MINUTES_BEFORE } from '@/server/policy';

import { formatReminderTimes } from './push-support';

/** 이 브라우저에서는 웹 푸시를 받을 수 없다 */
export const PUSH_UNSUPPORTED = '이 브라우저에서는 푸시 알림을 받을 수 없어요.';

/** 알림 권한을 막아 뒀다. 사이트가 다시 물을 수 없어서 브라우저 설정에서 허용해야 한다(허용하면 화면이 바로 바뀐다) */
export const PUSH_BLOCKED =
  '푸시 알림이 막혀 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.';

/** 권한 창을 닫았을 때 */
export const PUSH_DISMISSED = '알림을 허용하면 푸시 알림을 받을 수 있어요.';

/** 아이폰·아이패드는 홈 화면에 추가한 앱에서만 웹 푸시를 받는다(iOS 16.4 이상) */
export const IOS_INSTALL_NOTE = `아이폰은 ${SITE_NAME}를 홈 화면에 추가해야 푸시 알림을 받을 수 있어요.`;

export const IOS_INSTALL_STEPS = [
  '사파리 아래쪽의 공유 버튼을 눌러요',
  "'홈 화면에 추가'를 눌러요",
  `홈 화면의 ${SITE_NAME}를 열고 내 정보 > 알림에서 푸시 알림을 켜요`,
] as const;

/** 고객 내 정보 > 알림의 스위치 설명. 고객이 받는 알림(예약 확정, 리마인드, 관심 동네·찜한 샵 새 매물) */
export const CUSTOMER_PUSH_DESCRIPTION = `예약 확정과 ${formatReminderTimes(REMINDER_MINUTES_BEFORE)} 알림, 관심 동네·찜한 샵 새 매물 알림을 이 기기로 받아요.`;

/** 원장님 내 계정의 스위치 설명(O12, S-404, #307). 원장님이 받는 알림(src/server/notifications/alerts.ts의 원장님 알림) */
export const OWNER_PUSH_DESCRIPTION =
  '새 예약, 고객 예약 취소(같은 매물 다시 올리기 안내), 입점 승인·반려, 정산 계좌 변경 알림을 이 기기로 받아요.';

/** 원장님 아이폰 홈 화면 추가 방법. 마지막 줄만 알림을 켜는 곳(원장님 내 계정)으로 바꾼다 */
export const OWNER_IOS_INSTALL_STEPS = [
  IOS_INSTALL_STEPS[0],
  IOS_INSTALL_STEPS[1],
  `홈 화면의 ${SITE_NAME}를 열고 원장님으로 로그인한 뒤 내 계정에서 알림을 켜요`,
] as const;
