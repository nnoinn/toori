'use client';

// 원장님 가입 화면의 칸 묶음 5개(원장님 정보, 사업자 정보, 샵 정보, 정산 계좌, 약관 동의).
// 입력값·오류 상태와 저장은 owner-join-form.tsx 한 곳에 두고, 여기는 그 값을 받아 그리기만 한다.
// 묶음마다 나눠 두면 한 묶음을 고칠 때 다른 묶음을 같이 읽지 않아도 된다.

import { useRef } from 'react';
import { ChevronRight, FileUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DigitInput } from '@/components/ui/digit-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import type { GeocodeCandidate } from '@/features/map/geocode';
import { BUSINESS_NUMBER_INPUT } from '@/lib/business-number';
import { BANKS } from '@/server/policy';
import { SHOP_CATEGORIES } from '@/server/policy/catalog';

import { AddressSearchButton } from '../(console)/settings/shop/address-search-button';
import { ACCOUNT_NUMBER_INPUT } from '../business-fields';
import { FieldError, fieldA11y, FormField, NATIVE_SELECT_CLASS } from '../form-field';
import { BUSINESS_DOC_ACCEPT } from './business-doc';
import {
  OWNER_AGREEMENT_ITEMS,
  type OwnerJoinField,
  type OwnerJoinFieldErrors,
  type OwnerJoinForm as OwnerJoinFormValues,
} from './owner-join';

/** 칸 묶음이 같이 받는 입력값·오류와 값을 바꾸는 함수 */
export type JoinFormBinding = {
  form: OwnerJoinFormValues;
  errors: OwnerJoinFieldErrors;
  update: <K extends keyof OwnerJoinFormValues>(key: K, value: OwnerJoinFormValues[K]) => void;
};

/** 올린 사업자등록증 파일 이름과 올리는 중인지 */
export type BusinessDocUpload = { name: string; uploading: boolean };

type TextField = Exclude<OwnerJoinField, 'agreements' | 'category' | 'bankCode'>;
type DigitField = 'ownerPhone' | 'businessRegistrationNumber' | 'shopPhone' | 'accountNumber';

/** 글자 칸(Input)에 펼쳐 넣을 id·오류 연결·값·바꾸기 */
function textProps({ form, errors, update }: JoinFormBinding, field: TextField) {
  return {
    ...fieldA11y(field, errors[field]),
    value: form[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => update(field, event.target.value),
  };
}

/** 번호 칸(#205): 숫자만 쳐도 양식대로 맞추는 PhoneInput·DigitInput에 넘긴다 */
function digitProps({ form, errors, update }: JoinFormBinding, field: DigitField) {
  return {
    ...fieldA11y(field, errors[field]),
    value: form[field],
    onValueChange: (value: string) => update(field, value),
  };
}

export function OwnerInfoSection({ binding }: { binding: JoinFormBinding }) {
  const { errors } = binding;
  return (
    <Card>
      <CardHeader>
        <CardTitle>원장님 정보</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <FormField label="이름" id="ownerName" error={errors.ownerName}>
          <Input {...textProps(binding, 'ownerName')} autoComplete="name" />
        </FormField>
        <FormField label="휴대폰 번호" id="ownerPhone" error={errors.ownerPhone}>
          <PhoneInput {...digitProps(binding, 'ownerPhone')} />
        </FormField>
      </CardContent>
    </Card>
  );
}

/**
 * 사업자 정보. 등록증은 파일을 고르는 즉시 올리고(onChooseDoc), 올린 경로를 입력값으로 갖는다.
 * 파일 고르기 칸은 숨기고 [파일 올리기] 버튼으로 연다(기본 파일 칸은 모양을 바꾸기 어렵다).
 */
export function BusinessSection({
  binding,
  today,
  doc,
  busy,
  onChooseDoc,
}: {
  binding: JoinFormBinding;
  /** 한국 날짜(YYYY-MM-DD). 개업일자를 오늘 뒤로 고르지 못하게 한다 */
  today: string;
  doc: BusinessDocUpload | null;
  /** 신청 중이거나 등록증을 올리는 중이면 버튼을 막는다 */
  busy: boolean;
  onChooseDoc: (file: File | undefined) => void;
}) {
  const { form, errors } = binding;
  const docInput = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>사업자 정보</CardTitle>
        <p className="text-sm text-muted-foreground">
          사업자등록증과 같게 입력해 주세요. 입점 심사에 써요.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <FormField label="상호" id="businessName" error={errors.businessName}>
          <Input {...textProps(binding, 'businessName')} />
        </FormField>
        <FormField label="대표자명" id="representativeName" error={errors.representativeName}>
          <Input {...textProps(binding, 'representativeName')} />
        </FormField>
        <FormField
          label="사업자등록번호"
          id="businessRegistrationNumber"
          error={errors.businessRegistrationNumber}
        >
          <DigitInput
            {...digitProps(binding, 'businessRegistrationNumber')}
            rule={BUSINESS_NUMBER_INPUT}
            placeholder="123-45-67890"
          />
        </FormField>
        <FormField label="개업일자" id="openedOn" error={errors.openedOn}>
          <Input {...textProps(binding, 'openedOn')} type="date" max={today} />
        </FormField>
        <div className="col-span-2 flex flex-col gap-2">
          <Label htmlFor="businessDocPath">사업자등록증</Label>
          <input
            ref={docInput}
            type="file"
            accept={BUSINESS_DOC_ACCEPT}
            className="hidden"
            onChange={(event) => {
              onChooseDoc(event.target.files?.[0]);
              // 같은 파일을 다시 골라도 onChange가 오도록 비운다
              event.target.value = '';
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              {...fieldA11y('businessDocPath', errors.businessDocPath)}
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
          <FieldError id="businessDocPath" error={errors.businessDocPath} />
          <p className="text-xs text-muted-foreground">
            등록증은 입점 심사에만 쓰고 고객에게는 보이지 않아요.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 샵 정보. 주소는 직접 치지 않고 [주소 찾기]로만 고른다(서버가 이 주소로 좌표를 만든다).
 * 서버가 주소를 하나로 정하지 못하면 후보(candidates)를 보여 주고, 고르면 onChooseCandidate로 바로 다시 신청한다.
 */
export function ShopSection({
  binding,
  candidates,
  pending,
  onAddressSelect,
  onAddressError,
  onChooseCandidate,
}: {
  binding: JoinFormBinding;
  candidates: GeocodeCandidate[];
  /** 신청 중이면 후보 버튼을 막는다 */
  pending: boolean;
  onAddressSelect: (roadAddress: string) => void;
  onAddressError: (message: string) => void;
  onChooseCandidate: (roadAddress: string) => void;
}) {
  const { form, errors, update } = binding;
  return (
    <Card>
      <CardHeader>
        <CardTitle>샵 정보</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <FormField label="샵 이름" id="shopName" error={errors.shopName}>
          <Input {...textProps(binding, 'shopName')} placeholder="고객에게 보이는 이름" />
        </FormField>
        <FormField label="업종" id="category" error={errors.category}>
          <select
            {...fieldA11y('category', errors.category)}
            className={NATIVE_SELECT_CLASS}
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
        </FormField>
        <FormField label="샵 전화번호" id="shopPhone" error={errors.shopPhone}>
          <PhoneInput {...digitProps(binding, 'shopPhone')} kind="any" autoComplete="off" />
        </FormField>
        <div className="col-span-2 flex flex-col gap-2">
          <Label htmlFor="roadAddress">주소</Label>
          <div className="flex gap-2">
            <Input
              {...fieldA11y('roadAddress', errors.roadAddress)}
              value={form.roadAddress}
              readOnly
              placeholder="주소 찾기를 눌러 골라 주세요"
            />
            <AddressSearchButton onSelect={onAddressSelect} onError={onAddressError} />
          </div>
          <FieldError id="roadAddress" error={errors.roadAddress} />
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
                      onClick={() => onChooseCandidate(candidate.roadAddress)}
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
        <FormField
          label="상세 주소(선택)"
          id="addressDetail"
          error={errors.addressDetail}
          className="col-span-2"
        >
          <Input {...textProps(binding, 'addressDetail')} placeholder="예: 2층 201호" />
        </FormField>
      </CardContent>
    </Card>
  );
}

export function PayoutSection({ binding }: { binding: JoinFormBinding }) {
  const { form, errors, update } = binding;
  return (
    <Card>
      <CardHeader>
        <CardTitle>정산 계좌</CardTitle>
        <p className="text-sm text-muted-foreground">
          이용이 끝난 예약의 정산금을 받을 계좌예요. 계좌번호는 암호화해서 저장하고, 화면에는
          뒷자리만 보여요.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <FormField label="은행" id="bankCode" error={errors.bankCode}>
          <select
            {...fieldA11y('bankCode', errors.bankCode)}
            className={NATIVE_SELECT_CLASS}
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
        </FormField>
        <FormField label="예금주" id="accountHolder" error={errors.accountHolder}>
          <Input {...textProps(binding, 'accountHolder')} />
        </FormField>
        <FormField
          label="계좌번호"
          id="accountNumber"
          error={errors.accountNumber}
          className="col-span-2"
        >
          <DigitInput
            {...digitProps(binding, 'accountNumber')}
            rule={ACCOUNT_NUMBER_INPUT}
            placeholder="숫자만 입력해 주세요"
          />
        </FormField>
      </CardContent>
    </Card>
  );
}

/**
 * 약관 동의(필수 3개). [전체 동의]는 하나라도 빠져 있으면 모두 켜고, 모두 켜져 있으면 모두 끈다.
 * 약관 본문은 법률 검토 전이라 [보기]를 누르면 "준비 중" 문구만 띄운다(onShowTerms).
 */
export function AgreementsSection({
  binding,
  onShowTerms,
}: {
  binding: JoinFormBinding;
  onShowTerms: () => void;
}) {
  const { form, errors, update } = binding;
  const allAgreed = Object.values(form.agreements).every(Boolean);
  return (
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
                onClick={onShowTerms}
              >
                보기
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <FieldError id="agreements" error={errors.agreements} />
      </CardContent>
    </Card>
  );
}
