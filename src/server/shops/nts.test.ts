// 국세청 사업자등록 진위확인(#208). 응답 해석, 보내는 값, 응답이 없을 때, 막는 결과의 문구, 샵에 남길 값을 본다.
// 실제 국세청은 부르지 않는다(가짜 fetch를 넘긴다). 응답 모양은 11/22 개발 키로 받은 실제 응답과 공공데이터포털 명세를 따른다.

import { describe, expect, it, vi } from 'vitest';

import {
  checkBusinessWithNts,
  NTS_ERRORS,
  ntsBlockError,
  ntsCheckFromResponse,
  ntsFieldsChanged,
  ntsRecord,
} from './nts';

/** 진위확인 응답 하나 */
function validateBody(item: Record<string, unknown>, statusCode = 'OK') {
  return { request_cnt: 1, status_code: statusCode, data: [{ b_no: '1234567891', ...item }] };
}

const INPUT = {
  businessNumber: '1234567891',
  openedOn: '2025-03-01',
  representativeName: '김원장',
};

describe('ntsCheckFromResponse', () => {
  it('맞으면(valid 01) 상태 코드로 계속(01)·휴업(02)·폐업(03)을 나눈다', () => {
    expect(ntsCheckFromResponse(validateBody({ valid: '01', status: { b_stt_cd: '01' } }))).toEqual(
      { result: 'verified' },
    );
    expect(ntsCheckFromResponse(validateBody({ valid: '01', status: { b_stt_cd: '02' } }))).toEqual(
      { result: 'suspended' },
    );
    expect(ntsCheckFromResponse(validateBody({ valid: '01', status: { b_stt_cd: '03' } }))).toEqual(
      { result: 'closed' },
    );
  });

  it('다르면(valid 02, 확인할 수 없습니다) mismatch', () => {
    expect(
      ntsCheckFromResponse(validateBody({ valid: '02', valid_msg: '확인할 수 없습니다.' })),
    ).toEqual({ result: 'mismatch' });
  });

  it('응답 모양이 다르거나 상태를 알 수 없으면 확인 못 함(막지 않는다)', () => {
    expect(ntsCheckFromResponse(validateBody({ valid: '01' }))).toEqual({ result: 'unavailable' });
    expect(ntsCheckFromResponse(validateBody({ valid: '01', status: { b_stt_cd: '' } }))).toEqual({
      result: 'unavailable',
    });
    expect(ntsCheckFromResponse(validateBody({ valid: '01' }, 'ERROR'))).toEqual({
      result: 'unavailable',
    });
    expect(ntsCheckFromResponse({ status_code: 'OK', data: [] })).toEqual({
      result: 'unavailable',
    });
    expect(ntsCheckFromResponse(null)).toEqual({ result: 'unavailable' });
  });
});

describe('checkBusinessWithNts', () => {
  it('키가 없으면 부르지 않고 건너뛴다(개발·미리보기)', async () => {
    const request = vi.fn();
    expect(await checkBusinessWithNts(INPUT, { key: '', fetch: request })).toEqual({
      result: 'skipped',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('진위확인 주소에 키를 붙여 번호·개업일자(하이픈 없이)·대표자 이름을 보낸다', async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify(validateBody({ valid: '01', status: { b_stt_cd: '01' } }))),
    );
    expect(await checkBusinessWithNts(INPUT, { key: 'k+y/=', fetch: request })).toEqual({
      result: 'verified',
    });
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=k%2By%2F%3D',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      businesses: [{ b_no: '1234567891', start_dt: '20250301', p_nm: '김원장' }],
    });
  });

  it('HTTP 오류·시간 초과·잘못된 응답이면 확인 못 함(예외를 던지지 않는다)', async () => {
    const failed = vi.fn(async () => new Response('busy', { status: 503 }));
    expect(await checkBusinessWithNts(INPUT, { key: 'k', fetch: failed })).toEqual({
      result: 'unavailable',
    });
    const timedOut = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect(await checkBusinessWithNts(INPUT, { key: 'k', fetch: timedOut })).toEqual({
      result: 'unavailable',
    });
    const notJson = vi.fn(async () => new Response('<html>'));
    expect(await checkBusinessWithNts(INPUT, { key: 'k', fetch: notJson })).toEqual({
      result: 'unavailable',
    });
  });

  it('정해 둔 시간 안에 답이 없으면 기다리지 않는다', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    expect(
      await checkBusinessWithNts(INPUT, { key: 'k', fetch: hang as typeof fetch, timeoutMs: 20 }),
    ).toEqual({ result: 'unavailable' });
  });
});

describe('ntsBlockError', () => {
  it('다름·휴업·폐업은 저장을 막고, 나머지는 막지 않는다', () => {
    expect(ntsBlockError({ result: 'mismatch' })).toEqual({
      ok: false,
      error: { code: 'NTS_MISMATCH', message: NTS_ERRORS.NTS_MISMATCH },
    });
    expect(ntsBlockError({ result: 'suspended' })).toEqual({
      ok: false,
      error: { code: 'NTS_SUSPENDED', message: NTS_ERRORS.NTS_SUSPENDED },
    });
    expect(ntsBlockError({ result: 'closed' })).toEqual({
      ok: false,
      error: { code: 'NTS_CLOSED', message: NTS_ERRORS.NTS_CLOSED },
    });
    for (const result of ['verified', 'unavailable', 'skipped'] as const) {
      expect(ntsBlockError({ result })).toBeNull();
    }
  });
});

describe('ntsRecord', () => {
  const NOW = new Date('2026-11-22T06:00:00Z');

  it('맞음·확인 못 함은 결과와 시각을, 건너뛰면 비운 값을 남긴다', () => {
    expect(ntsRecord({ result: 'verified' }, NOW)).toEqual({
      ntsCheck: 'verified',
      ntsCheckedAt: NOW,
    });
    expect(ntsRecord({ result: 'unavailable' }, NOW)).toEqual({
      ntsCheck: 'unavailable',
      ntsCheckedAt: NOW,
    });
    expect(ntsRecord({ result: 'skipped' }, NOW)).toEqual({ ntsCheck: null, ntsCheckedAt: null });
  });
});

describe('ntsFieldsChanged', () => {
  const current = {
    businessRegistrationNumber: '123-45-67891',
    openedOn: '2025-03-01',
    representativeName: '김원장',
  };

  it('하이픈만 다르거나 이름 앞뒤 공백만 다르면 바뀐 것이 아니다', () => {
    expect(
      ntsFieldsChanged(
        { ...current, businessRegistrationNumber: '1234567891', representativeName: ' 김원장 ' },
        current,
      ),
    ).toBe(false);
  });

  it('번호·개업일자·대표자 이름 중 하나라도 바뀌면 다시 확인한다', () => {
    expect(
      ntsFieldsChanged({ ...current, businessRegistrationNumber: '1234567892' }, current),
    ).toBe(true);
    expect(ntsFieldsChanged({ ...current, openedOn: '2025-03-02' }, current)).toBe(true);
    expect(ntsFieldsChanged({ ...current, representativeName: '이원장' }, current)).toBe(true);
  });
});
