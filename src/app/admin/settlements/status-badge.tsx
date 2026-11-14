// 정산서 상태 배지 (A-105). 목록과 정산서 한 장, 샵별 정산서 목록이 같이 쓴다.

import { Badge } from '@/components/ui/badge';
import type { SettlementStatementStatus } from '@/server/settlements/types';

import { STATEMENT_STATUS_LABELS } from './format';

const STATUS_VARIANTS: Record<
  SettlementStatementStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'ghost'
> = {
  scheduled: 'ghost',
  pending: 'default',
  requested: 'outline',
  paid: 'secondary',
  failed: 'destructive',
};

export function StatusBadge({ status }: { status: SettlementStatementStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATEMENT_STATUS_LABELS[status]}</Badge>;
}
