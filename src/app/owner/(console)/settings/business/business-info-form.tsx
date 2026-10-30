'use client';

// 매장 설정 > 사업자 정보 (O7 ②, S-101·S-102, #23 D3·D19).
// 승인 대기·반려면 고칠 수 있고, 반려면 [고쳐서 다시 신청하기]로 승인 대기로 돌린다. 승인 뒤에는 읽기 전용이다.
// 서버 값으로 시작하는 폼이라, 받은 값이 바뀌면(저장 뒤, 떠났다 돌아왔을 때) 입력 칸도 그 값으로 맞춘다(기술 가이드 2장 ②).
// key로 새로 시작하면 "저장했어요" 문구까지 사라져서 이 방법을 쓴다.

import { useRef, useState, useTransition } from 'react';
import { cn } from 'cn';
import { ExternalLink, FileUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getBusinessDocUrl } from '@/server/storage/upload';

import { type BusinessInput, validateBusinessInput } from '../../../business-fields';
import { BUSINESS_DOC_ACCEPT, uploadBusinessDoc } from '../../../join/business-doc';
import { type BusinessFieldErrors, saveBusinessInfo } from './actions';
import type { BusinessInfo } from './business-info-store';

type Field = keyof BusinessInput;

const FIELDS: { field: Exclude<Field, 'businessDocPath' | 'openedOn'>; label: string }[] = [
  { field: 'businessName', label: '상호' },
  { field: 'representativeName', label: '대표자명' },
  { field: 'businessRegistrationNumber', label: '사업자등록번호' },
];

export function BusinessInfoForm({
  shopId,
  today,
  initial,
}: {
  shopId: string;
  today: string;
  initial: BusinessInfo;
}) {
  if (initial.status === 'approved') return <BusinessInfoReadOnly shopId={shopId} info={initial} />;
  return <BusinessInfoEditor shopId={shopId} today={today} initial={initial} />;
}

function BusinessInfoEditor({
  shopId,
  today,
  initial,
}: {
  shopId: string;
  today: string;
  initial: BusinessInfo;
}) {
  const rejected = initial.status === 'rejected';
  const [form, setForm] = useState<BusinessInput>(() => toInput(initial));
  const [errors, setErrors] = useState<BusinessFieldErrors>({});
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  // 새로 올린 등록증 파일 이름과 올리는 중인지(올리기 전에는 저장된 파일을 보여준다)
  const [doc, setDoc] = useState<{ name: string; uploading: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const docInput = useRef<HTMLInputElement>(null);

  // 받은 값이 바뀌었으면 입력 칸도 맞춘다(그리는 중에 이전 값과 비교, 기술 가이드 2장 ②)
  const [received, setReceived] = useState(() => JSON.stringify(initial));
  const current = JSON.stringify(initial);
  if (current !== received) {
    setReceived(current);
    setForm(toInput(initial));
    setDoc(null);
    setErrors({});
  }

  function update(field: Field, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setStatus(null);
  }

  async function chooseDoc(file: File | undefined) {
    if (!file) return;
    setDoc({ name: file.name, uploading: true });
    setStatus(null);
    const result = await uploadBusinessDoc(file, shopId);
    if (result.ok) {
      update('businessDocPath', result.path);
      setDoc({ name: file.name, uploading: false });
    } else {
      setDoc(null);
      setErrors((prev) => ({ ...prev, businessDocPath: result.message }));
    }
  }

  function save() {
    setStatus(null);
    const checked = validateBusinessInput(form, today);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      setStatus({ kind: 'error', text: '입력한 내용을 다시 확인해 주세요' });
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveBusinessInfo(shopId, form, { resubmit: rejected });
      if (result.ok) {
        // 반려였으면 서버 값이 승인 대기로 바뀌어 반려 안내가 사라진다
        setStatus({
          kind: 'saved',
          text: rejected ? '다시 신청했어요. 운영팀이 다시 확인해요' : '저장했어요',
        });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setStatus({ kind: 'error', text: result.error.message });
    });
  }

  const fieldProps = (field: Field) => ({
    id: field,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });
  const busy = pending || doc?.uploading === true;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {rejected ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-semibold text-destructive">입점 신청이 반려됐어요</p>
          <p>사유: {initial.rejectionReason ?? '-'}</p>
          <p className="text-muted-foreground">
            사유에 맞게 고친 뒤 [고쳐서 다시 신청하기]를 누르면 다시 승인 대기로 바뀌어요.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          승인 대기 중이에요. 승인 전까지는 사업자 정보를 고칠 수 있어요. 승인 뒤에는 고칠 수
          없어요.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>사업자 정보</CardTitle>
          <p className="text-sm text-muted-foreground">사업자등록증과 같게 입력해 주세요.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {FIELDS.map(({ field, label }) => (
            <FieldBox key={field} label={label} field={field} error={errors[field]}>
              <Input
                {...fieldProps(field)}
                value={form[field]}
                inputMode={field === 'businessRegistrationNumber' ? 'numeric' : undefined}
                onChange={(event) => update(field, event.target.value)}
              />
            </FieldBox>
          ))}
          <FieldBox label="개업일자" field="openedOn" error={errors.openedOn}>
            <Input
              {...fieldProps('openedOn')}
              type="date"
              max={today}
              value={form.openedOn}
              onChange={(event) => update('openedOn', event.target.value)}
            />
          </FieldBox>
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
              {doc ? null : <ViewDocButton shopId={shopId} />}
              <Button
                {...fieldProps('businessDocPath')}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => docInput.current?.click()}
              >
                <FileUp aria-hidden />
                다시 올리기
              </Button>
              {doc ? (
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {doc.uploading
                    ? `${doc.name} 올리는 중…`
                    : `${doc.name} 올렸어요. 저장해야 바뀌어요`}
                </span>
              ) : null}
            </div>
            <FieldError field="businessDocPath" error={errors.businessDocPath} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {status ? (
          <span
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'text-sm',
              status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {status.text}
          </span>
        ) : null}
        <Button type="submit" size="lg" disabled={busy}>
          {pending ? '저장 중…' : rejected ? '고쳐서 다시 신청하기' : '저장'}
        </Button>
      </div>
    </form>
  );
}

/** 승인 뒤: 읽기 전용(D19). 변경은 카카오톡 채널로 문의하면 운영자가 바꾼다(W18) */
function BusinessInfoReadOnly({ shopId, info }: { shopId: string; info: BusinessInfo }) {
  const rows: [string, string][] = [
    ['상호', info.businessName],
    ['대표자명', info.representativeName],
    ['사업자등록번호', formatBrn(info.businessRegistrationNumber)],
    ['개업일자', info.openedOn],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>사업자 정보</CardTitle>
        <p className="text-sm text-muted-foreground">
          입점 승인 뒤에는 사업자 정보를 고칠 수 없어요. 변경은 투리 카카오톡 채널로 문의해 주세요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <ViewDocButton shopId={shopId} />
        </div>
      </CardContent>
    </Card>
  );
}

/** 저장된 등록증을 새 탭에서 연다(비공개 파일이라 잠깐 열리는 주소를 받아 연다) */
function ViewDocButton({ shopId }: { shopId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          // 팝업 차단을 피하려고 누르는 순간 창을 먼저 열고 주소를 받으면 옮긴다
          const opened = window.open('', '_blank');
          startTransition(async () => {
            const result = await getBusinessDocUrl(shopId);
            if (result.ok && opened) {
              opened.location.href = result.data.url;
              return;
            }
            opened?.close();
            setError(
              result.ok ? '새 창을 열 수 없어요. 팝업 차단을 확인해 주세요' : result.error.message,
            );
          });
        }}
      >
        <ExternalLink aria-hidden />
        등록증 보기
      </Button>
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  );
}

/** 저장된 값 → 입력 칸 값 */
function toInput(info: BusinessInfo): BusinessInput {
  return {
    businessName: info.businessName,
    representativeName: info.representativeName,
    businessRegistrationNumber: formatBrn(info.businessRegistrationNumber),
    openedOn: info.openedOn,
    businessDocPath: info.businessDocPath,
  };
}

/** 숫자 10자리 → 123-45-67890 */
function formatBrn(digits: string): string {
  return /^\d{10}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    : digits;
}

function FieldBox({
  label,
  field,
  error,
  children,
}: {
  label: string;
  field: Field;
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

function FieldError({ field, error }: { field: Field; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${field}-error`} className="text-sm text-destructive">
      {error}
    </p>
  );
}
