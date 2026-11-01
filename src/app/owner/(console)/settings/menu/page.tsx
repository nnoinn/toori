import { Suspense } from 'react';
import type { Metadata } from 'next';

import { BackButton } from '@/components/ui/back-button';
import { ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { ensureOwnerPage } from '@/server/auth';

import { MenuManager } from './menu-manager';
import { selectMenus, selectShopCategory } from './menu-store';

export const metadata: Metadata = { title: '메뉴·가격표' };

const PAGE_PATH = '/owner/settings/menu';

// 매장 설정 > 메뉴·가격표 (O3, S-106). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
export default function MenuPage() {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/owner/settings" />
        <h1 className="text-xl font-bold">메뉴·가격표</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        미리 등록해 두면 매물을 올릴 때 메뉴를 고르고 시간·할인율만 정하면 돼요. 메뉴를 고쳐도 이미
        올린 매물은 그대로예요.
      </p>
      <Suspense fallback={<LoadingCards count={3} />}>
        <MenuContent />
      </Suspense>
    </main>
  );
}

async function MenuContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const db = getDb();
  const [category, menus] = await Promise.all([
    selectShopCategory(db, auth.shopId),
    selectMenus(db, auth.shopId),
  ]);
  if (!category) return <ErrorState description="샵을 찾을 수 없어요" />;
  return <MenuManager shopId={auth.shopId} category={category} menus={menus} />;
}
