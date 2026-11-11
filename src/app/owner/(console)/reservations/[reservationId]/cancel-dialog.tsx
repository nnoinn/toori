'use client';

// [예약 취소] 창 (S-410, 연결 #19, #301). 고르기 → 손님과 합의 후 취소 안내(동의 문구 8-1장) → 보낸 뒤 안내, 세 단계를 한 창에서 바꿔 보여준다.
// "원장님 사정으로 취소"(S-409)는 처리 함수(X-207)가 아직 없어서 "준비 중"으로 잠가 둔다(11/11 정민석 결정).
// [손님과 합의 후 취소]를 열 수 있는지는 서버가 준 canRequest를 그대로 따른다(답을 기다리는 요청이 있으면 잠김).
// 요청하는 동안(pending)에는 바깥을 눌러도 닫히지 않는다.

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { cn } from 'cn';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AGREED_CANCEL_ERRORS } from '@/server/refunds/agreed-cancel-errors';
import {
  AGREED_CANCEL_REASON_TEXT_MAX,
  type AgreedCancelReason,
  type AgreedCancelStatusView,
  type RequestedAgreedCancel,
} from '@/server/refunds/agreed-cancel-types';

import { ChoiceChips } from '../../choice-chips';
import { requestReservationAgreedCancel } from '../actions';
import {
  AGREED_CANCEL_ALTERNATIVES,
  AGREED_CANCEL_ASK_CUSTOMER,
  AGREED_CANCEL_CONFIRM_LABEL,
  AGREED_CANCEL_LOAD_FAILED,
  AGREED_CANCEL_NOT_FOR,
  AGREED_CANCEL_REASON_CHIPS,
  AGREED_CANCEL_REASON_VISIBLE,
  AGREED_CANCEL_REQUEST_FAILED,
  AGREED_CANCEL_SENT_TITLE,
  AGREED_CANCEL_SUBMIT,
  AGREED_CANCEL_USE_WHEN,
  agreedCancelFailIsFinal,
  agreedCancelOutcomes,
  agreedCancelSentText,
  CANCEL_CHOOSER_TITLE,
  CANCEL_METHODS,
  canSubmitAgreedCancel,
} from '../cancel-request';

type Step = 'choose' | 'agreed' | 'sent';

export function CancelDialog({
  open,
  reservationId,
  summary,
  agreedCancel,
  onClose,
}: {
  open: boolean;
  reservationId: string;
  summary: string;
  agreedCancel: AgreedCancelStatusView | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('choose');
  const [sent, setSent] = useState<RequestedAgreedCancel | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {step === 'choose' ? (
        <ChooseStep
          summary={summary}
          agreedCancel={agreedCancel}
          onAgreed={() => setStep('agreed')}
          onClose={onClose}
        />
      ) : step === 'agreed' && agreedCancel ? (
        <AgreedStep
          reservationId={reservationId}
          summary={summary}
          baseAmount={agreedCancel.baseAmount}
          pending={pending}
          startTransition={startTransition}
          onBack={() => setStep('choose')}
          onSent={(data) => {
            setSent(data);
            setStep('sent');
          }}
        />
      ) : sent ? (
        <SentStep summary={summary} sent={sent} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

/** 1단계: 원장님 사정으로 취소(준비 중) / 손님과 합의 후 취소 */
function ChooseStep({
  summary,
  agreedCancel,
  onAgreed,
  onClose,
}: {
  summary: string;
  agreedCancel: AgreedCancelStatusView | null;
  onAgreed: () => void;
  onClose: () => void;
}) {
  const canRequest = agreedCancel?.canRequest ?? false;
  // 잠긴 이유. 답을 기다리는 요청이 있거나(한 번에 하나), 그 사이 예약이 바뀌었거나, 상태를 읽지 못함
  const lockedReason =
    agreedCancel === null
      ? AGREED_CANCEL_LOAD_FAILED
      : agreedCancel.status === 'requested'
        ? AGREED_CANCEL_ERRORS.ALREADY_REQUESTED
        : AGREED_CANCEL_ERRORS.NOT_REQUESTABLE;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{CANCEL_CHOOSER_TITLE}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <MethodButton
          title={CANCEL_METHODS.ownerFault.title}
          description={CANCEL_METHODS.ownerFault.description}
          badge={CANCEL_METHODS.ownerFault.notReady}
          disabled
        />
        <MethodButton
          title={CANCEL_METHODS.agreed.title}
          description={CANCEL_METHODS.agreed.description}
          note={canRequest ? undefined : lockedReason}
          disabled={!canRequest}
          onClick={onAgreed}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          닫기
        </Button>
      </div>
    </DialogContent>
  );
}

/** 취소 방법 하나. 누르면 다음 단계로 간다. 잠겼으면 이유(note)나 "준비 중"(badge)을 보여준다 */
function MethodButton({
  title,
  description,
  badge,
  note,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  badge?: string;
  note?: string;
  disabled: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors outline-none',
        'hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn('font-semibold', disabled && 'text-muted-foreground')}>{title}</span>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </span>
      <span className="text-muted-foreground">{description}</span>
      {note ? <span className="text-destructive">{note}</span> : null}
    </button>
  );
}

/** 2단계: 손님과 합의 후 취소 안내(동의 문구 8-1장), 사유, 손님께 설명했다는 확인, [합의 후 취소 요청하기] */
function AgreedStep({
  reservationId,
  summary,
  baseAmount,
  pending,
  startTransition,
  onBack,
  onSent,
}: {
  reservationId: string;
  summary: string;
  baseAmount: number;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onBack: () => void;
  onSent: (sent: RequestedAgreedCancel) => void;
}) {
  const [reason, setReason] = useState<AgreedCancelReason | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const ready = canSubmitAgreedCancel({ reason, reasonText, confirmed });

  function submit() {
    if (!reason || !ready) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await requestReservationAgreedCancel({
          reservationId,
          reason,
          reasonText: reason === 'other' ? reasonText.trim() : null,
        });
        if (result.ok) {
          onSent(result.data);
          return;
        }
        if (agreedCancelFailIsFinal(result.error.code)) setBlocked(true);
        setMessage(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setMessage(AGREED_CANCEL_REQUEST_FAILED);
      }
    });
  }

  return (
    <DialogContent className="overflow-y-auto" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>{CANCEL_METHODS.agreed.title}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <p>{CANCEL_METHODS.agreed.description}</p>

      <GuideSection title="이럴 때 써요">
        <li>
          {AGREED_CANCEL_USE_WHEN[0]}
          <p className="mt-1 text-muted-foreground">{AGREED_CANCEL_ALTERNATIVES}</p>
        </li>
        <li>{AGREED_CANCEL_USE_WHEN[1]}</li>
      </GuideSection>
      <GuideSection title="이럴 때는 쓰지 않아요">
        {AGREED_CANCEL_NOT_FOR.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </GuideSection>
      <GuideSection title="이렇게 처리돼요" highlight>
        {agreedCancelOutcomes(baseAmount).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </GuideSection>

      <div className="flex flex-col gap-2">
        <ChoiceChips
          legend="사유"
          name="agreedCancelReason"
          options={AGREED_CANCEL_REASON_CHIPS}
          value={reason}
          onChange={(key) => {
            setReason(key);
            setMessage(null);
          }}
        />
        {reason === 'other' ? (
          <div className="flex flex-col gap-1">
            <Textarea
              aria-label="기타 사유"
              value={reasonText}
              maxLength={AGREED_CANCEL_REASON_TEXT_MAX}
              rows={2}
              placeholder="어떤 사정인지 짧게 적어 주세요"
              className="min-h-16"
              onChange={(event) => {
                setReasonText(event.target.value);
                setMessage(null);
              }}
            />
            <p className="self-end text-xs text-muted-foreground tabular-nums">
              {reasonText.length}/{AGREED_CANCEL_REASON_TEXT_MAX}
            </p>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{AGREED_CANCEL_REASON_VISIBLE}</p>
      </div>

      <label className="flex items-start gap-2 font-medium">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        {AGREED_CANCEL_CONFIRM_LABEL}
      </label>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onBack}>
          뒤로
        </Button>
        <Button type="button" size="lg" disabled={!ready || pending || blocked} onClick={submit}>
          {pending ? '요청하는 중…' : AGREED_CANCEL_SUBMIT}
        </Button>
      </div>
    </DialogContent>
  );
}

/** 안내 창의 한 묶음(제목 + 점 목록). highlight는 금액이 있는 "이렇게 처리돼요" */
function GuideSection({
  title,
  highlight = false,
  children,
}: {
  title: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-1', highlight && 'rounded-lg bg-muted p-3')}>
      <h3 className="font-semibold">{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>
    </section>
  );
}

/** 3단계: 보낸 뒤 안내. 손님이 언제까지 동의해야 하는지와 손님께 할 말 */
function SentStep({
  summary,
  sent,
  onClose,
}: {
  summary: string;
  sent: RequestedAgreedCancel;
  onClose: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{AGREED_CANCEL_SENT_TITLE}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <p role="status">
        {agreedCancelSentText(sent.expiresAt)} {AGREED_CANCEL_ASK_CUSTOMER}
      </p>
      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={onClose}>
          확인
        </Button>
      </div>
    </DialogContent>
  );
}
