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
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';
import { NO_SHOW_PENALTY_RATE } from '@/server/policy/refund';
import { recordVisitAsAdmin, reverseNoShowAsAdmin } from '@/server/visits/admin-visit';

type VisitActionKind = 'visited' | 'no_show' | 'reverse';

const TEXT: Record<
  VisitActionKind,
  { button: string; title: string; description: string; submit: string }
> = {
  visited: {
    button: '방문 완료',
    title: '원장님 대신 방문 완료로 처리할까요?',
    description:
      '원장님이 처리한 것과 같아요. 처리하면 원장님은 바꿀 수 없어요. 원장님에게 운영자가 처리했다는 알림이 가요.',
    submit: '방문 완료로 처리',
  },
  no_show: {
    button: '노쇼',
    title: '원장님 대신 노쇼로 처리할까요?',
    description: `원장님이 처리한 것과 같아요(위약금 ${NO_SHOW_PENALTY_RATE}%, 판매가 그대로 정산). 손님에게 노쇼 알림이, 원장님에게 운영자가 처리했다는 알림이 가요.`,
    submit: '노쇼로 처리',
  },
  reverse: {
    button: '방문으로 바꾸기',
    title: '노쇼를 방문으로 바꿀까요?',
    description:
      '원장님이 잘못 누른 노쇼를 바로잡아요. 정산은 판매가 그대로예요. 손님에게 노쇼가 취소됐다는 알림이, 원장님에게 운영자가 바꿨다는 알림이 가요.',
    submit: '방문으로 바꾸기',
  },
};

// 운영자 예약 상세의 방문·노쇼 버튼(#373 ③). 사유(필수)를 받고 확인 창에서 한 번 더 확인한다.
// 성공하면 창을 닫고 화면을 새로 읽어 바뀐 상태를 보여 준다
export function VisitAction({
  reservationId,
  kind,
  variant = 'outline',
}: {
  reservationId: string;
  kind: VisitActionKind;
  variant?: 'outline' | 'destructive';
}) {
  const router = useRouter();
  const reasonId = useId();
  const text = TEXT[kind];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result =
          kind === 'reverse'
            ? await reverseNoShowAsAdmin({ reservationId, reason })
            : await recordVisitAsAdmin({ reservationId, result: kind, reason });
        if (!result.ok) {
          setError(result.error.message);
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
      <Button variant={variant} onClick={() => setOpen(true)}>
        {text.button}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>사유</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={ADMIN_REASON_LIMIT}
              rows={3}
              placeholder="예: 원장님이 전화로 요청함, 손님이 방문한 것을 원장님과 확인함"
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
              취소
            </Button>
            <Button onClick={submit} disabled={pending || reason.trim() === ''}>
              {text.submit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
