'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatWon } from '@/lib/format';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';
import { cancelByOwnerFaultAsAdmin } from '@/server/refunds/admin-owner-fault-cancel';
import type { OwnerFaultCancelPreview } from '@/server/refunds/types';

// 운영자 예약 정보의 [원장님 사정으로 취소](#373 ③-2). 원장님이 직접 한 것과 같은 금액을 보여 주고, 사유(필수)를 받아 확인 창에서 한 번 더 확인한다.
// 성공하면 창을 닫고 화면을 새로 읽는다. 환불 결과를 기다리면(CANCEL_FINISHING) 문구를 보여 주고 화면도 새로 읽는다(진행 중으로 보인다)
export function OwnerFaultCancelAction({
  reservationId,
  preview,
  resuming,
}: {
  reservationId: string;
  preview: Pick<
    OwnerFaultCancelPreview,
    'refundAmount' | 'usedCouponAmount' | 'compensationCouponAmount' | 'penaltyAmount'
  >;
  resuming: boolean;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelByOwnerFaultAsAdmin({ reservationId, reason });
        if (!result.ok) {
          setError(result.error.message);
          if (result.error.code === 'CANCEL_FINISHING') router.refresh();
          return;
        }
        setOpen(false);
        setReason('');
        router.refresh();
      } catch {
        setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {resuming ? '원장님 사정 취소 이어서 하기' : '원장님 사정으로 취소'}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>원장님 대신 원장님 사정으로 취소할까요?</DialogTitle>
            <DialogDescription>
              원장님이 직접 한 것과 같아요. 되돌릴 수 없어요. 손님에게 취소 알림이, 원장님에게
              운영자가 취소했다는 알림이 가요.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">손님 환불</dt>
            <dd>{formatWon(preview.refundAmount)}(결제액 전부)</dd>
            <dt className="text-muted-foreground">손님이 쓴 쿠폰</dt>
            <dd>
              {preview.usedCouponAmount > 0
                ? `${formatWon(preview.usedCouponAmount)} 돌려줘요`
                : '없음'}
            </dd>
            <dt className="text-muted-foreground">손님 보상 쿠폰</dt>
            <dd>{formatWon(preview.compensationCouponAmount)}</dd>
            <dt className="text-muted-foreground">원장님 패널티</dt>
            <dd>{formatWon(preview.penaltyAmount)}(정산에서 빼요)</dd>
          </dl>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>사유</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={ADMIN_REASON_LIMIT}
              rows={3}
              placeholder="예: 원장님이 전화로 요청함(갑자기 영업을 못 하게 됨)"
            />
            <p className="text-xs text-muted-foreground">
              사유는 운영자 처리 기록에 남아요. 손님·원장님에게는 보이지 않아요.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              닫기
            </Button>
            <Button
              variant="destructive"
              onClick={submit}
              disabled={pending || reason.trim() === ''}
            >
              원장님 사정으로 취소
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
