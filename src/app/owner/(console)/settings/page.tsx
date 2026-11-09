import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/state';
import { ensureOwnerPage } from '@/server/auth';

import { OwnerPage } from '../owner-page';

export const metadata: Metadata = { title: '매장 설정' };

const PAGE_PATH = '/owner/settings';

// 매장 설정 첫 화면. 샵 정보(O2)·메뉴(O3)·사진·링크(O6)·사업자 정보·정산 계좌(O7 ②).
// 다른 원장님 화면처럼 로그인·원장님 계정 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
const SECTIONS: { title: string; description: string; href?: string }[] = [
  {
    title: '샵 정보',
    description: '샵 이름, 업종, 전화번호, 주소, 영업시간, 서비스 설명',
    href: '/owner/settings/shop',
  },
  {
    title: '메뉴·가격표',
    description: '서비스 이름, 정가, 소요 시간',
    href: '/owner/settings/menu',
  },
  {
    title: '사진·링크',
    description: '대표 사진, 스타일 사진, 인스타그램·네이버 플레이스',
    href: '/owner/settings/images',
  },
  {
    title: '사업자 정보',
    description:
      '상호, 대표자명, 사업자등록번호, 개업일자, 사업자등록증(승인 전까지 고칠 수 있어요)',
    href: '/owner/settings/business',
  },
  {
    title: '정산 계좌',
    description: '정산금을 받을 계좌',
    href: '/owner/settings/payout',
  },
];

export default function OwnerSettingsPage() {
  return (
    <OwnerPage title="매장 설정" width="narrow">
      <Suspense fallback={<LoadingCards count={1} />}>
        <SettingsSections />
      </Suspense>
    </OwnerPage>
  );
}

/** 설정 항목 목록. 원장님 계정이 없으면 목록 대신 가입 화면으로 보낸다 */
async function SettingsSections() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  await ensureOwnerPage(PAGE_PATH);
  return (
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
