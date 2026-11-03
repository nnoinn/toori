import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Heart, List, Map as MapIcon } from 'lucide-react';

export const metadata: Metadata = { title: '홈' };

/** 고객 홈에서 골라 들어가는 탐색 방법(#215, 기술 가이드 7장 "홈과 메뉴" 순서) */
const WAYS = [
  {
    href: '/home/list',
    icon: List,
    title: '매물 목록',
    description: '고른 동네의 임박 할인 매물을 목록으로 봐요. 필터와 정렬로 골라 볼 수 있어요.',
  },
  {
    href: '/home/favorites',
    icon: Heart,
    title: '찜한 샵 매물',
    description: '찜한 샵에 올라온 매물만 모아 봐요. 로그인하면 볼 수 있어요.',
  },
  {
    href: '/home/map',
    icon: MapIcon,
    title: '지도',
    description: '지도에서 가까운 샵과 매물을 찾아요. 지도를 옮기면 그 자리의 매물이 나와요.',
  },
] as const;

// 고객 홈 = 탐색 방법 고르기 (#215 2장, 11/2 nnoinn). 주소: /home
// 매물 목록(/home/list)·찜한 샵 매물(/home/favorites)·지도(/home/map) 중 골라 들어간다.
// 이 화면은 로그인하지 않아도 볼 수 있다(#215 댓글). 찜한 샵 매물만 들어갈 때 로그인 화면을 거친다
export default function CustomerHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">어떻게 찾아볼까요?</h1>
        <p className="text-sm text-muted-foreground">
          취소·빈 시간이 생긴 매물을 할인된 가격으로 예약해요.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {WAYS.map(({ href, icon: Icon, title, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full items-start gap-4 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/60"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex items-center justify-between font-semibold">
                  {title}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
