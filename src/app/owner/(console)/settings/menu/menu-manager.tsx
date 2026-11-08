'use client';

// 메뉴 목록·추가·수정·숨김·순서 바꾸기 (O3, S-106). 저장 전에 화면에서 한 번 검사하고, 서버 함수가 다시 검사한다.

import { useState, useTransition } from 'react';
import { cn } from 'cn';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/state';
import { Textarea } from '@/components/ui/textarea';
import { formatDuration, formatWon } from '@/lib/format';
import { serviceTypeLabel, serviceTypesOf, type ShopCategory } from '@/server/policy';

import { FieldError, fieldA11y, FormField } from '../../../form-field';
import { moveMenu, saveMenu, setMenuHidden } from './actions';
import {
  MENU_DURATION_OPTIONS,
  MENU_LIMITS,
  type MenuField,
  type MenuFieldErrors,
  type MenuInput,
  validateMenu,
} from './menu';
import type { MenuItem } from './menu-store';

/** 열 때마다 key를 새로 줘서 창 안 입력값이 이전 것을 이어받지 않게 한다 */
type Editing = { key: number; menuId: string | null; input: MenuInput } | null;

export function MenuManager({
  shopId,
  category,
  menus,
}: {
  shopId: string;
  category: ShopCategory;
  menus: MenuItem[];
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = menus.filter((menu) => !menu.hidden);
  const hidden = menus.filter((menu) => menu.hidden);

  /** [메뉴 추가]: 업종의 첫 서비스 종류, 소요 시간 60분으로 빈 창을 연다 */
  function openNew() {
    setMessage(null);
    setEditing({
      key: Date.now(),
      menuId: null,
      input: {
        serviceType: serviceTypesOf(category)[0].key,
        name: '',
        listPrice: '',
        durationMinutes: 60,
        description: '',
      },
    });
  }

  /** [수정]: 저장된 값으로 창을 연다. 정가는 입력 칸 모양(천 단위 쉼표)으로 바꿔 넣는다 */
  function openEdit(menu: MenuItem) {
    setMessage(null);
    setEditing({
      key: Date.now(),
      menuId: menu.id,
      input: {
        serviceType: menu.serviceType,
        name: menu.name,
        listPrice: menu.listPrice.toLocaleString('ko-KR'),
        durationMinutes: menu.durationMinutes,
        description: menu.description ?? '',
      },
    });
  }

  /** 숨김·순서 바꾸기. 실패하면 문구를 보여준다 */
  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.error?.message ?? '잠시 후 다시 시도해 주세요');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">메뉴 {visible.length}개</h2>
        <Button size="lg" onClick={openNew}>
          <Plus aria-hidden />
          메뉴 추가
        </Button>
      </div>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="메뉴를 먼저 등록해 주세요"
            description="매물은 등록한 메뉴 중에서 골라 올려요"
            action={<Button onClick={openNew}>메뉴 추가</Button>}
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {visible.map((menu, index) => (
              <li key={menu.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${menu.name} 위로`}
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveMenu(shopId, menu.id, 'up'))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${menu.name} 아래로`}
                    disabled={pending || index === visible.length - 1}
                    onClick={() => run(() => moveMenu(shopId, menu.id, 'down'))}
                  >
                    <ArrowDown />
                  </Button>
                </div>
                <MenuSummary menu={menu} />
                <Button variant="outline" onClick={() => openEdit(menu)} disabled={pending}>
                  수정
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => run(() => setMenuHidden(shopId, menu.id, true))}
                  disabled={pending}
                >
                  숨기기
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hidden.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-muted-foreground">숨긴 메뉴 {hidden.length}개</h2>
          <p className="text-sm text-muted-foreground">
            숨긴 메뉴는 매물을 올릴 때 고를 수 없어요. 이미 올린 매물은 그대로예요.
          </p>
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {hidden.map((menu) => (
                <li key={menu.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
                  <MenuSummary menu={menu} />
                  <Button
                    variant="outline"
                    onClick={() => run(() => setMenuHidden(shopId, menu.id, false))}
                    disabled={pending}
                  >
                    다시 보이기
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {editing ? (
        <MenuDialog
          key={editing.key}
          shopId={shopId}
          category={category}
          menuId={editing.menuId}
          initial={editing.input}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function MenuSummary({ menu }: { menu: MenuItem }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{serviceTypeLabel(menu.serviceType)}</Badge>
        <span className="truncate font-semibold">{menu.name}</span>
      </div>
      <span className="text-sm text-muted-foreground">
        {formatWon(menu.listPrice)} · {formatDuration(menu.durationMinutes)}
        {menu.description ? ` · ${menu.description}` : ''}
      </span>
    </div>
  );
}

/** 메뉴 추가·수정 창 */
function MenuDialog({
  shopId,
  category,
  menuId,
  initial,
  onClose,
}: {
  shopId: string;
  category: ShopCategory;
  menuId: string | null;
  initial: MenuInput;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<MenuFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** 칸 하나를 바꾼다. 칸 오류는 여기서 지우지 않고, 다시 [저장]할 때 새로 검사해서 바꾼다 */
  function update<K extends keyof MenuInput>(key: K, value: MenuInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * 화면에서 먼저 검사하고 저장한다. 성공하면 창을 닫는다.
   * 목록은 서버 함수가 화면을 새로 그려(refresh) 바뀐 메뉴가 보인다
   */
  function save() {
    const checked = validateMenu(category, form);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveMenu(shopId, menuId, form);
      if (result.ok) {
        onClose();
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
    });
  }

  // 칸 id 앞에 menu-를 붙여 샵 정보 칸(name, description)과 겹치지 않게 한다.
  // 앞서 연 화면이 숨은 채 남아 있을 수 있어서(Activity) id가 겹치면 라벨·오류가 엉뚱한 칸에 이어진다
  const idOf = (field: MenuField) => `menu-${field}`;
  const fieldProps = (field: MenuField) => fieldA11y(idOf(field), errors[field]);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{menuId ? '메뉴 수정' : '메뉴 추가'}</DialogTitle>
          <DialogDescription>
            {menuId ? '고쳐도 이미 올린 매물은 그대로예요' : '매물을 올릴 때 이 메뉴를 고르면 돼요'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 overflow-y-auto"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">서비스 종류</legend>
            <div className="flex flex-wrap gap-2">
              {serviceTypesOf(category).map((type) => (
                <label
                  key={type.key}
                  className={cn(
                    'flex h-8 cursor-pointer items-center rounded-lg border px-3 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                    form.serviceType === type.key && 'border-primary bg-primary/10 font-semibold',
                  )}
                >
                  <input
                    type="radio"
                    name="serviceType"
                    value={type.key}
                    checked={form.serviceType === type.key}
                    onChange={() => update('serviceType', type.key)}
                    className="sr-only"
                  />
                  {type.label}
                </label>
              ))}
            </div>
            <FieldError id={idOf('serviceType')} error={errors.serviceType} />
          </fieldset>

          <FormField label="서비스 이름" id={idOf('name')} error={errors.name}>
            <Input
              {...fieldProps('name')}
              placeholder="예: 디자인 커트"
              maxLength={MENU_LIMITS.name}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </FormField>

          <div className="flex gap-4">
            <FormField
              label="정가(원)"
              id={idOf('listPrice')}
              error={errors.listPrice}
              className="flex-1"
            >
              <Input
                {...fieldProps('listPrice')}
                inputMode="numeric"
                placeholder="예: 33,500"
                value={form.listPrice}
                onChange={(event) => update('listPrice', formatPriceInput(event.target.value))}
              />
            </FormField>
            <FormField
              label="소요 시간"
              id={idOf('durationMinutes')}
              error={errors.durationMinutes}
              className="flex-1"
            >
              {/* 가입·정산 계좌의 고르기 칸(NATIVE_SELECT_CLASS)과 테두리 모양이 조금 다르다.
                  원장님 화면 디자인을 맞출 때 하나로 한다 */}
              <select
                {...fieldProps('durationMinutes')}
                value={form.durationMinutes}
                onChange={(event) => update('durationMinutes', Number(event.target.value))}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {MENU_DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="상세 설명 (선택)" id={idOf('description')} error={errors.description}>
            <Textarea
              {...fieldProps('description')}
              rows={3}
              placeholder="예: 샴푸·드라이 포함"
              maxLength={MENU_LIMITS.description}
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </FormField>

          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 정가 입력칸: 숫자만 남기고 천 단위 쉼표를 붙인다. 예: "33500" → "33,500" */
function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 7);
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}
