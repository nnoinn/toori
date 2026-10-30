'use client';

// 매장 설정 > 정산 계좌 (O7 ②, S-107). 은행·예금주·계좌번호 뒷자리만 보여주고, [계좌 바꾸기]로 새로 입력한다.
// 바꾸기 전에 확인 창을 한 번 띄운다. 전체 계좌번호는 화면에 다시 보여주지 않는다.

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
import { BANKS } from '@/server/policy';

import { type PayoutInput, validatePayoutInput } from '../../../business-fields';
import { type PayoutFieldErrors, savePayoutAccount } from './actions';
import type { PayoutAccountView } from './payout-store';

const EMPTY: PayoutInput = { bankCode: '', accountNumber: '', accountHolder: '' };
const SELECT_CLASS =
  'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

export function bankName(code: string): string {
  return BANKS.find((bank) => bank.code === code)?.name ?? code;
}

export function PayoutForm({ shopId, account }: { shopId: string; account: PayoutAccountView }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PayoutInput>(EMPTY);
  const [errors, setErrors] = useState<PayoutFieldErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // 받은 계좌가 바뀌었으면(저장 뒤, 다른 창에서 바꾼 뒤 돌아왔을 때) 입력 중이던 칸을 닫는다(기술 가이드 2장 ②).
  // key로 새로 시작하면 "정산 계좌를 바꿨어요" 문구까지 사라져서 이 방법을 쓴다
  const [received, setReceived] = useState(() => JSON.stringify(account));
  const current = JSON.stringify(account);
  if (current !== received) {
    setReceived(current);
    setEditing(false);
    setForm(EMPTY);
    setErrors({});
  }

  function update(field: keyof PayoutInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

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
    setConfirming(true);
  }

  function save() {
    startTransition(async () => {
      const result = await savePayoutAccount(shopId, form);
      setConfirming(false);
      if (result.ok) {
        setEditing(false);
        setForm(EMPTY);
        setStatus({ kind: 'saved', text: '정산 계좌를 바꿨어요' });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setStatus({ kind: 'error', text: result.error.message });
    });
  }

  const fieldProps = (field: keyof PayoutInput) => ({
    id: field,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
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
              <CardTitle>새 정산 계좌</CardTitle>
              <p className="text-sm text-muted-foreground">
                예금주는 통장에 적힌 이름과 똑같이 입력해 주세요.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FieldBox label="은행" field="bankCode" error={errors.bankCode}>
                <select
                  {...fieldProps('bankCode')}
                  className={SELECT_CLASS}
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
              </FieldBox>
              <FieldBox label="예금주" field="accountHolder" error={errors.accountHolder}>
                <Input
                  {...fieldProps('accountHolder')}
                  value={form.accountHolder}
                  onChange={(event) => update('accountHolder', event.target.value)}
                />
              </FieldBox>
              <FieldBox
                label="계좌번호"
                field="accountNumber"
                error={errors.accountNumber}
                className="col-span-2"
              >
                <Input
                  {...fieldProps('accountNumber')}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="숫자만 입력해 주세요"
                  value={form.accountNumber}
                  onChange={(event) => update('accountNumber', event.target.value)}
                />
              </FieldBox>
              <div className="col-span-2 flex items-center justify-end gap-2">
                {status?.kind === 'error' ? (
                  <span role="alert" className="text-sm text-destructive">
                    {status.text}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending}
                  onClick={() => setEditing(false)}
                >
                  취소
                </Button>
                <Button type="submit" size="lg" disabled={pending}>
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}

      <Dialog open={confirming} onOpenChange={(open) => !open && !pending && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>정산 계좌를 바꿀까요?</DialogTitle>
            <DialogDescription>
              {bankName(form.bankCode)} ****{form.accountNumber.replace(/\D/g, '').slice(-4)} (
              {form.accountHolder.trim()})으로 바꿔요. 다음 정산부터 새 계좌로 보내요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              취소
            </Button>
            <Button type="button" size="lg" disabled={pending} onClick={save}>
              {pending ? '바꾸는 중…' : '바꾸기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldBox({
  label,
  field,
  error,
  className,
  children,
}: {
  label: string;
  field: keyof PayoutInput;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={field}>{label}</Label>
      {children}
      {error ? (
        <p id={`${field}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
