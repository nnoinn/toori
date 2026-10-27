'use client';

// 매물 3탭 등록 ① 서비스 ② 시간 (O4). 고를 수 없는 시각(지난 시각·48시간 밖·겹침)은 화면에서 막고,
// [다음]을 누르면 서버가 다시 확인한다. ③ 할인율·저장은 O5에서 붙인다.

import { useMemo, useState, useTransition } from 'react';
import { cn } from 'cn';
import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWon } from '@/lib/format';
import { formatKst, utcToKst } from '@/lib/time';
import { PUBLISH_WINDOW_HOURS } from '@/server/policy';

import { formatMinutes, serviceTypeLabel } from '../../settings/menu/menu';
import { checkSlotDraft } from './actions';
import { groupByKstDate, rangesOverlap, slotEnd, startCandidates } from './slot-time';

type MenuOption = {
  id: string;
  serviceType: string;
  name: string;
  listPrice: number;
  durationMinutes: number;
};

const STEPS = ['서비스', '시간', '할인율'] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function SlotCreateForm({
  shopId,
  nowIso,
  menus,
  busy,
}: {
  shopId: string;
  nowIso: string;
  menus: MenuOption[];
  /** 같은 샵의 예약대기·게시중·예약됨 매물 시간(ISO) */
  busy: { start: string; end: string }[];
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const busyRanges = useMemo(
    () => busy.map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
    [busy],
  );
  const days = useMemo(() => groupByKstDate(startCandidates(now)), [now]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState(days[0]?.dateKey ?? '');
  const [startIso, setStartIso] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const menu = menus.find((item) => item.id === menuId) ?? null;
  const start = startIso ? new Date(startIso) : null;
  const day = days.find((item) => item.dateKey === dateKey) ?? days[0];

  function chooseMenu(id: string) {
    setMenuId(id);
    // 메뉴가 바뀌면 소요 시간이 달라져서 고른 시각을 다시 고르게 한다
    setStartIso(null);
    setMessage(null);
  }

  function next() {
    if (!menu || !start) return;
    setMessage(null);
    startTransition(async () => {
      const result = await checkSlotDraft(shopId, {
        menuId: menu.id,
        startAt: start.toISOString(),
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setStep(3);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex gap-2" aria-label="등록 단계">
        {STEPS.map((label, index) => {
          const number = index + 1;
          return (
            <li
              key={label}
              aria-current={step === number ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-sm',
                step === number && 'border-primary bg-primary/10 font-semibold',
                step > number && 'text-muted-foreground',
              )}
            >
              {step > number ? <Check className="size-4" aria-hidden /> : <span>{number}</span>}
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>① 어떤 서비스를 올릴까요?</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {menus.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseMenu(item.id)}
                aria-pressed={menuId === item.id}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
                  menuId === item.id && 'border-primary bg-primary/10',
                )}
              >
                <Badge variant="secondary">{serviceTypeLabel(item.serviceType)}</Badge>
                <span className="font-semibold">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  정가 {formatWon(item.listPrice)} · {formatMinutes(item.durationMinutes)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && menu ? (
        <Card>
          <CardHeader>
            <CardTitle>② 언제 시작할까요?</CardTitle>
            <p className="text-sm text-muted-foreground">
              지금부터 {PUBLISH_WINDOW_HOURS}시간 안의 시각만 올릴 수 있어요. 끝 시각은 {menu.name}{' '}
              소요 시간({formatMinutes(menu.durationMinutes)})으로 정해져요.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2" role="tablist" aria-label="날짜">
              {days.map((item, index) => (
                <Button
                  key={item.dateKey}
                  type="button"
                  role="tab"
                  aria-selected={item.dateKey === day?.dateKey}
                  variant={item.dateKey === day?.dateKey ? 'default' : 'outline'}
                  onClick={() => setDateKey(item.dateKey)}
                >
                  {dayLabel(item.starts[0], index)}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {day?.starts.map((candidate) => {
                const range = { start: candidate, end: slotEnd(candidate, menu.durationMinutes) };
                const blocked = busyRanges.some((busyRange) => rangesOverlap(range, busyRange));
                const selected = startIso === candidate.toISOString();
                return (
                  <Button
                    key={candidate.toISOString()}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    disabled={blocked}
                    title={blocked ? '이미 올린 매물과 시간이 겹쳐요' : undefined}
                    onClick={() => {
                      setStartIso(candidate.toISOString());
                      setMessage(null);
                    }}
                    className={cn(blocked && 'line-through')}
                  >
                    {timeLabel(candidate)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              줄이 그어진 시각은 이미 올린 매물(예약대기·게시중·예약됨)과 시간이 겹쳐서 고를 수
              없어요.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 && menu && start ? (
        <Card>
          <CardHeader>
            <CardTitle>③ 할인율</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              할인율 선택과 등록은 준비 중이에요. 고른 서비스와 시간은 올릴 수 있는 것으로
              확인했어요.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {menu ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
          <span>
            <strong>{menu.name}</strong> · 정가 {formatWon(menu.listPrice)}
          </span>
          {start ? (
            <span>
              {formatKst(start)} ~ {timeLabel(slotEnd(start, menu.durationMinutes))}
            </span>
          ) : (
            <span className="text-muted-foreground">시작 시각을 골라 주세요</span>
          )}
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setStep(step === 3 ? 2 : 1)}
            disabled={pending}
          >
            이전
          </Button>
        ) : null}
        {step === 1 ? (
          <Button type="button" size="lg" disabled={!menu} onClick={() => setStep(2)}>
            다음
          </Button>
        ) : null}
        {step === 2 ? (
          <Button type="button" size="lg" disabled={!start || pending} onClick={next}>
            {pending ? '확인 중…' : '다음'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** 날짜 버튼. 예: "10/31(금) 오늘" */
function dayLabel(date: Date, index: number): string {
  const t = utcToKst(date);
  const suffix = ['오늘', '내일', '모레'][index] ?? '';
  return `${t.month}/${t.day}(${WEEKDAYS[t.weekday]}) ${suffix}`.trim();
}

/** 시각. 예: "14:00" */
function timeLabel(date: Date): string {
  const t = utcToKst(date);
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}
