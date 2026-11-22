'use client';

import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { NATIVE_SELECT_CLASS } from '@/components/ui/native-select';
import {
  ADMIN_NOTICE_CODES_BY_USE,
  type AdminNoticeCode,
  adminNoticeText,
  type AdminNoticeUse,
} from '@/server/policy/admin-notice';

// 운영자 처리 창의 "원장님에게 보여 줄 사유" 고르기(#489). 정산 보류·게시 멈춤·강제 마감 창이 같이 쓴다.
// 목록은 정책 값(쓰는 곳마다 고를 수 있는 코드)에서 가져오고, 고르면 원장님에게 보일 문구를 바로 아래에 보여 준다
export function AdminNoticeSelect({
  use,
  value,
  onChange,
}: {
  use: AdminNoticeUse;
  value: AdminNoticeCode | '';
  onChange: (code: AdminNoticeCode | '') => void;
}) {
  const id = useId();
  const codes: readonly AdminNoticeCode[] = ADMIN_NOTICE_CODES_BY_USE[use];
  const preview = value ? adminNoticeText(value, use) : null;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>원장님에게 보여 줄 사유</Label>
      <select
        id={id}
        className={NATIVE_SELECT_CLASS}
        value={value}
        onChange={(event) => onChange(codes.find((code) => code === event.target.value) ?? '')}
      >
        <option value="" disabled>
          사유를 골라 주세요
        </option>
        {codes.map((code) => (
          <option key={code} value={code}>
            {adminNoticeText(code, use).label}
          </option>
        ))}
      </select>
      {preview ? (
        <p className="text-xs text-muted-foreground">
          원장님에게 이렇게 보여요: {preview.label}
          {preview.nextStep ? ` · ${preview.nextStep}` : ''}
        </p>
      ) : null}
    </div>
  );
}
