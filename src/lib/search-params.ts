// 주소 값(searchParams) 읽기. 같은 이름이 여러 번 오면 배열이라 첫 값만 쓴다.

export type SearchValue = string | string[] | undefined;

export function firstParam(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
