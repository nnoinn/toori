'use client';

import { LayoutDashboard, SquarePlus, Store, Wallet } from 'lucide-react';

import { SideNav } from '@/components/ui/side-nav';

type OwnerNavProps = {
  /** 입점 승인 전이면 false. '매물 등록'을 잠근다(S-102). 서버에서도 따로 막아야 한다 */
  canCreateSlot?: boolean;
};

// 원장님 메뉴(대시보드 / 매물 등록 / 매장 설정 / 정산). 주소는 정민석이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
export function OwnerNav({ canCreateSlot = true }: OwnerNavProps) {
  return (
    <SideNav
      title="원장님"
      rootHref="/owner"
      items={[
        { href: '/owner', label: '대시보드', icon: LayoutDashboard },
        {
          href: '/owner/slots/new',
          label: '매물 등록',
          icon: SquarePlus,
          locked: !canCreateSlot,
          lockedReason: '입점 승인 후에 등록할 수 있어요',
        },
        { href: '/owner/settings', label: '매장 설정', icon: Store },
        { href: '/owner/settlements', label: '정산', icon: Wallet },
      ]}
    />
  );
}
