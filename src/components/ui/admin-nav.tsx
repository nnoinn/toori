'use client';

import {
  BadgeCheck,
  CircleAlert,
  ClipboardList,
  MessageSquareWarning,
  ScrollText,
  Users,
  Wallet,
} from 'lucide-react';

import { SideNav } from '@/components/ui/side-nav';

// 운영자 메뉴. 주소는 강규민이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
// 아직 없는 화면은 잠가 둔다(누르면 404). 화면을 만들면 그 줄의 locked를 지운다
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
        { href: '/admin/payment-issues', label: '결제·환불 확인', icon: CircleAlert },
        { href: '/admin/settlements', label: '정산', icon: Wallet },
        { href: '/admin/logs', label: '운영자 기록', icon: ScrollText },
      ]}
    />
  );
}
