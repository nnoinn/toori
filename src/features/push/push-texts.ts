// 푸시 권한 안내 문구 (J14, C-601·C-602). 예약 완료 화면과 내 정보 > 알림이 같이 쓴다.
// 서비스 이름은 SITE_NAME에서 가져온다(conventions "화면 문구와 디자인").

import { SITE_NAME } from '@/lib/site';

/** 이 브라우저에서는 웹 푸시를 받을 수 없다 */
export const PUSH_UNSUPPORTED = '이 브라우저에서는 알림을 받을 수 없어요.';

/** 알림 권한을 막아 뒀다. 사이트가 다시 물을 수 없어서 브라우저 설정에서 허용해야 한다 */
export const PUSH_BLOCKED =
  '알림이 막혀 있어요. 브라우저 설정에서 이 사이트의 알림을 허용한 뒤 다시 눌러 주세요.';

/** 권한 창을 닫았을 때 */
export const PUSH_DISMISSED = '알림을 허용하면 받을 수 있어요.';

/** 아이폰·아이패드는 홈 화면에 추가한 앱에서만 웹 푸시를 받는다(iOS 16.4 이상) */
export const IOS_INSTALL_NOTE = `아이폰은 ${SITE_NAME}를 홈 화면에 추가해야 알림을 받을 수 있어요.`;

export const IOS_INSTALL_STEPS = [
  '사파리 아래쪽의 공유 버튼을 눌러요',
  "'홈 화면에 추가'를 눌러요",
  `홈 화면의 ${SITE_NAME}를 열고 내 정보 > 알림에서 알림을 켜요`,
] as const;
