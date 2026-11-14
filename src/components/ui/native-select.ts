// 고르기 칸(`<select>`) 모양. 공통 UI에 따로 고르기 부품을 두지 않고, 브라우저 기본 `<select>`에 이 값을 붙여
// Input과 같은 높이·테두리로 보이게 한다. 오류면(aria-invalid) 테두리가 빨갛다.
// 원장님 입력 칸(form-field.tsx)·운영자 이의제기 등록·목록 정렬 고르기(SortSelect)가 같이 쓴다(#212 3번)

export const NATIVE_SELECT_CLASS =
  'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';
