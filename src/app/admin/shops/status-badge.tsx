import { Badge } from '@/components/ui/badge';
import type { ShopStatus } from '@/db/schema/shops';
import { SHOP_STATUS_LABELS } from '@/server/shops/status';

const VARIANTS = {
  pending: 'default',
  approved: 'secondary',
  rejected: 'destructive',
} as const satisfies Record<ShopStatus, 'default' | 'secondary' | 'destructive'>;

/** 입점 상태 배지. 승인 대기는 눈에 띄게(브랜드 색), 반려는 빨강 */
export function StatusBadge({ status }: { status: ShopStatus }) {
  return <Badge variant={VARIANTS[status]}>{SHOP_STATUS_LABELS[status]}</Badge>;
}
