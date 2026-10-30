'use client';

// 원장님 가입·입점 신청 입력 (O7 ①, S-101 화면·S-107·S-108, #23 D3·D17). 가입 때는 필수만 받는다(D17).
// [입점 신청하기]를 누르면 화면에서 한 번 검사하고, 강규민님 createOwnerAccount가 다시 검사한 뒤 샵을 '승인 대기'로 만든다.
// 성공하면 /owner로 가고 거기서 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(joined-notice.tsx).

import { useRef, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { cn } from 'cn';
import { ChevronRight, FileUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GeocodeCandidate } from '@/features/map/geocode';
import { SITE_NAME } from '@/lib/site';
import { createOwnerAccount } from '@/server/auth/owner-account';
import { BANKS } from '@/server/policy';
import { SHOP_CATEGORIES } from '@/server/policy/catalog';

import { AddressSearchButton } from '../(console)/settings/shop/address-search-button';
import { BUSINESS_DOC_ACCEPT, uploadBusinessDoc } from './business-doc';
import { clearJoinPending, markJoinPending } from './joined-notice';
import {
  EMPTY_OWNER_JOIN_FORM,
  OWNER_AGREEMENT_ITEMS,
  OWNER_JOIN_FIELD_ORDER,
  type OwnerJoinField,
  type OwnerJoinFieldErrors,
  type OwnerJoinForm as OwnerJoinFormValues,
  validateOwnerJoin,
} from './owner-join';

const JOIN_FAILED_MESSAGE = '입점 신청을 하지 못했어요. 잠시 후 다시 시도해 주세요.';
const SELECT_CLASS =
  'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

export function OwnerJoinForm({ today }: { today: string }) {
  const router = useRouter();
  const [form, setForm] = useState<OwnerJoinFormValues>(EMPTY_OWNER_JOIN_FORM);
  const [errors, setErrors] = useState<OwnerJoinFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  // 올린 등록증 파일 이름과 올리는 중인지
  const [doc, setDoc] = useState<{ name: string; uploading: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const docInput = useRef<HTMLInputElement>(null);

  function update<K extends keyof OwnerJoinFormValues>(key: K, value: OwnerJoinFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  /** 처음 오류가 난 칸으로 옮긴다 */
  function focusFirstError(fieldErrors: OwnerJoinFieldErrors) {
    const first = OWNER_JOIN_FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!first) return;
    const element = document.getElementById(first);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  }

  function submit(values: OwnerJoinFormValues) {
    setFormError(null);
    setNotice(null);
    const checked = validateOwnerJoin(values, today);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      focusFirstError(checked.fieldErrors);
      return;
    }
    setErrors({});
    // 성공하면 저장이 바꾼 쿠키 때문에 이 화면이 다시 그려지면서 바로 /owner로 넘어가서, 여기로 돌아오지 않을 수 있다.
    // 그래서 부르기 전에 표시를 남기고, /owner가 그 표시로 안내 상자를 띄운다
    markJoinPending();
    startTransition(async () => {
      try {
        const result = await createOwnerAccount(checked.data);
        if (result.ok) {
          router.replace('/owner');
          return;
        }
        clearJoinPending();
        const { code, message } = result.error;
        // 다른 창에서 먼저 가입을 마친 경우
        if (code === 'ALREADY_EXISTS') {
          router.replace('/owner');
          return;
        }
        let fieldErrors: OwnerJoinFieldErrors = {};
        if (code.startsWith('ADDRESS_')) {
          fieldErrors = { roadAddress: message };
          setCandidates(result.error.candidates ?? []);
        } else if (code === 'INVALID_PATH') {
          fieldErrors = { businessDocPath: message };
        } else if (code === 'REQUIRED_TERMS_MISSING') {
          fieldErrors = { agreements: message };
        } else {
          setFormError(message);
        }
        setErrors(fieldErrors);
        focusFirstError(fieldErrors);
      } catch (caught) {
        unstable_rethrow(caught);
        clearJoinPending();
        setFormError(JOIN_FAILED_MESSAGE);
      }
    });
  }

  function chooseCandidate(roadAddress: string) {
    const next = { ...form, roadAddress };
    setForm(next);
    setCandidates([]);
    submit(next);
  }

  async function chooseDoc(file: File | undefined) {
    if (!file) return;
    setDoc({ name: file.name, uploading: true });
    setErrors((prev) => ({ ...prev, businessDocPath: undefined }));
    const result = await uploadBusinessDoc(file);
    if (result.ok) {
      setForm((prev) => ({ ...prev, businessDocPath: result.path }));
      setDoc({ name: file.name, uploading: false });
    } else {
      setForm((prev) => ({ ...prev, businessDocPath: '' }));
      setDoc(null);
      setErrors((prev) => ({ ...prev, businessDocPath: result.message }));
    }
  }

  const fieldProps = (field: OwnerJoinField) => ({
    id: field,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });
  const text = (field: Exclude<OwnerJoinField, 'agreements' | 'category' | 'bankCode'>) => ({
    ...fieldProps(field),
    value: form[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => update(field, event.target.value),
  });

  const allAgreed = Object.values(form.agreements).every(Boolean);
  const busy = pending || doc?.uploading === true;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(form);
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">원장님 가입·입점 신청</h1>
        <p className="text-sm text-muted-foreground">
          입점 심사와 정산에 꼭 필요한 정보만 받아요. 영업시간·사진·메뉴는 승인을 기다리는 동안 매장
          설정에서 입력하면 돼요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>원장님 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="이름" field="ownerName" error={errors.ownerName}>
            <Input {...text('ownerName')} autoComplete="name" />
          </Field>
          <Field label="휴대폰 번호" field="ownerPhone" error={errors.ownerPhone}>
            <Input
              {...text('ownerPhone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="010-1234-5678"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>사업자 정보</CardTitle>
          <p className="text-sm text-muted-foreground">
            사업자등록증과 같게 입력해 주세요. 입점 심사에 써요.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="상호" field="businessName" error={errors.businessName}>
            <Input {...text('businessName')} />
          </Field>
          <Field label="대표자명" field="representativeName" error={errors.representativeName}>
            <Input {...text('representativeName')} />
          </Field>
          <Field
            label="사업자등록번호"
            field="businessRegistrationNumber"
            error={errors.businessRegistrationNumber}
          >
            <Input
              {...text('businessRegistrationNumber')}
              inputMode="numeric"
              placeholder="123-45-67890"
            />
          </Field>
          <Field label="개업일자" field="openedOn" error={errors.openedOn}>
            <Input {...text('openedOn')} type="date" max={today} />
          </Field>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="businessDocPath">사업자등록증</Label>
            <input
              ref={docInput}
              type="file"
              accept={BUSINESS_DOC_ACCEPT}
              className="hidden"
              onChange={(event) => {
                void chooseDoc(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                {...fieldProps('businessDocPath')}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => docInput.current?.click()}
              >
                <FileUp aria-hidden />
                {form.businessDocPath ? '다시 올리기' : '파일 올리기'}
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {doc?.uploading
                  ? `${doc.name} 올리는 중…`
                  : form.businessDocPath && doc
                    ? `${doc.name} 올렸어요`
                    : 'JPG·PNG·WEBP 사진이나 PDF'}
              </span>
            </div>
            <FieldError field="businessDocPath" error={errors.businessDocPath} />
            <p className="text-xs text-muted-foreground">
              등록증은 입점 심사에만 쓰고 고객에게는 보이지 않아요.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>샵 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="샵 이름" field="shopName" error={errors.shopName}>
            <Input {...text('shopName')} placeholder="고객에게 보이는 이름" />
          </Field>
          <Field label="업종" field="category" error={errors.category}>
            <select
              {...fieldProps('category')}
              className={SELECT_CLASS}
              value={form.category}
              onChange={(event) =>
                update('category', event.target.value as OwnerJoinFormValues['category'])
              }
            >
              <option value="">골라 주세요</option>
              {SHOP_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="샵 전화번호" field="shopPhone" error={errors.shopPhone}>
            <Input {...text('shopPhone')} type="tel" inputMode="tel" placeholder="031-123-4567" />
          </Field>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="roadAddress">주소</Label>
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
                }}
                onError={(message) => setErrors((prev) => ({ ...prev, roadAddress: message }))}
              />
            </div>
            <FieldError field="roadAddress" error={errors.roadAddress} />
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
          </div>
          <Field
            label="상세 주소(선택)"
            field="addressDetail"
            error={errors.addressDetail}
            className="col-span-2"
          >
            <Input {...text('addressDetail')} placeholder="예: 2층 201호" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>정산 계좌</CardTitle>
          <p className="text-sm text-muted-foreground">
            이용이 끝난 예약의 정산금을 받을 계좌예요. 계좌번호는 암호화해서 저장하고, 화면에는
            뒷자리만 보여요.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="은행" field="bankCode" error={errors.bankCode}>
            <select
              {...fieldProps('bankCode')}
              className={SELECT_CLASS}
              value={form.bankCode}
              onChange={(event) =>
                update('bankCode', event.target.value as OwnerJoinFormValues['bankCode'])
              }
            >
              <option value="">골라 주세요</option>
              {BANKS.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="예금주" field="accountHolder" error={errors.accountHolder}>
            <Input {...text('accountHolder')} />
          </Field>
          <Field
            label="계좌번호"
            field="accountNumber"
            error={errors.accountNumber}
            className="col-span-2"
          >
            <Input
              {...text('accountNumber')}
              inputMode="numeric"
              autoComplete="off"
              placeholder="숫자만 입력해 주세요"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>약관 동의</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-3 rounded-xl border p-4 font-semibold">
            <input
              id="agreements"
              type="checkbox"
              className="size-5 accent-primary"
              checked={allAgreed}
              onChange={() =>
                update('agreements', {
                  supplier: !allAgreed,
                  privacy: !allAgreed,
                  payoutInfo: !allAgreed,
                })
              }
            />
            전체 동의
          </label>
          <ul className="flex flex-col gap-3 px-1">
            {OWNER_AGREEMENT_ITEMS.map((item) => (
              <li key={item.key} className="flex items-center gap-3">
                <label className="flex flex-1 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={form.agreements[item.key]}
                    onChange={(event) =>
                      update('agreements', { ...form.agreements, [item.key]: event.target.checked })
                    }
                  />
                  <span>
                    <span className="text-primary">[필수]</span> {item.label}
                  </span>
                </label>
                {/* 약관 본문(docs/legal/, 법률 검토 전)은 검토가 끝나면 화면으로 연결한다(#20 R8) */}
                <button
                  type="button"
                  className="flex items-center text-xs text-muted-foreground"
                  aria-label={`${item.label} 내용 보기`}
                  onClick={() => setNotice('약관 내용은 준비 중이에요.')}
                >
                  보기
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <FieldError field="agreements" error={errors.agreements} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {formError ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {formError}
          </p>
        ) : notice ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="h-12 text-base" disabled={busy}>
          {pending ? '신청하는 중…' : '입점 신청하기'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {SITE_NAME} 운영팀이 확인한 뒤 승인되면 매물을 올릴 수 있어요.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  field,
  error,
  className,
  children,
}: {
  label: string;
  field: OwnerJoinField;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={field}>{label}</Label>
      {children}
      <FieldError field={field} error={error} />
    </div>
  );
}

function FieldError({ field, error }: { field: OwnerJoinField; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${field}-error`} className="text-sm text-destructive">
      {error}
    </p>
  );
}
