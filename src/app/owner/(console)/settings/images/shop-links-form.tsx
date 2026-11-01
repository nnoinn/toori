'use client';

// 인스타그램·네이버 플레이스 주소 (O6, S-105). 비워 둬도 된다. 저장 전에 화면에서 한 번 검사하고, 서버 함수가 다시 검사한다.

import { useState, useTransition } from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { saveShopLinks } from './actions';
import {
  SHOP_LINK_RULES,
  type ShopLinkErrors,
  type ShopLinkField,
  type ShopLinks,
  validateShopLinks,
} from './shop-images';

const FIELDS = Object.keys(SHOP_LINK_RULES) as ShopLinkField[];

export function ShopLinksForm({ shopId, initial }: { shopId: string; initial: ShopLinks }) {
  const [form, setForm] = useState<Record<ShopLinkField, string>>({
    instagramUrl: initial.instagramUrl ?? '',
    naverPlaceUrl: initial.naverPlaceUrl ?? '',
  });
  const [errors, setErrors] = useState<ShopLinkErrors>({});
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus(null);
    const checked = validateShopLinks(form);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveShopLinks(shopId, form);
      if (result.ok) {
        // 저장한 모양(앞뒤 빈칸을 뺀 주소)으로 칸을 맞춘다
        setForm({
          instagramUrl: checked.data.instagramUrl ?? '',
          naverPlaceUrl: checked.data.naverPlaceUrl ?? '',
        });
        setStatus({ kind: 'saved', text: '저장했어요' });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setStatus({ kind: 'error', text: result.error.message });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>외부 링크</CardTitle>
        <p className="text-sm text-muted-foreground">
          고객이 매물 상세 화면에서 눌러 볼 수 있어요. 없으면 비워 두세요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {FIELDS.map((field) => {
          const rule = SHOP_LINK_RULES[field];
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={field}>{rule.label}</Label>
              <Input
                id={field}
                type="url"
                inputMode="url"
                placeholder={`https://${rule.hosts[0]}/...`}
                value={form[field]}
                aria-invalid={errors[field] ? true : undefined}
                aria-describedby={errors[field] ? `${field}-error` : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, [field]: value }));
                  setStatus(null);
                }}
              />
              {errors[field] ? (
                <p id={`${field}-error`} className="text-sm text-destructive">
                  {errors[field]}
                </p>
              ) : null}
            </div>
          );
        })}
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
          <Button size="lg" onClick={save} disabled={pending}>
            {pending ? '저장 중…' : '저장'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
