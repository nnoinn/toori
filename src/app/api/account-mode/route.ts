// 서비스 워커가 지금 계정(고객/원장님 모드)을 묻는 주소 (W16, #131). 모드 쿠키는 스크립트가 읽지 못해서 서버가 대신 읽어 준다.
// 이 브라우저의 쿠키 값만 돌려주고 로그인 정보는 보지 않는다. 다른 계정의 알림을 흑백 아이콘과 계정 이름으로 보여줄 때 쓴다(public/sw.js).

import { cookies } from 'next/headers';

import { ACCOUNT_MODE_COOKIE, parseAccountMode } from '@/server/auth/account-mode';

export async function GET() {
  const mode = parseAccountMode((await cookies()).get(ACCOUNT_MODE_COOKIE)?.value);
  return Response.json({ mode }, { headers: { 'Cache-Control': 'no-store' } });
}
