'use client';

// 샵 정보 입력 폼 (O2, S-103). 저장 전에 화면에서 한 번 검사하고, 서버 함수가 다시 검사한다.

import { useState, useTransition } from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { GeocodeCandidate } from '@/features/map/geocode';
import { SHOP_CATEGORIES } from '@/server/policy/catalog';

import { saveShopProfile } from './actions';
import { AddressSearchButton } from './address-search-button';
import {
  type HoursRow,
  SHOP_PROFILE_LIMITS,
  type ShopProfileField,
  type ShopProfileFieldErrors,
  type ShopProfileInput,
  validateShopProfile,
  WEEKDAY_LABELS,
} from './shop-profile';

type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

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

  function save(next: ShopProfileInput) {
    const checked = validateShopProfile(next);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      setStatus({ kind: 'error', message: '입력한 내용을 다시 확인해 주세요' });
      return;
    }
    setErrors({});
    setCandidates([]);
    startTransition(async () => {
      const result = await saveShopProfile(shopId, next);
      if (result.ok) {
        setStatus({ kind: 'saved' });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setCandidates(result.error.candidates ?? []);
      setStatus({ kind: 'error', message: result.error.message });
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
          {status.kind === 'saved' ? '저장했어요' : null}
          {status.kind === 'error' ? status.message : null}
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
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
