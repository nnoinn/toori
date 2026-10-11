import { NextResponse } from 'next/server';

// 화면 접근 보호(로그인·계정 종류 확인)는 강규민이 채운다(로드맵 W2).
// 지금은 그대로 통과시킨다. 이 파일은 Next.js 16의 proxy(예전 이름 middleware)다.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/owner/:path*', '/admin/:path*'],
};
