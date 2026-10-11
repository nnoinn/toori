'use client';

import { BadgeCheck, ClipboardList, MessageSquareWarning, Users, Wallet } from 'lucide-react';

import { SideNav } from '@/components/ui/side-nav';

// 운영자 메뉴. 주소는 강규민이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
export function AdminNav() {
  return (
    <SideNav
      title="운영자"
      rootHref="/admin"
      items={[
        { href: '/admin/shops', label: '입점 승인', icon: BadgeCheck },
        { href: '/admin/users', label: '회원', icon: Users },
        { href: '/admin/reservations', label: '매물·예약', icon: ClipboardList },
        { href: '/admin/disputes', label: '이의제기', icon: MessageSquareWarning },
        { href: '/admin/settlements', label: '정산', icon: Wallet },
      ]}
    />
  );
}
