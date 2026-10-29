import { cookies } from 'next/headers';

import { MARKETING_NOTICE_COOKIE } from '@/server/auth/consent-notice';

import { MarketingConsentNotice } from './marketing-consent-notice';

/**
 * 가입 직후 안내 쿠키(#115)가 있는지만 안내 부품에 알려 준다. 쿠키가 없으면 화면이 열릴 때마다 서버 함수를 부르지 않는다.
 * 안내 부품은 늘 그려 둔다: 꺼내는 서버 함수가 쿠키를 지우면 Next.js가 레이아웃을 다시 그리는데,
 * 그때 부품을 빼면 막 보여준 안내가 바로 사라지기 때문이다.
 * 쿠키를 읽으므로 레이아웃에서 <Suspense> 안에 둔다(Cache Components)
 */
export async function ConsentNoticeGate() {
  const store = await cookies();
  return <MarketingConsentNotice pending={store.has(MARKETING_NOTICE_COOKIE)} />;
}
