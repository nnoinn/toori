// 정산 묶음 상태 배지 (A-105). 목록과 정산서 한 장이 같이 쓴다.

import { Badge } from '@/components/ui/badge';
import type { SettlementStatus } from '@/db/schema/settlements';

import { SETTLEMENT_STATUS_LABELS } from './format';

const STATUS_VARIANTS: Record<
  SettlementStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'default',
  requested: 'outline',
  paid: 'secondary',
  failed: 'destructive',
};

export function StatusBadge({ status }: { status: SettlementStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{SETTLEMENT_STATUS_LABELS[status]}</Badge>;
}
