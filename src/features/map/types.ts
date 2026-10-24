// 지도·위치에서 같이 쓰는 타입. 화면과 서버 어디서나 쓴다.

/** WGS84 좌표 */
export type LatLng = { lat: number; lng: number };

/** 지도에서 보이는 영역. J4에서 이 영역 안의 매물을 조회한다 */
export type MapBounds = { sw: LatLng; ne: LatLng };

/** 지도에 찍을 샵 하나(마커는 샵 단위, J3) */
export type MapShop = {
  shopId: string;
  name: string;
  lat: number;
  lng: number;
  /** 이 샵의 게시중 매물 수 */
  slotCount: number;
};
