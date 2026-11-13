'use client';

import { useState, useTransition } from 'react';

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
import type { DisputeOutcome } from '@/db/schema';
import { cn } from '@/lib/utils';
import { DISPUTE_CONTENT_LIMIT } from '@/server/policy/dispute';

import { resolveDisputeAction } from '../actions';
import type { OutcomeOption } from '../format';

/** 결론마다 확인 창에서 한 번 더 알릴 것. 결론은 되돌릴 수 없다 */
const CONFIRM_TEXT: Partial<Record<DisputeOutcome, string>> = {
  no_show_reversed: '예약이 노쇼에서 방문으로 바뀌고, 원장님 정산은 판매가로 들어가요.',
  no_show_confirmed: '노쇼 그대로 두고, 원장님 정산은 판매가로 들어가요.',
  no_change: '예약과 금액은 그대로예요.',
};

// 확인 중인 이의제기의 결론 기록 칸(A-104). 결론을 고르고 메모(사유)를 적은 뒤 확인 창에서 한 번 더 확인한다.
// 처리 기능이 준비 중인 결론(환불 예외·무효·원장님 사정 취소)과 이 예약에서 고를 수 없는 결론은 막아 둔다(#350 리뷰).
// 성공하면 서버 함수가 화면을 새로 읽게 해서 결론이 보이고 이 칸은 사라진다
export function ResolveForm({
  disputeId,
  options,
}: {
  disputeId: string;
  options: OutcomeOption[];
}) {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [memo, setMemo] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = options.find((option) => option.value === outcome);

  function submit() {
    if (!outcome) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resolveDisputeAction({ disputeId, outcome, memo });
      if (result.ok) {
        setConfirming(false);
      } else {
        setMessage(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">결론</legend>
        {options.map((option) => {
          const disabled = !option.ready || !option.allowed;
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-center gap-2 text-sm',
                disabled ? 'text-muted-foreground' : 'cursor-pointer',
              )}
            >
              <input
                type="radio"
                name="outcome"
                value={option.value}
                checked={outcome === option.value}
                disabled={disabled}
                onChange={() => setOutcome(option.value)}
              />
              {option.label}
              {!option.ready ? <span className="text-xs">준비 중</span> : null}
              {option.ready && !option.allowed ? (
                <span className="text-xs">노쇼 예약만</span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dispute-memo">결론 메모</Label>
        <Textarea
          id="dispute-memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          maxLength={DISPUTE_CONTENT_LIMIT}
          placeholder="예: 원장님과 통화해서 방문한 것을 확인했어요"
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          메모는 운영자 작업 기록에 남아요. 고객·원장님에게는 보이지 않아요.
        </p>
      </div>
      {message && !confirming ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div>
        <Button
          disabled={!chosen || memo.trim() === '' || pending}
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
        >
          결론 기록
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(next) => (next ? null : setConfirming(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>‘{chosen?.label}’로 결론을 기록할까요?</DialogTitle>
            <DialogDescription>
              {outcome ? CONFIRM_TEXT[outcome] : null} 결론을 기록하면 정산 보류가 풀려요. 기록한
              결론은 되돌릴 수 없어요.
            </DialogDescription>
          </DialogHeader>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              취소
            </Button>
            <Button disabled={pending} onClick={submit}>
              기록하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
