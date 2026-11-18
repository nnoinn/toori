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
import {
  holdReservationSettlement,
  holdShopSettlement,
  releaseSettlementHold,
} from '@/server/settlements/holds';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';
import type { AdminNoticeCode } from '@/server/policy/admin-notice';

import { AdminNoticeSelect } from '../admin-notice-select';

export type HoldActionTarget =
  | { kind: 'reservation'; reservationId: string }
  | { kind: 'shop'; shopId: string }
  | { kind: 'release'; holdId: string };

const TEXT: Record<
  HoldActionTarget['kind'],
  {
    button: string;
    title: string;
    description: string;
    label: string;
    placeholder: string;
    submit: string;
    /** 원장님에게 보여 줄 사유 코드를 고르는지(#489). 풀 때는 고르지 않는다 */
    pickCode: boolean;
  }
> = {
  reservation: {
    button: '정산 보류',
    title: '이 거래의 정산을 보류할까요?',
    description:
      '풀 때까지 목요일 정산에 묶이지 않아요. 원장님에게 알림이 가고, 원장님 정산 화면에는 "운영자 확인 중"과 고른 사유가 보여요. 메모는 보이지 않아요.',
    label: '운영자 메모',
    placeholder: '예: 원장님 계좌 확인 필요, 손님 문의 확인 중',
    submit: '정산 보류',
    pickCode: true,
  },
  shop: {
    button: '샵 전체 정산 보류',
    title: '이 샵의 정산을 모두 보류할까요?',
    description:
      '아직 정산에 묶이지 않은 이 샵의 거래가 풀 때까지 모두 목요일 정산에서 빠져요. 이미 묶인 정산은 그대로예요. 원장님에게 알림이 가고, 원장님 정산 화면에는 "운영자 확인 중"과 고른 사유가 보여요. 메모는 보이지 않아요.',
    label: '운영자 메모',
    placeholder: '예: 사업자 정보 확인 필요',
    submit: '샵 전체 보류',
    pickCode: true,
  },
  release: {
    button: '보류 풀기',
    title: '정산 보류를 풀까요?',
    description:
      '풀면 돌아오는 지급일 정산에 들어가요. 지급일 0시가 지난 뒤에 풀면 그날이 아니라 그다음 지급일이에요. 원장님에게 알림이 가요.',
    label: '메모',
    placeholder: '예: 원장님과 계좌 확인함',
    submit: '보류 풀기',
    pickCode: false,
  },
};

// 운영자 정산 보류·풀기 버튼(#373 ②). 걸 때는 원장님에게 보여 줄 사유(목록, #489)와 운영자 메모를, 풀 때는 메모를 받는다(모두 필수).
// 성공하면 창을 닫고 화면을 새로 읽어 바뀐 상태를 보여 준다
export function HoldAction({ target }: { target: HoldActionTarget }) {
  const router = useRouter();
  const reasonId = useId();
  const text = TEXT[target.kind];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState<AdminNoticeCode | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    switch (target.kind) {
      case 'reservation':
        return holdReservationSettlement({ reservationId: target.reservationId, reason, code });
      case 'shop':
        return holdShopSettlement({ shopId: target.shopId, reason, code });
      case 'release':
        return releaseSettlementHold({ holdId: target.holdId, memo: reason });
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await run();
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setOpen(false);
        setReason('');
        setCode('');
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
      <Button variant="outline" onClick={() => setOpen(true)}>
        {text.button}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          {text.pickCode ? (
            <AdminNoticeSelect use="settlement_hold" value={code} onChange={setCode} />
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{text.label}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={ADMIN_REASON_LIMIT}
              rows={3}
              placeholder={text.placeholder}
            />
            <p className="text-xs text-muted-foreground">
              운영자 처리 기록에 남아요. 손님·원장님에게는 보이지 않아요.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              취소
            </Button>
            <Button
              onClick={submit}
              disabled={pending || reason.trim() === '' || (text.pickCode && code === '')}
            >
              {text.submit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
