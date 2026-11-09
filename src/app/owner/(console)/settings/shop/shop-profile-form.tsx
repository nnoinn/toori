'use client';

// 샵 정보 입력 폼 (O2, S-103). 저장 전에 화면에서 한 번 검사하고, 서버 함수가 다시 검사한다.
// 영업시간 칸은 business-hours-editor.tsx가 그리고, 값과 오류는 이 폼이 한 곳에서 갖는다.

import { useState, useTransition } from 'react';
import Link from 'next/link';
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
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import type { GeocodeCandidate } from '@/features/map/geocode';
import { categoryLabel, SHOP_CATEGORIES } from '@/server/policy/catalog';

import { fieldA11y, FormField } from '../../../form-field';
import { withDirectionParticle } from '../../../korean';
import { ChoiceChips } from '../../choice-chips';
import { getCategoryChangeImpact, saveShopProfile } from './actions';
import { AddressSearchButton } from './address-search-button';
import { BusinessHoursEditor } from './business-hours-editor';
import type { CategoryChangeImpact } from './category-change-store';
import {
  CATEGORY_CHANGE_BLOCKED_MESSAGE,
  type HoursRow,
  SHOP_PROFILE_LIMITS,
  type ShopProfileField,
  type ShopProfileFieldErrors,
  type ShopProfileInput,
  validateShopProfile,
} from './shop-profile';

type Status =
  | { kind: 'idle' }
  | { kind: 'saved'; message: string; showMenuLink?: boolean }
  | { kind: 'error'; message: string };

/**
 * 업종 변경 확인 창(10/29 결정). 1단계 "정말 변경할까요?" → 2단계 "메뉴 N개가 초기화돼요".
 * 판매 전·예약된 매물이 있으면 1단계 다음에 바꿀 수 없다는 안내(blocked)를 보여준다
 */
type ConfirmState =
  | { step: 1 }
  | { step: 'blocked'; activeSlots: number }
  | { step: 2; impact: CategoryChangeImpact }
  | null;

export function ShopProfileForm({
  shopId,
  initial,
}: {
  shopId: string;
  initial: ShopProfileInput;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<ShopProfileFieldErrors>({});
  // 서버가 주소를 하나로 정하지 못했을 때 고를 후보
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  // 마지막으로 저장된 업종. 이것과 다르면 업종 변경 확인(2단계)을 거친다
  const [savedCategory, setSavedCategory] = useState(initial.category);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  /**
   * 칸 하나를 바꾼다. "저장했어요" 문구는 지금 입력과 헷갈리지 않게 지운다.
   * 칸 오류는 여기서 지우지 않고, 다시 [저장]할 때 새로 검사해서 바꾼다
   */
  function update<K extends keyof ShopProfileInput>(key: K, value: ShopProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus({ kind: 'idle' });
  }

  /** 영업시간 index번째 줄에서 바뀐 값만 덮어쓴다 */
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

  /**
   * 서버에 저장한다. confirmCategoryChange는 업종 변경 확인 창을 거쳤을 때만 true다.
   * 서버는 이 값 없이 업종이 바뀐 저장을 거절해서, 확인 없이 메뉴가 초기화되는 일을 막는다
   */
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
            ? `업종을 바꿨어요.${result.data.resetMenus > 0 ? ` 메뉴 ${result.data.resetMenus}개를 초기화했어요.` : ''} 새 업종에 맞는 메뉴를 등록해 주세요`
            : '저장했어요',
          showMenuLink: confirmCategoryChange,
        });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setCandidates(result.error.candidates ?? []);
      setStatus({ kind: 'error', message: result.error.message });
    });
  }

  /**
   * 1단계 "변경하기": 막는 매물·초기화될 메뉴 수를 받는다. 막는 매물이 있으면 안내를 보여주고,
   * 메뉴가 있으면 2단계를 띄우고, 둘 다 없으면 바로 저장한다
   */
  function confirmStep1() {
    startTransition(async () => {
      const impact = await getCategoryChangeImpact(shopId);
      if (!impact.ok) {
        setConfirm(null);
        setStatus({ kind: 'error', message: impact.error.message });
        return;
      }
      if (impact.data.activeSlots > 0) {
        setConfirm({ step: 'blocked', activeSlots: impact.data.activeSlots });
        return;
      }
      if (impact.data.menus === 0) {
        submit(form, true);
        return;
      }
      setConfirm({ step: 2, impact: impact.data });
    });
  }

  /**
   * 서버가 보여준 주소 후보를 골랐을 때. 후보는 저장이 주소 때문에 막혔을 때만 뜨므로
   * [저장]을 다시 누르지 않게 바로 다시 저장한다. setForm이 아직 반영되지 않아 새 값을 직접 넘긴다
   */
  function chooseCandidate(roadAddress: string) {
    const next = { ...form, roadAddress };
    setForm(next);
    save(next);
  }

  const fieldProps = (field: ShopProfileField) => fieldA11y(field, errors[field]);

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
          <FormField label="샵 이름" id="name" error={errors.name}>
            <Input
              {...fieldProps('name')}
              value={form.name}
              maxLength={SHOP_PROFILE_LIMITS.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </FormField>

          <ChoiceChips
            legend="업종"
            name="category"
            options={SHOP_CATEGORIES}
            value={form.category}
            onChange={(key) => update('category', key)}
            errorId="category"
            error={errors.category}
          />

          <FormField label="전화번호" id="phone" error={errors.phone}>
            {/* 숫자만 쳐도 앞자리(02·031·0507 등)에 맞춰 하이픈을 넣는다(#205) */}
            <PhoneInput
              {...fieldProps('phone')}
              kind="any"
              autoComplete="off"
              value={form.phone}
              onValueChange={(value) => update('phone', value)}
              className="max-w-60"
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>주소</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="도로명 주소" id="roadAddress" error={errors.roadAddress}>
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
          </FormField>

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

          <FormField label="상세 주소" id="addressDetail" error={errors.addressDetail}>
            <Input
              {...fieldProps('addressDetail')}
              placeholder="예: 2층 201호"
              value={form.addressDetail}
              maxLength={SHOP_PROFILE_LIMITS.addressDetail}
              onChange={(event) => update('addressDetail', event.target.value)}
            />
          </FormField>
        </CardContent>
      </Card>

      <BusinessHoursEditor hours={form.hours} errors={errors} onChange={updateHours} />

      <Card>
        <CardHeader>
          <CardTitle>서비스 설명</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField label="고객에게 보여줄 샵 소개" id="description" error={errors.description}>
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
          </FormField>
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
        {status.kind === 'saved' && status.showMenuLink ? (
          <Button asChild variant="outline" size="lg">
            <Link href="/owner/settings/menu">메뉴 등록하기</Link>
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>

      <CategoryChangeDialog
        state={confirm}
        nextCategoryLabel={categoryLabel(form.category)}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirmStep1={confirmStep1}
        onConfirmStep2={() => submit(form, true)}
      />
    </form>
  );
}

/** 업종 변경 2단계 확인 창 (10/29 nnoinn 결정, 기술 가이드 7장) */
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
        {state?.step === 'blocked' ? (
          <DialogHeader>
            <DialogTitle>지금은 업종을 바꿀 수 없어요</DialogTitle>
            <DialogDescription>{CATEGORY_CHANGE_BLOCKED_MESSAGE}</DialogDescription>
            <p className="pt-2 text-sm">
              판매 중이거나 예약된 매물 <strong>{state.activeSlots}개</strong>
            </p>
          </DialogHeader>
        ) : state?.step === 2 ? (
          <DialogHeader>
            <DialogTitle>메뉴 {state.impact.menus}개가 초기화돼요</DialogTitle>
            <DialogDescription>
              지금 등록한 메뉴(숨긴 메뉴 포함)가 모두 메뉴 목록에서 빠지고 되돌릴 수 없어요. 새
              업종에 맞게 메뉴를 다시 등록해 주세요.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle>업종을 정말 변경할까요?</DialogTitle>
            <DialogDescription>
              업종을 {withDirectionParticle(nextCategoryLabel)} 바꿔요.
            </DialogDescription>
          </DialogHeader>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={pending}>
            {state?.step === 'blocked' ? '닫기' : '취소'}
          </Button>
          {state?.step === 'blocked' ? null : state?.step === 2 ? (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={onConfirmStep2}
              disabled={pending}
            >
              {pending ? '바꾸는 중…' : '초기화하고 변경하기'}
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
