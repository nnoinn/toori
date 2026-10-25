// 주소→좌표 변환 (X-501, X-502, 연결 #6). 서버에서만 부른다.
// 입출력 약속은 Issue #51 확정본을 따른다. 바꿀 일이 생기면 #51에 먼저 알린다.
// 카카오 로컬 API(주소 검색)를 부른다. REST 키(KAKAO_REST_API_KEY)는 서버에서만 쓴다.

import 'server-only';

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
    /** → shops.sigungu. 예: 안산시 상록구. 시·군·구가 없는 세종시는 시·도 이름(세종특별자치시) */
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

const KAKAO_ADDRESS_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/address.json';

/** 카카오가 이 시간 안에 답하지 않으면 GEOCODE_UNAVAILABLE */
const KAKAO_TIMEOUT_MS = 5000;

const addressSchema = z.string().trim().min(1);

// 카카오 주소 검색 결과 하나 중 쓰는 값만 확인한다. 좌표는 문자열로 온다
const kakaoDocumentSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  address: z
    .object({
      address_name: z.string(),
      region_1depth_name: z.string(),
      region_2depth_name: z.string(),
      /** 법정동 코드 10자리. 앞 5자리가 시·군·구 코드 */
      b_code: z.string().regex(/^\d{10}$/),
    })
    .nullable(),
  road_address: z.object({ address_name: z.string() }).nullable(),
});

// 결과 목록은 하나씩 확인한다. 모양이 이상한 결과가 하나 있어도 나머지는 쓴다
const kakaoAddressResponseSchema = z.object({ documents: z.array(z.unknown()) });

type KakaoAddressDocument = z.infer<typeof kakaoDocumentSchema>;

function geocodeFail(code: GeocodeErrorCode, candidates?: GeocodeCandidate[]): GeocodeResponse {
  const error: GeocodeError = { code, message: GEOCODE_ERRORS[code] };
  if (candidates) error.candidates = candidates;
  return { ok: false, error };
}

function toResult(
  doc: KakaoAddressDocument & {
    address: NonNullable<KakaoAddressDocument['address']>;
    road_address: NonNullable<KakaoAddressDocument['road_address']>;
  },
): GeocodeResult {
  const { address } = doc;
  return {
    roadAddress: doc.road_address.address_name,
    jibunAddress: address.address_name,
    lat: doc.y,
    lng: doc.x,
    region: {
      sido: address.region_1depth_name,
      sigungu: address.region_2depth_name || address.region_1depth_name,
      sigunguCode: address.b_code.slice(0, 5),
    },
  };
}

/** 카카오 주소 검색을 부른다. 키가 없거나 오류·시간 초과·이상한 응답이면 null */
async function searchKakaoAddress(query: string): Promise<KakaoAddressDocument[] | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    console.error('[geocode] KAKAO_REST_API_KEY가 없어요');
    return null;
  }

  const url = new URL(KAKAO_ADDRESS_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('analyze_type', 'exact');

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[geocode] 카카오 주소 검색 실패: HTTP ${res.status}`);
      return null;
    }
    const parsed = kakaoAddressResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error('[geocode] 카카오 주소 검색 응답 모양이 달라요');
      return null;
    }
    const { documents } = parsed.data;
    const valid = documents.flatMap((doc) => {
      const result = kakaoDocumentSchema.safeParse(doc);
      return result.success ? [result.data] : [];
    });
    if (valid.length < documents.length) {
      console.error(`[geocode] 모양이 다른 결과 ${documents.length - valid.length}개를 뺐어요`);
    }
    // 결과는 있는데 하나도 읽을 수 없으면 카카오 응답 모양이 바뀐 것이라 '잠시 후 다시'로 본다
    if (documents.length > 0 && valid.length === 0) return null;
    return valid;
  } catch (e) {
    console.error('[geocode] 카카오 주소 검색 호출 실패:', e instanceof Error ? e.name : e);
    return null;
  }
}

/**
 * 도로명 주소를 좌표와 지역 정보로 바꾼다.
 * 입력은 카카오(다음) 우편번호 창에서 고른 도로명 주소다. 상세 주소는 넘기지 않는다.
 * 지역으로 막지 않는다. 안산시 밖 주소도 결과를 돌려준다(입점 여부는 운영자 승인에서 본다).
 */
export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  const parsed = addressSchema.safeParse(address);
  if (!parsed.success) return geocodeFail('ADDRESS_NOT_FOUND');

  const documents = await searchKakaoAddress(parsed.data);
  if (!documents) return geocodeFail('GEOCODE_UNAVAILABLE');

  // 도로명 주소가 없는 결과(지역 이름만 맞은 결과 등)는 뺀다
  const matches = documents.filter(
    (doc): doc is Parameters<typeof toResult>[0] =>
      doc.road_address !== null && doc.address !== null,
  );

  // 같은 도로명 주소가 여러 번 나오면 하나로 본다
  const unique = [...new Map(matches.map((doc) => [doc.road_address.address_name, doc])).values()];

  if (unique.length === 0) return geocodeFail('ADDRESS_NOT_FOUND');
  if (unique.length > 1) {
    return geocodeFail(
      'ADDRESS_AMBIGUOUS',
      unique.map((doc) => ({
        roadAddress: doc.road_address.address_name,
        jibunAddress: doc.address.address_name,
      })),
    );
  }
  return ok(toResult(unique[0]));
}
