// 주소→좌표 변환 (X-501, X-502, 연결 #6). 서버에서만 부른다.
// 입출력 약속은 Issue #51 확정본을 따른다. 바꿀 일이 생기면 #51에 먼저 알린다.
//
// 지금은 가짜 결과 버전(J0)이다. 카카오 로컬 API를 부르지 않고, 입력에 들어간 단어로
// 실패 코드를 흉내 낸다. J1에서 실제 API로 바꿔도 함수 이름·입출력·실패 코드는 그대로다.

import { z } from 'zod';

import { ok, type ResultError } from '@/lib/result';

export type GeocodeResult = {
  /** → shops.road_address */
  roadAddress: string;
  /** → shops.jibun_address */
  jibunAddress: string | null;
  /** → shops.location (WGS84) */
  lat: number;
  lng: number;
  region: {
    /** → shops.sido. 예: 경기 */
    sido: string;
    /** → shops.sigungu. 예: 안산시 상록구 */
    sigungu: string;
    /** → shops.sigungu_code. 지역 필터·동네 선택·관심 동네 기준 */
    sigunguCode: string;
  };
};

/** ADDRESS_AMBIGUOUS일 때 원장님이 고를 후보. 고르면 그 roadAddress로 다시 부른다 */
export type GeocodeCandidate = {
  roadAddress: string;
  jibunAddress: string | null;
};

/** 공통 실패 형태(ResultError)에 후보 목록만 더했다. 다른 실패 코드에서는 candidates가 없다 */
export type GeocodeError = ResultError & { candidates?: GeocodeCandidate[] };

export type GeocodeResponse =
  { ok: true; data: GeocodeResult } | { ok: false; error: GeocodeError };

export const GEOCODE_ERRORS = {
  ADDRESS_NOT_FOUND: '주소를 찾을 수 없어요. 도로명 주소로 다시 입력해 주세요',
  ADDRESS_AMBIGUOUS: '주소가 여러 개 나와요. 하나를 골라 주세요',
  GEOCODE_UNAVAILABLE: '잠시 후 다시 시도해 주세요',
} as const;

export type GeocodeErrorCode = keyof typeof GEOCODE_ERRORS;

const addressSchema = z.string().trim().min(1);

function geocodeFail(code: GeocodeErrorCode, candidates?: GeocodeCandidate[]): GeocodeResponse {
  const error: GeocodeError = { code, message: GEOCODE_ERRORS[code] };
  if (candidates) error.candidates = candidates;
  return { ok: false, error };
}

// --- 가짜 결과 버전(J0) 전용 값. J1에서 지운다 ---

/** 이 단어가 입력에 들어 있으면 해당 실패 코드를 돌려준다(#51 3장) */
const FAKE_FAILURE_WORDS: { word: string; code: GeocodeErrorCode }[] = [
  { word: '없는주소', code: 'ADDRESS_NOT_FOUND' },
  { word: '여러개', code: 'ADDRESS_AMBIGUOUS' },
  { word: '오류', code: 'GEOCODE_UNAVAILABLE' },
];

const FAKE_CANDIDATES: GeocodeCandidate[] = [
  { roadAddress: '경기 안산시 상록구 예시로 1', jibunAddress: '경기 안산시 상록구 예시동 100' },
  { roadAddress: '경기 안산시 단원구 예시로 1', jibunAddress: '경기 안산시 단원구 예시동 100' },
];

/** 성공일 때 돌려주는 안산시 상록구 고정 좌표·지역(상록구청 근처) */
const FAKE_LOCATION = {
  jibunAddress: null,
  lat: 37.3008,
  lng: 126.8464,
  region: { sido: '경기', sigungu: '안산시 상록구', sigunguCode: '41271' },
} satisfies Omit<GeocodeResult, 'roadAddress'>;

/**
 * 도로명 주소를 좌표와 지역 정보로 바꾼다.
 * 입력은 카카오(다음) 우편번호 창에서 고른 도로명 주소다. 상세 주소는 넘기지 않는다.
 * 지역으로 막지 않는다. 안산시 밖 주소도 결과를 돌려준다(입점 여부는 운영자 승인에서 본다).
 */
export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  const parsed = addressSchema.safeParse(address);
  if (!parsed.success) return geocodeFail('ADDRESS_NOT_FOUND');
  const roadAddress = parsed.data;

  const failure = FAKE_FAILURE_WORDS.find(({ word }) => roadAddress.includes(word));
  if (failure) {
    return geocodeFail(
      failure.code,
      failure.code === 'ADDRESS_AMBIGUOUS' ? FAKE_CANDIDATES : undefined,
    );
  }

  return ok({ roadAddress, ...FAKE_LOCATION });
}
