// 카카오맵 링크(고객 매물 상세·시간대 상세·내 예약 상세가 같이 쓴다). 11/22 고객 상세 폴더에서 옮겼다.

/** 카카오맵에서 샵 위치 크게 보기(새 창). 이름의 쉼표 등은 주소에 맞게 바꾼다 */
export function kakaoMapLink(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
}

/** 카카오맵 길찾기(새 창, C-307). 도착지만 샵으로 정하고 출발지는 카카오맵이 정한다(보통 내 위치) */
export function kakaoDirectionsLink(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}
