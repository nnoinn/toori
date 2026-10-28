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
