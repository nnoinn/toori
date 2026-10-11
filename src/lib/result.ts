// 서버 함수(Server Action 등)의 결과 형태를 통일한다(docs/conventions.md).
// 성공: { ok: true, data } / 실패: { ok: false, error: { code, message } }
// 화면은 error.message를 사용자에게 그대로 보여준다(해요체로 쓴다).

export type ResultError = {
  /** 화면 분기용 코드. 예: 'UNAUTHENTICATED', 'SLOT_ON_HOLD' */
  code: string;
  /** 사용자에게 보여줄 문구. 예: '다른 고객이 결제 중이에요' */
  message: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
