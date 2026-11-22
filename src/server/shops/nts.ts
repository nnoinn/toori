// 국세청 사업자등록 진위확인(#208, 11/2 nnoinn). 입점 신청(createOwnerAccount)과 사업자 정보 수정(원장님 매장 설정, 운영자)에서 부른다.
// 공공데이터포털 "국세청_사업자등록정보 진위확인 및 상태조회 서비스"의 진위확인 한 번으로 번호·개업일자·대표자 이름이 맞는지와
// 휴업·폐업 상태를 같이 본다(응답의 status). 맞지 않거나 휴업·폐업이면 저장하지 않는다.
// 국세청이 응답하지 않으면(시간 초과·오류·모양이 다른 응답) 막지 않고 '확인 못 함'으로 남겨 운영자 입점 심사 화면에 보여 준다.
// 키(NTS_SERVICE_KEY)가 없으면 건너뛴다. 개발·미리보기·지금의 toori.kr(개발 DB)에서는 비워 둬서 아무 값으로 시험할 수 있고,
// 운영용으로 바꿀 때 Vercel Production에만 넣는다(docs/tech-guide.md 7장 "사업자등록번호 확인").

import 'server-only';

import type { NtsCheckResult } from '@/db/schema/shops';
import { fail, type Result } from '@/lib/result';
import { NTS_TIMEOUT_MS } from '@/server/policy';

const VALIDATE_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';

/** 국세청 확인 결과 */
export type NtsCheck =
  | { result: 'verified' }
  | { result: 'mismatch' }
  | { result: 'suspended' }
  | { result: 'closed' }
  | { result: 'unavailable' }
  | { result: 'skipped' };

/** 저장을 막는 결과의 화면 문구 */
export const NTS_ERRORS = {
  NTS_MISMATCH:
    '사업자 정보가 국세청 정보와 달라요. 사업자등록번호·개업일자·대표자 이름을 다시 확인해 주세요',
  NTS_SUSPENDED: '국세청에 휴업으로 등록된 사업자예요. 사업자 상태를 확인해 주세요',
  NTS_CLOSED: '국세청에 폐업으로 등록된 사업자예요. 사업자 상태를 확인해 주세요',
} as const;

type ValidateItem = { valid?: string; status?: { b_stt_cd?: string } };

/**
 * 진위확인 응답 → 결과. valid 01(맞음)이면 상태 코드로 계속(01)·휴업(02)·폐업(03)을 나누고, 02면 다름.
 * 응답 모양이 다르거나 상태를 알 수 없으면 확인 못 함(막지 않는다)
 */
export function ntsCheckFromResponse(body: unknown): NtsCheck {
  const response = body as { status_code?: string; data?: ValidateItem[] } | null;
  const item = response?.data?.[0];
  if (response?.status_code !== 'OK' || !item) return { result: 'unavailable' };
  if (item.valid === '02') return { result: 'mismatch' };
  if (item.valid !== '01') return { result: 'unavailable' };
  switch (item.status?.b_stt_cd) {
    case '01':
      return { result: 'verified' };
    case '02':
      return { result: 'suspended' };
    case '03':
      return { result: 'closed' };
    default:
      return { result: 'unavailable' };
  }
}

/**
 * 국세청에 사업자 정보를 확인한다. businessNumber는 숫자 10자리, openedOn은 'YYYY-MM-DD'.
 * 키가 없으면 skipped, 응답이 없거나 오류면 unavailable(예외를 던지지 않는다)
 */
export async function checkBusinessWithNts(
  input: { businessNumber: string; openedOn: string; representativeName: string },
  deps: { key?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<NtsCheck> {
  const key = deps.key ?? process.env.NTS_SERVICE_KEY;
  if (!key) return { result: 'skipped' };
  const request = deps.fetch ?? fetch;
  try {
    const response = await request(`${VALIDATE_URL}?${new URLSearchParams({ serviceKey: key })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        businesses: [
          {
            b_no: input.businessNumber,
            start_dt: input.openedOn.replaceAll('-', ''),
            p_nm: input.representativeName,
          },
        ],
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? NTS_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return { result: 'unavailable' };
    return ntsCheckFromResponse(await response.json());
  } catch {
    return { result: 'unavailable' };
  }
}

/** 국세청에 확인하는 칸(사업자등록번호·개업일자·대표자 이름). 이 칸이 바뀌면 다시 확인한다 */
export const NTS_FIELDS = ['businessRegistrationNumber', 'openedOn', 'representativeName'] as const;
type NtsFields = Record<(typeof NTS_FIELDS)[number], string>;

/** 확인하는 칸이 바뀌었는지. 사업자등록번호는 하이픈·공백을 빼고, 대표자 이름은 앞뒤 공백을 빼고 비교한다 */
export function ntsFieldsChanged(next: NtsFields, current: NtsFields): boolean {
  const digits = (value: string) => value.replace(/\D/g, '');
  return (
    digits(next.businessRegistrationNumber) !== digits(current.businessRegistrationNumber) ||
    next.openedOn !== current.openedOn ||
    next.representativeName.trim() !== current.representativeName.trim()
  );
}

/** 저장을 막아야 하는 결과면 실패 결과, 아니면 null */
export function ntsBlockError(check: NtsCheck): Result<never> | null {
  switch (check.result) {
    case 'mismatch':
      return fail('NTS_MISMATCH', NTS_ERRORS.NTS_MISMATCH);
    case 'suspended':
      return fail('NTS_SUSPENDED', NTS_ERRORS.NTS_SUSPENDED);
    case 'closed':
      return fail('NTS_CLOSED', NTS_ERRORS.NTS_CLOSED);
    default:
      return null;
  }
}

/**
 * 샵에 남길 값(shops.nts_check·nts_checked_at). 건너뛰었으면 비운다(확인 안 함).
 * 막는 결과(다름·휴폐업)는 저장하지 않으므로 여기로 오지 않는다
 */
export function ntsRecord(
  check: NtsCheck,
  now: Date,
): { ntsCheck: NtsCheckResult | null; ntsCheckedAt: Date | null } {
  if (check.result === 'verified' || check.result === 'unavailable') {
    return { ntsCheck: check.result, ntsCheckedAt: now };
  }
  return { ntsCheck: null, ntsCheckedAt: null };
}
