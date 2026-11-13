'use client';

import { useId, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { ExternalLink, Info, MessageCircle } from 'lucide-react';

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
import { KAKAO_CHANNEL_URL } from '@/lib/site';
import type { DisputeErrorCode, DisputeView } from '@/server/disputes';
import { submitDispute } from '@/server/disputes/dispute';
import { DISPUTE_CONTENT_LIMIT } from '@/server/policy/dispute';

import {
  DISPUTE_CONTENT_LIMIT_NOTE,
  DISPUTE_CONTENT_PLACEHOLDER,
  DISPUTE_FOLLOW_UP,
  DISPUTE_IN_REVIEW,
  DISPUTE_PRIVACY_NOTE,
  DISPUTE_RESOLVED,
  DISPUTE_TYPE_LABELS,
  disputeClosedText,
  disputeContentError,
  disputeDeadlineText,
  disputeSubmittedText,
  type DisputeType,
  KAKAO_CHANNEL_LABEL,
  reachedContentLimit,
} from './dispute-texts';
import { DetailCard } from './detail-card';

const SUBMIT_FAILED_MESSAGE = '접수하지 못했어요. 잠시 후 다시 시도해 주세요';

// 다시 눌러도 결과가 같은 실패. '접수하기'를 막고, 창을 닫으면 상세를 새로 읽어 바뀐 상태를 보여준다
const FINAL_FAILURES: readonly string[] = [
  'NOT_OPEN_YET',
  'DEADLINE_PASSED',
  'ALREADY_SUBMITTED',
  'RESERVATION_NOT_FOUND',
] satisfies DisputeErrorCode[];

/**
 * 내 예약 상세의 이의제기 칸 (C-507, 연결 #20, #299). 서버가 준 state 그대로 네 가지 중 하나를 보여준다.
 * - not_open(서비스 시작 전): 칸을 그리지 않는다
 * - open: 기한 안내와 [이의제기] → 종류 고르기와 내용 적기 → 접수(접수되면 원장님 정산이 멈춘다, W19)
 * - submitted: 접수한 날짜와 확인 상태, 카카오톡 채널(이어지는 대화)
 * - closed: 기한이 지났다는 안내와 카카오톡 채널
 * 정산이 멈추는 것은 원장님 쪽 일이라 고객 화면에는 쓰지 않는다
 */
export function DisputeSection({ view }: { view: DisputeView }) {
  if (view.state === 'not_open') return null;
  return (
    <DetailCard aria-label="이의제기">
      <h3 className="font-semibold">이의제기</h3>
      {view.state === 'open' ? (
        <DisputeForm view={view} />
      ) : view.state === 'submitted' && view.dispute ? (
        <>
          <p className="text-sm">{disputeSubmittedText(view.dispute.createdAt)}</p>
          <p className="text-sm text-muted-foreground">
            종류: {DISPUTE_TYPE_LABELS[view.dispute.type]}
          </p>
          <p className="text-sm text-muted-foreground">
            {view.dispute.status === 'resolved' ? DISPUTE_RESOLVED : DISPUTE_IN_REVIEW}
          </p>
          <ChannelLink />
        </>
      ) : (
        <>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {disputeClosedText(view.deadline)}
          </p>
          <ChannelLink />
        </>
      )}
    </DetailCard>
  );
}

function ChannelLink() {
  return (
    <a
      href={KAKAO_CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 self-start text-sm font-medium max-md:min-h-10"
    >
      <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
      {KAKAO_CHANNEL_LABEL}
      <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
    </a>
  );
}

function DisputeForm({ view }: { view: DisputeView }) {
  const router = useRouter();
  const contentId = useId();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  // 고를 수 있는 종류가 하나뿐이면 골라 둔다
  const [type, setType] = useState<DisputeType | null>(
    view.types.length === 1 ? view.types[0] : null,
  );
  const [content, setContent] = useState('');
  // [접수하기]를 눌렀을 때 내용이 빈칸이면 칸 아래에 보여줄 안내(11/13 nnoinn: 빈칸만 막고 글자 수는 보여주지 않는다)
  const [contentError, setContentError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  // 내용은 누를 때 확인한다(빈칸이면 안내). 그래서 종류만 골랐으면 누를 수 있다
  const canSubmit = type !== null && view.types.includes(type) && !blocked;

  // 떠났다 돌아오면 Next.js가 이 화면을 상태 그대로 다시 보여준다(Activity). 열려 있던 창은 닫아 둔다
  useLayoutEffect(() => () => setOpen(false), []);

  function handleOpenChange(next: boolean) {
    if (next) {
      if (!blocked) setMessage(null);
      setContentError(null);
      setOpen(true);
      return;
    }
    if (pending) return;
    setOpen(false);
    // 접수했거나 상태가 바뀐 예약이면 상세를 새로 읽어 접수함·기한 지남으로 바꾼다
    if (done || blocked) router.refresh();
  }

  function handleSubmit() {
    if (!type || !canSubmit) return;
    setMessage(null);
    const problem = disputeContentError(content);
    if (problem) {
      setContentError(problem);
      contentRef.current?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitDispute({ reservationId: view.reservationId, type, content });
        if (result.ok) {
          setDone(true);
          return;
        }
        if (FINAL_FAILURES.includes(result.error.code)) setBlocked(true);
        setMessage(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setMessage(SUBMIT_FAILED_MESSAGE);
      }
    });
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">{disputeDeadlineText(view.deadline)}</p>
      <Button
        variant="outline"
        className="self-start max-md:h-10"
        onClick={() => handleOpenChange(true)}
      >
        이의제기
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!pending}>
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>접수했어요</DialogTitle>
                <DialogDescription>{DISPUTE_FOLLOW_UP}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ChannelLink />
                <Button
                  variant="outline"
                  className="max-md:h-10"
                  onClick={() => handleOpenChange(false)}
                >
                  닫기
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>이의제기</DialogTitle>
                <DialogDescription>{DISPUTE_FOLLOW_UP}</DialogDescription>
              </DialogHeader>
              <fieldset className="flex flex-col gap-2" disabled={pending}>
                <legend className="mb-1 text-sm font-medium">어떤 문제인가요?</legend>
                {view.types.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm max-md:min-h-10">
                    <input
                      type="radio"
                      name="dispute-type"
                      className="size-4 accent-primary"
                      checked={type === option}
                      onChange={() => setType(option)}
                    />
                    {DISPUTE_TYPE_LABELS[option]}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={contentId}>내용</Label>
                {/* 상한(5,000자)은 화면에 숫자로 보여주지 않고, 닿으면 입력이 멈추며 그때만 안내한다 */}
                <Textarea
                  ref={contentRef}
                  id={contentId}
                  value={content}
                  maxLength={DISPUTE_CONTENT_LIMIT}
                  rows={5}
                  placeholder={DISPUTE_CONTENT_PLACEHOLDER}
                  disabled={pending}
                  aria-invalid={contentError ? true : undefined}
                  aria-describedby={`${contentId}-help`}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setContentError(null);
                  }}
                />
                <div id={`${contentId}-help`} className="flex flex-col gap-0.5 text-xs">
                  {contentError ? (
                    <p role="alert" className="text-destructive">
                      {contentError}
                    </p>
                  ) : reachedContentLimit(content) ? (
                    <p role="status" className="text-foreground">
                      {DISPUTE_CONTENT_LIMIT_NOTE}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground">{DISPUTE_PRIVACY_NOTE}</p>
                </div>
              </div>
              {message ? (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 max-md:*:h-10">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  닫기
                </Button>
                <Button onClick={handleSubmit} disabled={!canSubmit || pending}>
                  {pending ? '접수하는 중…' : '접수하기'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
