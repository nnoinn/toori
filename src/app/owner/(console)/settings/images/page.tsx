import { Suspense } from 'react';
import type { Metadata } from 'next';

import { BackButton } from '@/components/ui/back-button';
import { ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { ensureOwnerPage } from '@/server/auth';
import { shopImageUrl } from '@/server/storage/browser';

import { selectMenus } from '../menu/menu-store';
import { ShopImagesManager } from './shop-images-manager';
import { selectShopImages, selectShopLinks } from './shop-images-store';
import { ShopLinksForm } from './shop-links-form';

export const metadata: Metadata = { title: '사진·링크' };

const PAGE_PATH = '/owner/settings/images';

// 매장 설정 > 사진·링크 (O6, S-104·S-105). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
export default function ShopImagesPage() {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/owner/settings" />
        <h1 className="text-xl font-bold">사진·링크</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        고객이 매물 목록과 상세 화면에서 보는 사진이에요. 대표 사진이 목록 카드에 나와요.
      </p>
      <Suspense fallback={<LoadingCards count={3} />}>
        <ShopImagesContent />
      </Suspense>
    </main>
  );
}

async function ShopImagesContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const db = getDb();
  const [images, links, menus] = await Promise.all([
    selectShopImages(db, auth.shopId),
    selectShopLinks(db, auth.shopId),
    selectMenus(db, auth.shopId),
  ]);
  if (!links) return <ErrorState description="샵을 찾을 수 없어요" />;

  return (
    <div className="flex flex-col gap-6">
      <ShopImagesManager
        shopId={auth.shopId}
        images={images.map((image) => ({
          id: image.id,
          kind: image.kind,
          url: shopImageUrl(image.storagePath),
          menuId: image.menuId,
        }))}
        menus={menus.map((menu) => ({ id: menu.id, name: menu.name, hidden: menu.hidden }))}
      />
      <ShopLinksForm shopId={auth.shopId} initial={links} />
    </div>
  );
}
