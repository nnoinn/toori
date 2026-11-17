'use client';

// 영업시간을 바꿔서 영업시간 밖이 되는 매물 확인 창 (11/16 정민석). [저장]을 눌렀을 때 서버가 목록(HoursChangeImpact)을 돌려주면 뜬다.
// - 마감할 매물이 있으면 "마감 처리하고 영업시간을 변경할까요?" [아니요] [네]. [네]를 누르면 그 매물을 마감(사유 '기타')하고 저장한다
// - 예약된 매물·손님이 결제 중인 매물은 마감할 수 없어서 그대로 둔다고 알린다. 그것만 있으면 [네]는 저장만 한다
// - [아니요]를 누르면 아무것도 저장하지 않고 창을 닫는다

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatEndTime, formatKst } from '@/lib/time';

import { type HoursChangeImpact, type HoursChangeItem, KEPT_REASON_LABELS } from './hours-change';

/** 한 줄 글자. 예: "11/18(수) 11:00 ~ 12:00 · 여성 커트" */
function itemText(item: HoursChangeItem): string {
  return `${formatKst(new Date(item.startAt))} ~ ${formatEndTime(item.startAt, item.endAt)} · ${item.label}`;
}

export function HoursChangeDialog({
  impact,
  pending,
  onCancel,
  onConfirm,
}: {
  /** 서버가 돌려준 목록. null이면 닫혀 있다 */
  impact: HoursChangeImpact | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const closing = impact?.close ?? [];
  const kept = impact?.kept ?? [];
  return (
    <Dialog open={impact !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {closing.length > 0
              ? '바꾼 영업시간 밖에 등록된 매물이 있어요'
              : '바꾼 영업시간 밖에 예약이 있어요'}
          </DialogTitle>
          <DialogDescription>
            {closing.length > 0
              ? `쉬는 날로 바꾸거나 줄인 시간에 이미 올린 매물 ${closing.length}개예요. 마감 처리하고 영업시간을 변경할까요?`
              : '예약된 매물은 마감할 수 없어서 그대로 둬요. 영업시간을 변경할까요?'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-4 overflow-y-auto text-sm">
          {closing.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h3 className="font-medium">마감할 매물 {closing.length}개</h3>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {closing.map((item) => (
                  <li key={item.id}>{itemText(item)}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {kept.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h3 className="font-medium">그대로 두는 매물 {kept.length}개</h3>
              <p className="text-muted-foreground">
                예약이 있거나 손님이 결제 중이라 마감하지 않아요. 예약대로 진행해 주세요.
              </p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {kept.map((item) => (
                  <li key={item.id}>
                    {itemText(item)} ({KEPT_REASON_LABELS[item.reason]})
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={pending}>
            아니요
          </Button>
          <Button
            type="button"
            variant={closing.length > 0 ? 'destructive' : 'default'}
            size="lg"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? '저장 중…' : '네'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
