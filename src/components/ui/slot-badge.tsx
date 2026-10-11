import { cn } from 'cn';

import { Badge } from '@/components/ui/badge';

/**
 * 매물 상태 배지 종류. 어떤 배지를 붙일지는 서버가 정책 설정값으로 판단해서 넘긴다(화면에서 시간 계산 금지).
 * - nonRefundable: 환불 불가 구간(시작까지 6시간 미만, C-308)
 * - imminent: 임박(시작까지 6시간 이내, C-203)
 * - newCustomerOnly: 신규 고객 전용(C-306)
 * - onHold: 다른 고객이 10분 홀딩 중(C-404)
 */
export type SlotBadgeKind = 'nonRefundable' | 'imminent' | 'newCustomerOnly' | 'onHold';

const LABEL: Record<SlotBadgeKind, string> = {
  nonRefundable: '환불 불가',
  imminent: '임박',
  newCustomerOnly: '신규 고객 전용',
  onHold: '다른 고객이 결제 중',
};

const STYLE: Record<SlotBadgeKind, string> = {
  nonRefundable: 'bg-destructive/10 text-destructive',
  imminent: 'bg-warning/25 text-warning-foreground',
  newCustomerOnly: 'border-border bg-background text-foreground',
  onHold: 'bg-muted text-muted-foreground',
};

export function SlotBadge({ kind, className }: { kind: SlotBadgeKind; className?: string }) {
  return <Badge className={cn(STYLE[kind], className)}>{LABEL[kind]}</Badge>;
}

/** 배지 여러 개를 정해진 순서(환불 불가 → 임박 → 신규 고객 전용 → 결제 중)로 보여준다 */
export function SlotBadges({ kinds, className }: { kinds: SlotBadgeKind[]; className?: string }) {
  if (kinds.length === 0) return null;
  const order: SlotBadgeKind[] = ['nonRefundable', 'imminent', 'newCustomerOnly', 'onHold'];
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {order
        .filter((kind) => kinds.includes(kind))
        .map((kind) => (
          <SlotBadge key={kind} kind={kind} />
        ))}
    </span>
  );
}
