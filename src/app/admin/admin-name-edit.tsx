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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ADMIN_NAME_MAX_LENGTH, FALLBACK_ADMIN_NAME } from '@/server/admin/admin-name';

import { updateMyAdminNameAction } from './profile-actions';

/**
 * 화면 위 오른쪽 운영자 이름과 [이름 바꾸기] (11/16 nnoinn, AUTH-13). 이름을 아직 정하지 않았으면 '운영자'와 [이름 정하기].
 * 저장하면 서버 함수가 운영자 화면을 새로 읽게 해서 화면 위와 기록의 이름이 새 이름으로 바뀐다
 */
export function AdminNameEdit({ name }: { name: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setValue(name ?? '');
    setMessage(null);
    setOpen(true);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateMyAdminNameAction(value);
      if (result.ok) {
        setOpen(false);
        return;
      }
      setMessage(result.error.message);
    });
  }

  return (
    <>
      <span>
        <span className="font-medium">{name ?? FALLBACK_ADMIN_NAME}</span>
        <span className="text-muted-foreground"> 운영자</span>
      </span>
      <Button variant={name ? 'ghost' : 'outline'} size="sm" onClick={openDialog}>
        {name ? '이름 바꾸기' : '이름 정하기'}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (pending ? null : setOpen(next))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>운영자 이름</DialogTitle>
            <DialogDescription>
              운영자 기록과 화면 위에 보이는 이름이에요. 누가 처리했는지 알 수 있게 다른 운영자와
              같은 이름은 쓸 수 없어요. 바꾸면 지난 기록에도 새 이름으로 보여요.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-name">이름</Label>
              <Input
                id="admin-name"
                value={value}
                maxLength={ADMIN_NAME_MAX_LENGTH}
                autoFocus
                autoComplete="off"
                placeholder="예: 김투리"
                aria-invalid={message ? true : undefined}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            {message ? (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '저장 중…' : '저장'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
