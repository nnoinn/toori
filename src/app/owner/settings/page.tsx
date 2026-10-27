import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: '매장 설정' };

// 매장 설정 첫 화면. 샵 정보(O2)부터 만들고 메뉴(O3)·사진·링크(O6)·정산 계좌(O7)는 만들 때 href를 채운다
const SECTIONS: { title: string; description: string; href?: string }[] = [
  {
    title: '샵 정보',
    description: '샵 이름, 업종, 전화번호, 주소, 영업시간, 서비스 설명',
    href: '/owner/settings/shop',
  },
  { title: '메뉴·가격표', description: '서비스 이름, 정가, 소요 시간' },
  { title: '사진·링크', description: '대표 사진, 스타일 사진, 인스타그램·네이버 플레이스' },
  { title: '정산 계좌', description: '정산금을 받을 계좌' },
];

export default function OwnerSettingsPage() {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">매장 설정</h1>
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {SECTIONS.map((section) => (
            <li key={section.title}>
              {section.href ? (
                <Link
                  href={section.href}
                  className="flex items-center gap-3 px-4 py-4 hover:bg-muted/60"
                >
                  <SectionText {...section} />
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-4 text-muted-foreground">
                  <SectionText {...section} />
                  <span className="text-xs">준비 중</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}

function SectionText({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </div>
  );
}
