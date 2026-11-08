'use client';

// 매물 3탭 등록 ① 서비스 ② 시간 (O4) ③ 할인율·확인 (O5). 고를 수 없는 시각(지난 시각·14일 밖·겹침)은 화면에서 막고,
// [다음]을 누르면 서버가 다시 확인한다. [등록하기]를 누르면 서버가 ①②③을 다시 검증하고 저장한다.
// 매물 수정(O10, S-206)도 이 화면을 쓴다(edit). 지금 값을 채워서 열고, 고치는 매물 자신은 겹침으로 보지 않는다.
// 이 파일은 고른 값과 단계 이동·확인·저장을 맡고, 단계 버튼과 ①②③ 카드는 slot-form-steps.tsx,
// 저장 완료 카드는 slot-saved-card.tsx가 그린다.

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { BusinessHours } from '@/db/schema/shops';
import { formatKst, kstDateKey } from '@/lib/time';
import type { DiscountRate } from '@/server/policy';
import { previewSettlement } from '@/server/settlements';

import { checkSlotEdit, updateSlot } from './actions';
import { checkSlotDraft, createSlot } from './new/actions';
import {
  canOpenStep,
  ChosenSummary,
  DiscountStep,
  MenuStep,
  type StepDone,
  StepNav,
  type StepNumber,
  TimeStep,
} from './slot-form-steps';
import { SavedCard, type SavedSummary } from './slot-saved-card';
import {
  groupByKstDate,
  publishPlan,
  slotEnd,
  startCandidates,
  type StartWindow,
} from './slot-time';

export type SlotMenuOption = {
  id: string;
  serviceType: string;
  name: string;
  listPrice: number;
  durationMinutes: number;
};

/** 매물 수정(O10)이면 고치는 매물과 지금 값. 없으면 새로 등록한다 */
export type SlotEditTarget = {
  slotId: string;
  /** 매물의 메뉴. 숨겼거나 지금 업종에 없는 메뉴면 null(다시 고른다) */
  menuId: string | null;
  startAt: string;
  discountRate: DiscountRate;
  newCustomerOnly: boolean;
  /** 고를 수 있는 시작 시각 범위. 이미 고객에게 보이는(게시중) 매물이면 48시간 안(editStartWindow) */
  startWindow: StartWindow;
};

/** 매물 등록·수정 3탭 화면. edit를 넘기면 수정이다 */
export function SlotForm({
  shopId,
  nowIso,
  businessHours,
  menus,
  busy,
  edit,
}: {
  shopId: string;
  nowIso: string;
  /** 샵 영업시간(O2). 입력하지 않은 요일은 24시간 다 보여준다 */
  businessHours: BusinessHours;
  menus: SlotMenuOption[];
  /** 같은 샵의 예약대기·게시중·예약됨 매물 시간(ISO). 수정이면 고치는 매물은 뺀다 */
  busy: { start: string; end: string }[];
  edit?: SlotEditTarget;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const busyRanges = useMemo(
    () => busy.map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
    [busy],
  );
  const startWindow = edit?.startWindow ?? 'advance';
  const days = useMemo(() => groupByKstDate(startCandidates(now, startWindow)), [now, startWindow]);

  const [step, setStep] = useState<StepNumber>(1);
  const [menuId, setMenuId] = useState<string | null>(edit?.menuId ?? null);
  // 달력에서 고른 날짜. 새로 올릴 때는 비워 두고 원장님이 고르면 그 아래에 시작 시각을 보여준다.
  // 수정이면 매물 날짜(지금 고를 수 있는 날짜일 때)
  const [dateKey, setDateKey] = useState(
    () =>
      (edit && days.find((item) => item.dateKey === kstDateKey(new Date(edit.startAt))))?.dateKey ??
      '',
  );
  // 메뉴를 다시 골라야 하면 소요 시간이 달라지므로 시각도 다시 고른다. 지금 고를 수 없는 시각(범위 밖)이어도 다시 고른다
  const [startIso, setStartIso] = useState<string | null>(() =>
    edit?.menuId &&
    days.some((item) => item.starts.some((candidate) => candidate.toISOString() === edit.startAt))
      ? edit.startAt
      : null,
  );
  const [discountRate, setDiscountRate] = useState<DiscountRate | null>(edit?.discountRate ?? null);
  const [newCustomerOnly, setNewCustomerOnly] = useState(edit?.newCustomerOnly ?? false);
  // 저장한 매물(완료 카드에 보여준다)
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const menu = menus.find((item) => item.id === menuId) ?? null;
  const start = startIso ? new Date(startIso) : null;
  const preview =
    menu && discountRate !== null
      ? previewSettlement({ listPrice: menu.listPrice, discountRate })
      : null;

  /** ① 메뉴를 고른다. 메뉴가 바뀌면 소요 시간이 달라져서 고른 시각을 다시 고르게 한다 */
  function chooseMenu(id: string) {
    setMenuId(id);
    setStartIso(null);
    setMessage(null);
  }

  // 고른 단계. 앞 단계를 다 골라야 다음 단계 버튼을 누를 수 있다
  const stepDone: StepDone = {
    1: menu !== null,
    2: menu !== null && start !== null,
    3: menu !== null && start !== null && discountRate !== null,
  };

  /** 단계 버튼. ③으로 갈 때는 [다음]처럼 서버가 ①② 값을 다시 확인한다 */
  function goTo(target: StepNumber) {
    if (!canOpenStep(target, stepDone) || target === step) return;
    setMessage(null);
    if (target === 3) next();
    else setStep(target);
  }

  /**
   * ②의 [다음]: 고른 메뉴·시각을 서버가 확인한 뒤 ③으로 간다. 화면을 연 뒤에 다른 탭에서 같은 시간에
   * 매물을 올렸거나 메뉴를 숨겼으면 여기서 알려 주므로, ③까지 다 고른 뒤에야 막히는 일이 줄어든다
   */
  function next() {
    if (!menu || !start) return;
    setMessage(null);
    startTransition(async () => {
      const draft = { menuId: menu.id, startAt: start.toISOString() };
      const result = edit
        ? await checkSlotEdit(shopId, edit.slotId, draft)
        : await checkSlotDraft(shopId, draft);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setStep(3);
    });
  }

  /** ③의 [등록하기]·[저장하기]. 서버가 ①②③을 다시 검증하고 할인가를 계산해 돌려준다 */
  function submit() {
    if (!menu || !start || discountRate === null || !preview) return;
    setMessage(null);
    startTransition(async () => {
      const input = {
        menuId: menu.id,
        startAt: start.toISOString(),
        discountRate,
        newCustomerOnly,
      };
      const result = edit
        ? await updateSlot(shopId, edit.slotId, input)
        : await createSlot(shopId, input);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setSaved({
        menuName: menu.name,
        start,
        end: slotEnd(start, menu.durationMinutes),
        listPrice: menu.listPrice,
        salePrice: result.data.salePrice,
        discountRate,
        newCustomerOnly,
        publishAt: result.data.publishAt ? new Date(result.data.publishAt) : null,
      });
    });
  }

  /** 완료 카드에서 하나 더 올리기. 고른 메뉴는 남기고 시각·할인율부터 다시 고른다 */
  function startOver() {
    setSaved(null);
    setStartIso(null);
    setDiscountRate(null);
    setNewCustomerOnly(false);
    setMessage(null);
    setStep(2);
  }

  const saveLabel = edit ? '저장' : '등록';
  const publishNote = start ? publishNoteOf(start, now, startWindow, saveLabel) : null;
  if (saved) {
    return <SavedCard saved={saved} edited={edit !== undefined} onAgain={startOver} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <StepNav step={step} done={stepDone} pending={pending} onGoTo={goTo} />

      {step === 1 ? <MenuStep menus={menus} menuId={menuId} onChoose={chooseMenu} /> : null}

      {step === 2 && menu ? (
        <TimeStep
          menu={menu}
          days={days}
          todayKey={kstDateKey(now)}
          startWindow={startWindow}
          dateKey={dateKey}
          businessHours={businessHours}
          busyRanges={busyRanges}
          startIso={startIso}
          onChooseDate={setDateKey}
          onChooseStart={(iso) => {
            setStartIso(iso);
            setMessage(null);
          }}
        />
      ) : null}

      {step === 3 && menu && start ? (
        <DiscountStep
          menu={menu}
          discountRate={discountRate}
          newCustomerOnly={newCustomerOnly}
          preview={preview}
          onChooseRate={(rate) => {
            setDiscountRate(rate);
            setMessage(null);
          }}
          onChangeNewCustomerOnly={setNewCustomerOnly}
        />
      ) : null}

      {menu ? <ChosenSummary menu={menu} start={start} publishNote={publishNote} /> : null}

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
        {step === 3 ? (
          <Button type="button" size="lg" disabled={!stepDone[3] || pending} onClick={submit}>
            {pending ? `${saveLabel} 중…` : `${saveLabel}하기`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 고른 시각이면 언제 고객에게 보이는지(S-205). 화면을 연 서버 시각으로 미리 알려 주고,
 * 저장할 때는 서버가 그때 시각으로 다시 정한다(완료 카드는 서버가 돌려준 값을 쓴다).
 * 게시중 매물을 고칠 때는 48시간 안만 고르므로 늘 바로 보인다
 */
function publishNoteOf(
  start: Date,
  now: Date,
  startWindow: StartWindow,
  saveLabel: string,
): string {
  const plan = startWindow === 'advance' ? publishPlan(start, now) : null;
  return plan?.status === 'scheduled'
    ? `예약대기로 올라가요. ${formatKst(plan.publishAt)}부터 고객에게 보여요`
    : `${saveLabel}하면 바로 고객에게 보여요`;
}
