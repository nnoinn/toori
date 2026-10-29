// 업로드 정책 (연결 #5, Issue #48 8장, #47 6장).

/**
 * 샵 사진·사업자등록증 최대 크기(바이트, 5MB). 화면에서 올리기 전에 미리 막고, 업로드 주소를 만들 때 서버에서도 확인한다.
 * Storage 버킷 설정(file_size_limit 5,242,880바이트 = 5MiB, 10/28)보다 조금 작아서 이 값이 먼저 걸린다
 */
export const UPLOAD_MAX_BYTES = 5_000_000;

/** 샵 사진으로 올릴 수 있는 파일 형식(#47 6장). 화면 파일 선택의 accept에도 쓴다 */
export const UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadContentType = (typeof UPLOAD_ALLOWED_TYPES)[number];

/**
 * 사업자등록증으로 올릴 수 있는 파일 형식: 사진이나 PDF(10/28 결정). 화면 파일 선택의 accept에도 쓴다.
 * Storage business-docs 버킷의 허용 형식과 같다
 */
export const BUSINESS_DOC_ALLOWED_TYPES = [...UPLOAD_ALLOWED_TYPES, 'application/pdf'] as const;
export type BusinessDocContentType = (typeof BUSINESS_DOC_ALLOWED_TYPES)[number];

/** 사업자등록증(비공개)을 여는 주소가 열려 있는 시간(초). 운영자·원장님이 화면을 열 때마다 새로 받는다 */
export const BUSINESS_DOC_URL_TTL_SECONDS = 5 * 60;
