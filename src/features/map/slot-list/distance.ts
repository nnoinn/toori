// 매물 카드의 거리 글자 (J4, C-202 SlotCard distanceText). 거리는 DB(PostGIS)가 미터로 계산해 준다.

/**
 * 미터를 짧은 글자로. 1km 미만은 10m 단위("350m"), 1km 이상은 소수 한 자리 km("1.2km"),
 * 10km 이상은 정수 km("12km"). 거리를 모르면 undefined(카드에 표시하지 않음)
 */
export function formatDistance(meters: number | null | undefined): string | undefined {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) {
    return undefined;
  }
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10);
    // 995m처럼 반올림하면 1000m가 되는 경우는 km로 보여준다
    if (rounded < 1000) return `${rounded}m`;
  }
  const km = meters / 1000;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)}km`;
  return `${Math.round(km)}km`;
}
