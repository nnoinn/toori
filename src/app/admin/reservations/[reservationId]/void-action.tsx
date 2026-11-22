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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatWon } from '@/lib/format';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';
import type { VoidPreview } from '@/server/refunds/types';
import { VOID_ERRORS } from '@/server/refunds/void-errors';
import { previewVoidReservation, voidReservation } from '@/server/refunds/void-reservation';

// 운영자 예약 상세의 [예약 무효](A-108, #423). 원장님이 손님에게 전액 환불을 요청했을 때만 쓴다.
// 창을 열면 서버가 계산한 금액(previewVoidReservation)을 보여 주고, 원장님이 요청한 내용(필수)을 받아 무효로 한다.
// 화면은 금액을 계산하지 않는다. 성공하면 창을 닫고 화면을 새로 읽는다
export function VoidAction({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const requestId = useId();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<VoidPreview | null>(null);
  const [ownerRequest, setOwnerRequest] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [pending, startSubmit] = useTransition();

  function openDialog() {
    setOpen(true);
    setPreview(null);
    setError(null);
    startLoading(async () => {
      try {
        const result = await previewVoidReservation(reservationId);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setPreview(result.data);
      } catch {
        setError('금액을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  }

  function submit() {
    setError(null);
    startSubmit(async () => {
      try {
        const result = await voidReservation({ reservationId, ownerRequest });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setOpen(false);
        setOwnerRequest('');
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

  const blocked = preview && !preview.voidable && preview.blockReason;

  return (
    <>
      <Button variant="outline" className="self-start" onClick={openDialog}>
        예약 무효
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 예약을 무효로 할까요?</DialogTitle>
            <DialogDescription>
              원장님이 손님에게 전액 환불을 요청했을 때만 써요. 손님에게 아직 돌려주지 않은 결제액
              전부와 사용한 쿠폰을 돌려주고, 원장님 정산 기준 금액은 0원이에요. 패널티는 없고,
              손님과 원장님에게 알림이 가요. 되돌릴 수 없어요.
            </DialogDescription>
          </DialogHeader>
          {loading || (!preview && !error) ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-44" />
            </div>
          ) : null}
          {preview ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">결제액</dt>
              <dd>{formatWon(preview.paidAmount)}</dd>
              <dt className="text-muted-foreground">이미 돌려준 금액</dt>
              <dd>{formatWon(preview.refundedAmount)}</dd>
              <dt className="text-muted-foreground">이번에 돌려줄 금액</dt>
              <dd className="font-semibold">{formatWon(preview.refundAmount)}</dd>
              <dt className="text-muted-foreground">돌려줄 쿠폰</dt>
              <dd>{preview.usedCouponAmount > 0 ? formatWon(preview.usedCouponAmount) : '없음'}</dd>
            </dl>
          ) : null}
          {blocked ? (
            <p role="alert" className="text-sm text-destructive">
              {VOID_ERRORS[blocked]}
            </p>
          ) : null}
          {preview?.voidable ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={requestId}>원장님이 요청한 내용</Label>
              <Textarea
                id={requestId}
                value={ownerRequest}
                onChange={(event) => setOwnerRequest(event.target.value)}
                maxLength={ADMIN_REASON_LIMIT}
                rows={3}
                placeholder="예: 11/14 통화, 손님과 합의가 안 돼 전액 환불 요청"
              />
              <p className="text-xs text-muted-foreground">
                운영자 처리 기록에 남아요. 손님·원장님에게는 보이지 않아요.
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              {preview?.voidable ? '취소' : '닫기'}
            </Button>
            {preview?.voidable ? (
              <Button
                variant="destructive"
                onClick={submit}
                disabled={pending || ownerRequest.trim() === ''}
              >
                무효로 하기
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
