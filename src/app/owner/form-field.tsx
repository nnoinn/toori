// 원장님 화면 입력 칸 부품. 가입과 매장 설정(샵 정보·메뉴·사업자 정보·정산 계좌) 화면이 같이 쓴다.
// 라벨, 칸, 오류 문구를 한 묶음으로 그리고, 오류 문구에 `{칸 id}-error` id를 붙여
// 칸의 aria-describedby와 잇는다. 그래서 화면 읽기 프로그램이 칸을 읽을 때 오류 문구도 같이 읽는다.
// 화면마다 따로 있던 Field·FieldBox·FieldError를 모은 것이라 모양은 전과 같다.

import { cn } from 'cn';

import { Label } from '@/components/ui/label';

/**
 * 고르기 칸(`<select>`) 모양. 공통 UI에 고르기 칸 부품이 없어서
 * 은행·업종 칸이 Input과 같은 높이·테두리로 보이게 이 값을 같이 쓴다. 오류면 테두리가 빨갛다.
 */
export const NATIVE_SELECT_CLASS =
  'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

/** 칸 id로 오류 문구 id를 만든다. 칸과 오류 문구가 같은 규칙을 써야 서로 이어진다 */
function fieldErrorId(id: string): string {
  return `${id}-error`;
}

/**
 * 칸에 펼쳐 넣을 id와 오류 연결 값. 오류가 있을 때만 aria-invalid(빨간 테두리)와
 * aria-describedby(오류 문구 연결)를 붙인다. 오류 칸으로 옮길 때 이 id로 칸을 찾는다.
 */
export function fieldA11y(id: string, error: string | undefined) {
  return { id, ...errorA11y(id, error) };
}

/**
 * id 없이 오류 연결 값만. 오류 문구 하나를 칸 여러 개가 같이 쓸 때(영업시간 여는·닫는 시각) 쓴다.
 * 칸마다 id가 같으면 안 되므로 id는 붙이지 않고, 오류 문구 쪽 id(묶음 이름)만 가리킨다
 */
export function errorA11y(id: string, error: string | undefined) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? fieldErrorId(id) : undefined,
  };
}

/** 라벨 + 칸 + 오류 문구. 칸(children)에는 같은 id로 fieldA11y 값을 넣는다 */
export function FormField({
  label,
  id,
  error,
  className,
  children,
}: {
  label: string;
  /** 칸의 id. 라벨의 htmlFor와 오류 문구 id에 쓴다 */
  id: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError id={id} error={error} />
    </div>
  );
}

/**
 * 오류 문구만. 칸이 여러 개라 FormField로 감쌀 수 없는 묶음(주소 찾기, 등록증, 약관, 업종·서비스 종류 고르기,
 * 영업시간 한 줄)에 쓴다. 이때 id는 그 묶음 이름이다
 */
export function FieldError({
  id,
  error,
  className,
}: {
  id: string;
  error?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p id={fieldErrorId(id)} className={cn('text-sm text-destructive', className)}>
      {error}
    </p>
  );
}
