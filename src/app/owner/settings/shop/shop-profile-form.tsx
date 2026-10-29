'use client';

// 샵 정보 입력 폼 (O2, S-103). 저장 전에 화면에서 한 번 검사하고, 서버 함수가 다시 검사한다.

import { useState, useTransition } from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { GeocodeCandidate } from '@/features/map/geocode';
import { SHOP_CATEGORIES } from '@/server/policy/catalog';

import { getCategoryChangeImpact, saveShopProfile } from './actions';
import { AddressSearchButton } from './address-search-button';
import type { CategoryChangeImpact } from './category-change-store';
import {
  type HoursRow,
  SHOP_PROFILE_LIMITS,
  type ShopProfileField,
  type ShopProfileFieldErrors,
  type ShopProfileInput,
  validateShopProfile,
  WEEKDAY_LABELS,
} from './shop-profile';

type Status =
  { kind: 'idle' } | { kind: 'saved'; message: string } | { kind: 'error'; message: string };

/** 업종 변경 확인 창. 1단계 "정말 바꿀까요?" → 2단계 "매물·메뉴가 내려가요" */
type ConfirmState = { step: 1 } | { step: 2; impact: CategoryChangeImpact } | null;

export function ShopProfileForm({
  shopId,
  initial,
}: {
  shopId: string;
  initial: ShopProfileInput;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<ShopProfileFieldErrors>({});
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  // 마지막으로 저장된 업종. 이것과 다르면 업종 변경 확인(2단계)을 거친다
  const [savedCategory, setSavedCategory] = useState(initial.category);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  function update<K extends keyof ShopProfileInput>(key: K, value: ShopProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus({ kind: 'idle' });
  }

  function updateHours(index: number, row: Partial<HoursRow>) {
    update(
      'hours',
      form.hours.map((item, i) => (i === index ? { ...item, ...row } : item)),
    );
  }

  /** 저장 버튼. 업종이 바뀌었으면 바로 저장하지 않고 확인 창(1단계)을 띄운다 */
  function save(next: ShopProfileInput) {
    const checked = validateShopProfile(next);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      setStatus({ kind: 'error', message: '입력한 내용을 다시 확인해 주세요' });
      return;
    }
    setErrors({});
    setCandidates([]);
    if (next.category !== savedCategory) {
      setConfirm({ step: 1 });
      return;
    }
    submit(next, false);
  }

  function submit(next: ShopProfileInput, confirmCategoryChange: boolean) {
    startTransition(async () => {
      const result = await saveShopProfile(shopId, next, { confirmCategoryChange });
      setConfirm(null);
      if (result.ok) {
        setSavedCategory(next.category);
        // 저장한 모양(전화번호는 하이픈 넣은 모양 등)으로 칸을 맞춘다. 새로고침하지 않아도 저장된 값이 보인다
        const saved = validateShopProfile(next);
        if (saved.ok) {
          setForm((prev) => ({
            ...prev,
            name: saved.data.name,
            phone: saved.data.phone,
            addressDetail: saved.data.addressDetail ?? '',
            description: saved.data.description ?? '',
          }));
        }
        setStatus({
          kind: 'saved',
          message: confirmCategoryChange
            ? `업종을 바꿨어요. 매물 ${result.data.closedSlots}개를 마감하고 메뉴 ${result.data.hiddenMenus}개를 숨겼어요. 매장 설정 > 메뉴에서 새 업종에 맞는 메뉴를 등록해 주세요`
            : '저장했어요',
        });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setCandidates(result.error.candidates ?? []);
      setStatus({ kind: 'error', message: result.error.message });
    });
  }

  /** 1단계 "변경하기": 마감될 매물·숨겨질 메뉴 수를 받아 2단계를 띄운다. 없으면 바로 저장한다 */
  function confirmStep1() {
    startTransition(async () => {
      const impact = await getCategoryChangeImpact(shopId);
      if (!impact.ok) {
        setConfirm(null);
        setStatus({ kind: 'error', message: impact.error.message });
        return;
      }
      if (impact.data.heldSlots > 0) {
        setConfirm(null);
        setStatus({
          kind: 'error',
          message: '다른 고객이 결제 중인 매물이 있어요. 10분 뒤에 다시 시도해 주세요',
        });
        return;
      }
      if (impact.data.openSlots === 0 && impact.data.visibleMenus === 0) {
        submit(form, true);
        return;
      }
      setConfirm({ step: 2, impact: impact.data });
    });
  }

  function chooseCandidate(roadAddress: string) {
    const next = { ...form, roadAddress };
    setForm(next);
    save(next);
  }

  const fieldProps = (field: ShopProfileField) => ({
    id: field,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save(form);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="샵 이름" field="name" error={errors.name}>
            <Input
              {...fieldProps('name')}
              value={form.name}
              maxLength={SHOP_PROFILE_LIMITS.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">업종</legend>
            <div className="flex gap-2">
              {SHOP_CATEGORIES.map((category) => (
                <label
                  key={category.key}
                  className={cn(
                    'flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                    form.category === category.key && 'border-primary bg-primary/10 font-semibold',
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={category.key}
                    checked={form.category === category.key}
                    onChange={() => update('category', category.key)}
                    className="sr-only"
                  />
                  {category.label}
                </label>
              ))}
            </div>
            <FieldError field="category" error={errors.category} />
          </fieldset>

          <Field label="전화번호" field="phone" error={errors.phone}>
            <Input
              {...fieldProps('phone')}
              type="tel"
              inputMode="tel"
              placeholder="031-123-4567"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              className="max-w-60"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>주소</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="도로명 주소" field="roadAddress" error={errors.roadAddress}>
            <div className="flex gap-2">
              <Input
                {...fieldProps('roadAddress')}
                value={form.roadAddress}
                readOnly
                placeholder="주소 찾기를 눌러 골라 주세요"
              />
              <AddressSearchButton
                onSelect={(roadAddress) => {
                  update('roadAddress', roadAddress);
                  setCandidates([]);
                  setErrors((prev) => ({ ...prev, roadAddress: undefined }));
                }}
                onError={(message) => setErrors((prev) => ({ ...prev, roadAddress: message }))}
              />
            </div>
          </Field>

          {candidates.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">아래에서 샵 주소를 골라 주세요</p>
              <ul className="flex flex-col gap-1">
                {candidates.map((candidate) => (
                  <li key={candidate.roadAddress}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full flex-col items-start py-2 whitespace-normal"
                      disabled={pending}
                      onClick={() => chooseCandidate(candidate.roadAddress)}
                    >
                      <span>{candidate.roadAddress}</span>
                      {candidate.jibunAddress ? (
                        <span className="text-xs text-muted-foreground">
                          지번 {candidate.jibunAddress}
                        </span>
                      ) : null}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Field label="상세 주소" field="addressDetail" error={errors.addressDetail}>
            <Input
              {...fieldProps('addressDetail')}
              placeholder="예: 2층 201호"
              value={form.addressDetail}
              maxLength={SHOP_PROFILE_LIMITS.addressDetail}
              onChange={(event) => update('addressDetail', event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>영업시간</CardTitle>
          <p className="text-sm text-muted-foreground">
            비워 둔 요일은 고객에게 &quot;정보 없음&quot;으로 보여요. 자정을 넘기는 시각은 넣을 수
            없어요.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {form.hours.map((row, index) => {
              const field = `hours.${index}` as const;
              const label = WEEKDAY_LABELS[row.weekday];
              return (
                <li key={row.weekday} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="w-6 font-medium">{label}</span>
                    <label className="flex w-24 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.closed}
                        onChange={(event) => updateHours(index, { closed: event.target.checked })}
                        className="size-4 accent-primary"
                      />
                      쉬는 날
                    </label>
                    <Input
                      type="time"
                      aria-label={`${label}요일 여는 시각`}
                      aria-invalid={errors[field] ? true : undefined}
                      value={row.open}
                      disabled={row.closed}
                      onChange={(event) => updateHours(index, { open: event.target.value })}
                      className="w-32"
                    />
                    <span aria-hidden>~</span>
                    <Input
                      type="time"
                      aria-label={`${label}요일 닫는 시각`}
                      aria-invalid={errors[field] ? true : undefined}
                      value={row.close}
                      disabled={row.closed}
                      onChange={(event) => updateHours(index, { close: event.target.value })}
                      className="w-32"
                    />
                  </div>
                  <FieldError field={field} error={errors[field]} className="pl-9" />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>서비스 설명</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="고객에게 보여줄 샵 소개" field="description" error={errors.description}>
            <Textarea
              {...fieldProps('description')}
              rows={6}
              placeholder="예: 커트·펌 전문, 상담 후 시술해요"
              value={form.description}
              maxLength={SHOP_PROFILE_LIMITS.description}
              onChange={(event) => update('description', event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {form.description.length} / {SHOP_PROFILE_LIMITS.description}
            </p>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <p
          role="status"
          className={cn(
            'text-sm',
            status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {status.kind === 'idle' ? null : status.message}
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>

      <CategoryChangeDialog
        state={confirm}
        nextCategoryLabel={
          SHOP_CATEGORIES.find((category) => category.key === form.category)?.label ?? ''
        }
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirmStep1={confirmStep1}
        onConfirmStep2={() => submit(form, true)}
      />
    </form>
  );
}

/** 업종 변경 2단계 확인 창 (정민석 결정 10/28) */
export function CategoryChangeDialog({
  state,
  nextCategoryLabel,
  pending,
  onCancel,
  onConfirmStep1,
  onConfirmStep2,
}: {
  state: ConfirmState;
  nextCategoryLabel: string;
  pending: boolean;
  onCancel: () => void;
  onConfirmStep1: () => void;
  onConfirmStep2: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        {state?.step === 2 ? (
          <>
            <DialogHeader>
              <DialogTitle>지금 올린 매물과 메뉴가 모두 내려가요</DialogTitle>
              <DialogDescription>
                업종을 바꾸면 아래 내용이 바로 적용되고 되돌릴 수 없어요.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>
                예약대기·게시중 매물 <strong>{state.impact.openSlots}개</strong>가 모두 마감돼요
              </li>
              <li>
                메뉴 <strong>{state.impact.visibleMenus}개</strong>가 모두 숨겨져요. 새 업종에 맞게
                메뉴를 다시 등록해 주세요
              </li>
              <li>이미 예약된 매물은 그대로 진행돼요</li>
            </ul>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>업종을 정말 변경할까요?</DialogTitle>
            <DialogDescription>
              업종을 &apos;{nextCategoryLabel}&apos;(으)로 바꿔요.
            </DialogDescription>
          </DialogHeader>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          {state?.step === 2 ? (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={onConfirmStep2}
              disabled={pending}
            >
              {pending ? '바꾸는 중…' : '마감하고 변경하기'}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={onConfirmStep1} disabled={pending}>
              {pending ? '확인 중…' : '변경하기'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  field,
  error,
  children,
}: {
  label: string;
  field: ShopProfileField;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field}>{label}</Label>
      {children}
      <FieldError field={field} error={error} />
    </div>
  );
}

function FieldError({
  field,
  error,
  className,
}: {
  field: ShopProfileField;
  error?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p id={`${field}-error`} className={cn('text-sm text-destructive', className)}>
      {error}
    </p>
  );
}
