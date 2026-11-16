'use client';

import { useRef, useState } from 'react';
import { ChevronDown, LogOut, PencilLine } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSignOut } from '@/components/ui/use-sign-out';
import { FALLBACK_ADMIN_NAME } from '@/server/admin/admin-name';
import { ADMIN_LOGIN_PATH } from '@/server/auth/paths';

import { AdminNameDialog } from './admin-name-edit';

/**
 * 운영자 화면 위 오른쪽 프로필 메뉴 (#372 3·4장, 11/16 nnoinn). "OOO 운영자"만 보이고, 누르면 [이름 바꾸기]·[로그아웃]이 펼쳐진다.
 * 이름을 아직 정하지 않았으면 '운영자'와 [이름 정하기]. 로그아웃은 고객·원장님과 같은 순서이고 운영자 입구로 간다(useSignOut)
 */
export function AdminProfileMenu({ name }: { name: string | null }) {
  const [dialog, setDialog] = useState({ open: false, key: 0 });
  // 메뉴가 닫히며 누른 버튼으로 돌아가는 포커스가 이름 창의 입력 칸을 빼앗지 않게 한다
  const openingDialog = useRef(false);
  const { signOutNow, pending, error } = useSignOut(ADMIN_LOGIN_PATH);

  return (
    <div className="flex items-center gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          disabled={pending}
          className="flex h-8 items-center gap-1 rounded-lg px-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 data-open:bg-muted"
        >
          {pending ? (
            <span>로그아웃 중…</span>
          ) : name ? (
            <span>
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground"> 운영자</span>
            </span>
          ) : (
            <span className="font-medium">{FALLBACK_ADMIN_NAME}</span>
          )}
          <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            if (!openingDialog.current) return;
            openingDialog.current = false;
            event.preventDefault();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              openingDialog.current = true;
              setDialog((current) => ({ open: true, key: current.key + 1 }));
            }}
          >
            <PencilLine aria-hidden />
            {name ? '이름 바꾸기' : '이름 정하기'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOutNow}>
            <LogOut aria-hidden />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AdminNameDialog
        key={dialog.key}
        name={name}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </div>
  );
}
