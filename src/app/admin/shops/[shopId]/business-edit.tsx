'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DigitInput } from '@/components/ui/digit-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BUSINESS_NUMBER_INPUT, formatBusinessNumberInput } from '@/lib/business-number';
import { BUSINESS_DOC_ALLOWED_TYPES, UPLOAD_MAX_BYTES } from '@/server/policy';
import type { AdminBusinessFieldErrors } from '@/server/shops/business-info';
import { uploadToSignedUrl } from '@/server/storage/browser';
import { createAdminBusinessDocUploadUrl } from '@/server/storage/upload';

import { updateBusinessInfoAction } from './actions';

export type BusinessEditValues = {
  businessName: string;
  representativeName: string;
  /** 숫자 10자리 */
  businessRegistrationNumber: string;
  /** YYYY-MM-DD */
  openedOn: string;
  businessDocPath: string;
};

// 승인된 샵의 사업자 정보 수정(#50 4장, W18). 원장님이 카카오톡 채널로 보낸 내용을 운영자가 확인하고 고친다.
// 저장하면 서버 함수가 화면을 새로 읽게 해서 사업자 정보 칸이 새 값으로 바뀐다.
export function BusinessEdit({ shopId, current }: { shopId: string; current: BusinessEditValues }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initialForm(current));
  const [docName, setDocName] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AdminBusinessFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setForm(initialForm(current));
    setDocName(null);
    setFieldErrors({});
    setMessage(null);
    setOpen(true);
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function chooseDoc(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (!(BUSINESS_DOC_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      setMessage('JPG·PNG·WEBP 사진이나 PDF만 올릴 수 있어요');
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setMessage(`${UPLOAD_MAX_BYTES / 1_000_000}MB 이하 파일만 올릴 수 있어요`);
      return;
    }
    setUploading(true);
    try {
      const signed = await createAdminBusinessDocUploadUrl({
        shopId,
        contentType: file.type,
        size: file.size,
      });
      if (!signed.ok) {
        setMessage(signed.error.message);
        return;
      }
      const uploaded = await uploadToSignedUrl({
        bucket: 'business-docs',
        path: signed.data.path,
        token: signed.data.token,
        file,
      });
      if (!uploaded.ok) {
        setMessage(uploaded.error.message);
        return;
      }
      set('businessDocPath', uploaded.data.path);
      setDocName(file.name);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setMessage(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateBusinessInfoAction(shopId, form);
      if (result.ok) {
        setOpen(false);
        return;
      }
      setFieldErrors(result.error.fieldErrors ?? {});
      setMessage(result.error.message);
    });
  }

  const busy = pending || uploading;

  return (
    <>
      <Button variant="outline" size="sm" className="self-start" onClick={openDialog}>
        사업자 정보 수정
      </Button>

      <Dialog open={open} onOpenChange={(next) => (busy ? null : setOpen(next))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사업자 정보 수정</DialogTitle>
            <DialogDescription>
              원장님이 보낸 새 사업자등록증으로 내용을 확인한 뒤 고쳐 주세요. 사업자등록번호를
              바꾸면 정산 지급을 위한 셀러 등록을 다시 해야 해요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Field id="business-name" label="상호" error={fieldErrors.businessName}>
              <Input
                id="business-name"
                value={form.businessName}
                onChange={(event) => set('businessName', event.target.value)}
              />
            </Field>
            <Field id="representative-name" label="대표자명" error={fieldErrors.representativeName}>
              <Input
                id="representative-name"
                value={form.representativeName}
                onChange={(event) => set('representativeName', event.target.value)}
              />
            </Field>
            <Field
              id="business-number"
              label="사업자등록번호"
              error={fieldErrors.businessRegistrationNumber}
            >
              <DigitInput
                id="business-number"
                rule={BUSINESS_NUMBER_INPUT}
                value={form.businessRegistrationNumber}
                onValueChange={(value) => set('businessRegistrationNumber', value)}
              />
            </Field>
            <Field id="opened-on" label="개업일자" error={fieldErrors.openedOn}>
              <Input
                id="opened-on"
                type="date"
                value={form.openedOn}
                onChange={(event) => set('openedOn', event.target.value)}
              />
            </Field>
            <Field
              id="business-doc"
              label="사업자등록증 (바꿀 때만)"
              error={fieldErrors.businessDocPath}
            >
              <Input
                id="business-doc"
                type="file"
                accept={BUSINESS_DOC_ALLOWED_TYPES.join(',')}
                disabled={busy}
                onChange={(event) => void chooseDoc(event.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                {uploading
                  ? '올리는 중이에요…'
                  : docName
                    ? `새 등록증을 올렸어요: ${docName}`
                    : '고르지 않으면 지금 등록증을 그대로 둬요'}
              </p>
            </Field>
            <Field id="business-reason" label="변경 사유" error={fieldErrors.reason}>
              <Textarea
                id="business-reason"
                value={form.reason}
                onChange={(event) => set('reason', event.target.value)}
                placeholder="예: 11/10 카카오톡 문의, 상호 변경"
                rows={3}
              />
            </Field>
          </div>

          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={save} disabled={busy || form.reason.trim() === ''}>
              저장하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function initialForm(current: BusinessEditValues) {
  return {
    ...current,
    businessRegistrationNumber: formatBusinessNumberInput(current.businessRegistrationNumber),
    reason: '',
  };
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
