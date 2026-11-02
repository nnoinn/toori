// 카카오맵 JS SDK(dapi.kakao.com/v2/maps/sdk.js)에서 쓰는 부분만 적은 타입 (D6: 패키지 없이 공식 SDK 직접).
// 새 기능을 쓰면 여기에 필요한 만큼만 더한다. https://apis.map.kakao.com/web/documentation/

declare namespace kakao.maps {
  function load(callback: () => void): void;

  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  class LatLngBounds {
    getSouthWest(): LatLng;
    getNorthEast(): LatLng;
  }

  type MapOptions = { center: LatLng; level?: number };

  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(latlng: LatLng): void;
    getCenter(): LatLng;
    getLevel(): number;
    getBounds(): LatLngBounds;
    relayout(): void;
    /** 휠·두 손가락 확대·축소를 켜고 끈다 */
    setZoomable(zoomable: boolean): void;
    /** 확대 정도를 바꾼다. anchor를 주면 그 자리를 기준으로 확대한다 */
    setLevel(level: number, options?: { anchor?: LatLng; animate?: boolean }): void;
  }

  type CustomOverlayOptions = {
    position: LatLng;
    /** 지도 위에 그릴 요소 */
    content: HTMLElement;
    map?: Map;
    /** 요소의 어느 점을 position에 맞출지(0~1). 0.5면 가운데 */
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    /** true여야 요소 클릭이 지도 클릭으로 넘어가지 않는다 */
    clickable?: boolean;
  };

  /** 마커 대신 HTML 요소를 지도 위 좌표에 띄운다(구 묶음 표시, #204) */
  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
  }

  type MarkerOptions = {
    position: LatLng;
    map?: Map;
    title?: string;
    image?: MarkerImage;
    zIndex?: number;
    /** true여야 마커 클릭이 지도 클릭으로 넘어가지 않는다 */
    clickable?: boolean;
  };

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    getPosition(): LatLng;
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  class MarkerImage {
    constructor(src: string, size: Size, options?: { offset?: Point });
  }

  type MarkerClustererOptions = {
    map: Map;
    averageCenter?: boolean;
    minLevel?: number;
    disableClickZoom?: boolean;
    /** 묶을 거리(화면 픽셀). 기본 60 */
    gridSize?: number;
  };

  class MarkerClusterer {
    constructor(options: MarkerClustererOptions);
    addMarkers(markers: Marker[]): void;
    clear(): void;
  }

  namespace event {
    function addListener(target: Map | Marker, type: string, handler: () => void): void;
    function removeListener(target: Map | Marker, type: string, handler: () => void): void;
  }
}

interface Window {
  kakao?: typeof kakao;
}
