import type { Metadata, Viewport } from 'next';

import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

// 글꼴 Pretendard(10/12 회의). 화면에 쓰인 글자 묶음만 내려받는 방식이라 첫 화면이 가볍다
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
