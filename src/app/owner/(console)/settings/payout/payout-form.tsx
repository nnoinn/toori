'use client';

// 매장 설정 > 정산 계좌 (O7 ②, S-107). 은행·예금주·계좌번호 뒷자리만 보여주고, [계좌 바꾸기]로 새로 입력한다.
// 저장 전 확인 창에 입력한 계좌번호 전체를 보여주고 확인받는다(#163). 저장한 뒤에는 뒷자리만 보여준다.
// 등록된 계좌가 없으면(시드 등 계좌 없이 만든 원장님) "등록된 정산 계좌가 없어요"와 등록 칸을 바로 보여준다(#213).

import { useState, useTransition } from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DigitInput } from '@/components/ui/digit-input';
import { Input } from '@/components/ui/input';
import { bankName, BANKS } from '@/server/policy';

import {
  ACCOUNT_NUMBER_INPUT,
  type PayoutInput,
  type PayoutValues,
  validatePayoutInput,
} from '../../../business-fields';
import { fieldA11y, FormField, NATIVE_SELECT_CLASS } from '../../../form-field';
import { PayoutConfirmDialog } from '../../../payout-confirm-dialog';
import { type PayoutFieldErrors, savePayoutAccount } from './actions';
import type { PayoutAccountView } from './payout-store';

const EMPTY: PayoutInput = { bankCode: '', accountNumber: '', accountHolder: '' };

/** 등록할 때와 바꿀 때 다른 문구 */
const MODE_TEXT = {
  register: {
    formTitle: '정산 계좌 등록',
    confirmDescription: '이용이 끝난 예약의 정산금을 이 계좌로 받아요.',
    confirmLabel: '맞아요, 등록하기',
    pendingLabel: '등록하는 중…',
    saved: '정산 계좌를 등록했어요',
  },
  change: {
    formTitle: '새 정산 계좌',
    confirmDescription: '다음 정산부터 이 계좌로 보내요.',
    confirmLabel: '맞아요, 바꾸기',
    pendingLabel: '바꾸는 중…',
    saved: '정산 계좌를 바꿨어요',
  },
} as const;

export function PayoutForm({
  shopId,
  account,
}: {
  shopId: string;
  /** 등록된 계좌. 없으면 null */
  account: PayoutAccountView | null;
}) {
  const text = MODE_TEXT[account ? 'change' : 'register'];
  // 계좌가 없으면 등록 칸을 처음부터 연다
  const [editing, setEditing] = useState(account === null);
  const [form, setForm] = useState<PayoutInput>(EMPTY);
  const [errors, setErrors] = useState<PayoutFieldErrors>({});
  // 확인 창에 보여줄 계좌(검사를 통과한 값)
  const [confirming, setConfirming] = useState<PayoutValues | null>(null);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // 받은 계좌가 바뀌었으면(저장 뒤, 다른 창에서 바꾼 뒤 돌아왔을 때) 입력 중이던 칸을 닫는다(기술 가이드 2장 ②).
  // key로 새로 시작하면 "정산 계좌를 바꿨어요" 문구까지 사라져서 이 방법을 쓴다
  const [received, setReceived] = useState(() => JSON.stringify(account));
  const current = JSON.stringify(account);
  if (current !== received) {
    setReceived(current);
    setEditing(account === null);
    setForm(EMPTY);
    setErrors({});
  }

  /** 칸 하나를 바꾼다. 고치기 시작하면 그 칸의 오류 문구는 바로 지운다 */
  function update(field: keyof PayoutInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  /**
   * [계좌 바꾸기]: 빈 칸으로 연다. 화면은 계좌번호 뒷자리만 알아서 지금 계좌를 채워 둘 수 없고,
   * 새 계좌를 처음부터 받아 확인 창에서 전체 번호를 확인받는다
   */
  function openEditor() {
    setForm(EMPTY);
    setErrors({});
    setStatus(null);
    setEditing(true);
  }

  /** [저장]: 화면에서 검사하고 확인 창을 띄운다 */
  function askConfirm() {
    const checked = validatePayoutInput(form);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      return;
    }
    setConfirming(checked.data);
  }

  /** 확인 창 [맞아요, …]: 저장한다. 실패하면 입력 칸을 연 채로 칸별 오류와 문구를 보여준다 */
  function save() {
    // 저장하면 계좌가 생겨서 문구가 '바꾸기'로 바뀌므로 누른 때의 문구를 쓴다
    const savedText = text.saved;
    startTransition(async () => {
      const result = await savePayoutAccount(shopId, form);
      setConfirming(null);
      if (result.ok) {
        setEditing(false);
        setForm(EMPTY);
        setStatus({ kind: 'saved', text: savedText });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setStatus({ kind: 'error', text: result.error.message });
    });
  }

  const fieldProps = (field: keyof PayoutInput) => fieldA11y(field, errors[field]);

  return (
    <div className="flex flex-col gap-4">
      {account ? (
        <Card>
          <CardHeader>
            <CardTitle>지금 정산 계좌</CardTitle>
            <p className="text-sm text-muted-foreground">
              이용이 끝난 예약의 정산금을 받는 계좌예요. 계좌번호는 암호화해서 저장하고 뒷자리만
              보여요.
            </p>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-4">
            <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">은행</dt>
              <dd>{bankName(account.bankCode)}</dd>
              <dt className="text-muted-foreground">계좌번호</dt>
              <dd>****{account.accountLast4}</dd>
              <dt className="text-muted-foreground">예금주</dt>
              <dd>{account.accountHolder}</dd>
            </dl>
            {editing ? null : (
              <Button type="button" variant="outline" size="lg" onClick={openEditor}>
                계좌 바꾸기
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>등록된 정산 계좌가 없어요</CardTitle>
            <p className="text-sm text-muted-foreground">
              이용이 끝난 예약의 정산금을 받으려면 계좌를 등록해 주세요. 계좌번호는 암호화해서
              저장하고 뒷자리만 보여요.
            </p>
          </CardHeader>
        </Card>
      )}

      {status && !editing ? (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'text-sm',
            status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {status.text}
        </p>
      ) : null}

      {editing ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            askConfirm();
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>{text.formTitle}</CardTitle>
              <p className="text-sm text-muted-foreground">
                예금주는 통장에 적힌 이름과 똑같이 입력해 주세요.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField label="은행" id="bankCode" error={errors.bankCode}>
                <select
                  {...fieldProps('bankCode')}
                  className={NATIVE_SELECT_CLASS}
                  value={form.bankCode}
                  onChange={(event) => update('bankCode', event.target.value)}
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
                <Input
                  {...fieldProps('accountHolder')}
                  value={form.accountHolder}
                  onChange={(event) => update('accountHolder', event.target.value)}
                />
              </FormField>
              <FormField
                label="계좌번호"
                id="accountNumber"
                error={errors.accountNumber}
                className="col-span-2"
              >
                {/* 숫자만 16자리까지(#205) */}
                <DigitInput
                  {...fieldProps('accountNumber')}
                  rule={ACCOUNT_NUMBER_INPUT}
                  placeholder="숫자만 입력해 주세요"
                  value={form.accountNumber}
                  onValueChange={(value) => update('accountNumber', value)}
                />
              </FormField>
              <div className="col-span-2 flex items-center justify-end gap-2">
                {status?.kind === 'error' ? (
                  <span role="alert" className="text-sm text-destructive">
                    {status.text}
                  </span>
                ) : null}
                {/* 등록할 때는 돌아갈 계좌가 없어서 [취소]가 없다 */}
                {account ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={pending}
                    onClick={() => setEditing(false)}
                  >
                    취소
                  </Button>
                ) : null}
                <Button type="submit" size="lg" disabled={pending}>
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}

      <PayoutConfirmDialog
        account={confirming}
        description={text.confirmDescription}
        confirmLabel={text.confirmLabel}
        pendingLabel={text.pendingLabel}
        pending={pending}
        onConfirm={save}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
