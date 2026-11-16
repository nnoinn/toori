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
import { ADMIN_NAME_MAX_LENGTH } from '@/server/admin/admin-name';

import { updateMyAdminNameAction } from './profile-actions';

/**
 * 운영자 이름 정하기·바꾸기 창 (11/16 nnoinn, AUTH-14). 화면 위 오른쪽 프로필 메뉴(admin-profile-menu.tsx)의 [이름 바꾸기]가 연다.
 * 열 때마다 새로 그려서(부르는 쪽이 key를 바꾼다) 지금 이름과 빈 안내로 시작한다.
 * 저장하면 서버 함수가 운영자 화면을 새로 읽게 해서 화면 위와 기록의 이름이 새 이름으로 바뀐다
 */
export function AdminNameDialog({
  name,
  open,
  onOpenChange,
}: {
  name: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateMyAdminNameAction(value);
      if (result.ok) {
        onOpenChange(false);
        return;
      }
      setMessage(result.error.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? null : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>운영자 이름</DialogTitle>
          <DialogDescription>
            운영자 기록과 화면 위에 보이는 이름이에요. 누가 처리했는지 알 수 있게 다른 운영자와 같은
            이름은 쓸 수 없어요. 바꾸면 지난 기록에도 새 이름으로 보여요.
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
              onClick={() => onOpenChange(false)}
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
  );
}
