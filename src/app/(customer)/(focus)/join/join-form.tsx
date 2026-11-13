'use client';

import { useId, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { isPhoneInputFull, normalizePhone, PHONE_FORMAT_MESSAGE } from '@/lib/phone';
import { SITE_NAME } from '@/lib/site';
import { createCustomerAccount } from '@/server/auth/customer-account';

import {
  AGREEMENT_ITEMS,
  allChecked,
  allRequiredChecked,
  EMPTY_AGREEMENTS,
  toAgreementsInput,
  toggleAll,
  type AgreementState,
} from './agreements';

const JOIN_FAILED_MESSAGE = '가입하지 못했어요. 잠시 후 다시 시도해 주세요.';

type JoinFormProps = {
  /** 가입을 마치면 돌아갈 곳(로그인 콜백이 넘겨준 안전한 주소) */
  next: string;
};

/**
 * 첫 로그인 고객의 약관 동의와 휴대폰 번호 (C-104, J8). 주소: /join?next=... (D16)
 * 휴대폰 번호는 필수이고 문자 인증은 하지 않는다(11/2 결정, #183). 저장은 '시작하기'를 누를 때 가입과 함께 한다
 */
export function JoinForm({ next }: JoinFormProps) {
  const phoneId = useId();
  const [state, setState] = useState<AgreementState>(EMPTY_AGREEMENTS);
  const [phone, setPhone] = useState('');
  // 끝까지 쳤거나 칸을 벗어났는데 틀린 번호면 빨간 테두리. 다시 고치기 시작하면 지운다
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const phoneToSave = normalizePhone(phone, 'mobile');
  const canSubmit = allRequiredChecked(state) && phoneToSave !== null && !pending;

  function checkPhone(value: string) {
    if (value !== '' && !normalizePhone(value, 'mobile')) setPhoneInvalid(true);
  }

  function changePhone(value: string) {
    setPhone(value);
    setPhoneInvalid(false);
    if (isPhoneInputFull(value)) checkPhone(value);
  }

  function handleSubmit() {
    const agreements = toAgreementsInput(state);
    if (!agreements || !phoneToSave) return;
    setNotice(null);
    setError(null);
    startTransition(async () => {
      try {
        // 성공하면 서버가 next로 보내서 돌아오지 않는다(#47 4장)
        // 휴대폰 번호는 가입과 함께 저장한다(#183, 강규민 #192). 서버도 같은 규칙으로 다시 확인한다
        const result = await createCustomerAccount({ agreements, phone: phoneToSave, next });
        if (result.ok) return;
        // 다른 창에서 먼저 가입을 마친 경우. 이미 계정이 있으니 보던 화면으로 보낸다
        if (result.error.code === 'ALREADY_EXISTS') {
          router.replace(next);
          return;
        }
        setError(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setError(JOIN_FAILED_MESSAGE);
      }
    });
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8">
      <BackButton className="-ml-2 self-start max-md:size-10" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{SITE_NAME} 이용을 위해 동의해 주세요</h1>
        <p className="text-sm text-muted-foreground">
          휴대폰 번호를 입력하고 필수 항목에 모두 동의하면 시작할 수 있어요. 선택 항목은 동의하지
          않아도 돼요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={phoneId}>
          <span className="text-primary">[필수]</span> 휴대폰 번호
        </Label>
        <PhoneInput
          id={phoneId}
          // 공통 Input은 h-9·text-sm이다. 예약 확인·내 정보 화면과 같게 조금 크게 쓴다
          className="h-11 text-base"
          value={phone}
          aria-describedby={`${phoneId}-help`}
          aria-invalid={phoneInvalid || undefined}
          onValueChange={changePhone}
          onBlur={() => checkPhone(phone)}
        />
        {phoneInvalid ? (
          <p id={`${phoneId}-help`} role="alert" className="text-sm text-destructive">
            {PHONE_FORMAT_MESSAGE}
          </p>
        ) : (
          <p id={`${phoneId}-help`} className="text-xs text-muted-foreground">
            예약 확인과 노쇼 연락에만 써요.
          </p>
        )}
      </div>

      <label className="flex items-center gap-3 rounded-xl border p-4 font-semibold">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={allChecked(state)}
          onChange={() => setState(toggleAll)}
        />
        전체 동의 (선택 항목 포함)
      </label>

      {/* 폰: 줄마다 누르는 칸을 40px로 키우고, 그만큼 줄 사이를 줄인다 */}
      <ul className="flex flex-col gap-4 px-1 max-md:gap-1">
        {AGREEMENT_ITEMS.map((item) => (
          <li key={item.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <label className="flex flex-1 items-center gap-3 max-md:min-h-10">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={state[item.key]}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setState((prev) => ({ ...prev, [item.key]: checked }));
                  }}
                />
                <span className="text-sm">
                  <span className={item.required ? 'text-primary' : 'text-muted-foreground'}>
                    [{item.required ? '필수' : '선택'}]
                  </span>{' '}
                  {item.label}
                </span>
              </label>
              {/* 약관 본문(docs/legal/, 법률 검토 전)은 검토가 끝나면 화면으로 연결한다 */}
              {item.hasDocument ? (
                <button
                  type="button"
                  className="flex items-center text-xs text-muted-foreground max-md:-mr-2 max-md:min-h-10 max-md:px-2"
                  aria-label={`${item.label} 내용 보기`}
                  onClick={() => setNotice('약관 내용은 준비 중이에요.')}
                >
                  보기
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            {item.description ? (
              <ul className="flex flex-col gap-0.5 pl-8 text-xs text-muted-foreground">
                {item.description.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        ) : notice ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="h-12 text-base"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {pending ? '가입하는 중…' : '시작하기'}
        </Button>
      </div>
    </section>
  );
}
