// 시드 데이터 내용 (연결 #3, #18·#22). 넣는 방법은 scripts/seed.mjs.
// 매물 시각(at)은 시드를 넣는 시각 기준 몇 시간 뒤인지다(음수는 지난 시각). 언제 넣어도 같은 상태가 된다.
// 계정·샵·메뉴·매물과 예약·결제·환불(W1b)을 채운다. 정산은 결제 수수료율이 정해진 뒤, 샵 사진은 O6 뒤에 더한다.
// 샵·사람 이름은 실제 가게와 헷갈리지 않게 '샘플'로 시작하고, 전화·사업자 번호는 쓸 수 없는 번호(0000)로 둔다.

/** 시드 계정 이메일 도메인. 이 도메인의 계정과 그 데이터만 시드로 보고 지우고 다시 넣는다 */
export const SEED_EMAIL_DOMAIN = 'seed.test';

const DANWON = { sido: '경기', sigungu: '안산시 단원구', sigunguCode: '41273' };
const SANGNOK = { sido: '경기', sigungu: '안산시 상록구', sigunguCode: '41271' };
// 이웃 지역. 승인된 샵은 있지만 매물이 하나도 없다(빈 화면 확인, #18)
const SIHEUNG = { sido: '경기', sigungu: '시흥시', sigunguCode: '41390' };

// weekday 0=일 ~ 6=토 (docs/schema-v1.md shops.business_hours)
const HAIR_HOURS = [
  { weekday: 0, open: '10:00', close: '19:00' },
  { weekday: 1, closed: true },
  ...[2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '10:00', close: '20:00' })),
];
const NAIL_HOURS = [
  { weekday: 0, closed: true },
  ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '11:00', close: '21:00' })),
];

const INSTAGRAM = 'https://www.instagram.com/';
const NAVER_PLACE = 'https://map.naver.com/';

/**
 * 샵 12곳. 샵마다 원장님 계정이 하나씩 있다(owner-<key>@seed.test).
 * a: 원장님 A(#22). 메뉴·매물 상태가 모두 모여 있다. e·f는 a 옆에 붙어 있다(지도 마커 묶기)
 * b: 승인 대기, c: 반려, d: 다른 원장님(권한 확인용, 영업시간 미입력), l: 시흥시(매물 없음)
 * 매물: status 기본 published, newOnly = 신규 고객 전용, hold = 다른 고객(customer-a)이 결제 중,
 *       closeReason = 원장님 직접 마감, id·relistOf = 취소된 매물과 그 재등록 매물
 *       book = 예약한 고객(customer-<key>). visit = 방문 결과(visited·no_show), 취소된 매물은 고객 취소로 넣는다
 */
export const SEED_SHOPS = [
  {
    key: 'a',
    name: '샘플 헤어 중앙역점',
    category: 'hair',
    status: 'approved',
    area: DANWON,
    dong: '고잔동',
    lat: 37.3163,
    lng: 126.8389,
    links: { instagram: INSTAGRAM, naver: NAVER_PLACE },
    hours: HAIR_HOURS,
    description: '중앙역 2번 출구 앞 샘플 미용실이에요. 커트부터 펌·염색까지 해요.',
    menus: [
      { key: 'cut', serviceType: 'cut', name: '여성 커트', price: 25000, minutes: 60 },
      { key: 'perm', serviceType: 'perm', name: '디자인 펌', price: 98000, minutes: 150 },
      { key: 'color', serviceType: 'color', name: '전체 염색', price: 85000, minutes: 120 },
      { key: 'clinic', serviceType: 'clinic', name: '두피 클리닉', price: 45000, minutes: 60 },
      { key: 'mcut', serviceType: 'cut', name: '남성 커트', price: 18000, minutes: 30, hidden: true },
    ],
    slots: [
      { menu: 'cut', at: 1, rate: 30 },
      { menu: 'cut', at: 3, rate: 20, status: 'reserved', book: 'c' },
      { menu: 'perm', at: 5, rate: 40, newOnly: true },
      { menu: 'cut', at: 8, rate: 30, status: 'closed', closeReason: 'other_channel' },
      { menu: 'clinic', at: 10, rate: 20, hold: true },
      // 저장 값은 예약대기지만 게시 시각이 지나서 화면에서는 게시중으로 계산된다(#57)
      { menu: 'cut', at: 12, rate: 10, status: 'scheduled' },
      { menu: 'color', at: 20, rate: 20 },
      { id: 'a-cancelled', menu: 'perm', at: 26, rate: 30, status: 'cancelled', book: 'c' },
      { menu: 'perm', at: 26, rate: 30, relistOf: 'a-cancelled' },
      { menu: 'clinic', at: 30, rate: 10 },
      { menu: 'cut', at: 47, rate: 50 },
      // 게시 시각(시작 48시간 전)이 아직 안 와서 예약대기
      { menu: 'cut', at: 72, rate: 30, status: 'scheduled' },
      // 시작 시각이 지났는데 방문·노쇼 처리를 안 한 예약
      { menu: 'cut', at: -2, rate: 20, status: 'reserved', book: 'b' },
      // 팔리지 않고 시작 시각이 지나서 화면에서는 마감으로 계산된다(X-302)
      { menu: 'cut', at: -4, rate: 40 },
      { menu: 'color', at: -26, rate: 30, status: 'completed', book: 'b', visit: 'visited' },
      { menu: 'perm', at: -50, rate: 20, status: 'completed', book: 'b', visit: 'no_show' },
    ],
  },
  {
    key: 'e',
    name: '샘플 네일 중앙역점',
    category: 'nail_lash',
    status: 'approved',
    area: DANWON,
    dong: '고잔동',
    lat: 37.3168,
    lng: 126.8396,
    links: { instagram: INSTAGRAM },
    hours: NAIL_HOURS,
    description: '젤네일 전문 샘플 네일샵이에요.',
    menus: [
      { key: 'gel', serviceType: 'gel_nail', name: '젤네일 원컬러', price: 40000, minutes: 60 },
      { key: 'art', serviceType: 'gel_nail', name: '아트 젤네일', price: 65000, minutes: 90 },
      { key: 'pedi', serviceType: 'pedicure', name: '젤 페디큐어', price: 50000, minutes: 70 },
    ],
    slots: [
      { menu: 'gel', at: 2, rate: 20 },
      { menu: 'art', at: 6, rate: 30, newOnly: true },
      { menu: 'pedi', at: 25, rate: 10 },
    ],
  },
  {
    key: 'f',
    name: '샘플 래쉬 고잔',
    category: 'nail_lash',
    status: 'approved',
    area: DANWON,
    dong: '고잔동',
    lat: 37.3157,
    lng: 126.838,
    links: {},
    hours: NAIL_HOURS,
    menus: [
      { key: 'ext', serviceType: 'lash_extension', name: '속눈썹 연장', price: 60000, minutes: 90 },
      { key: 'lperm', serviceType: 'lash_perm', name: '속눈썹 펌', price: 35000, minutes: 50 },
    ],
    slots: [
      { menu: 'ext', at: 4, rate: 40 },
      { menu: 'lperm', at: 28, rate: 20, newOnly: true },
    ],
  },
  {
    key: 'g',
    name: '샘플 헤어 초지',
    category: 'hair',
    status: 'approved',
    area: DANWON,
    dong: '초지동',
    lat: 37.3205,
    lng: 126.8065,
    links: { naver: NAVER_PLACE },
    hours: HAIR_HOURS,
    menus: [
      { key: 'cut', serviceType: 'cut', name: '커트', price: 22000, minutes: 60 },
      { key: 'set', serviceType: 'perm', name: '셋팅 펌', price: 150000, minutes: 180 },
      { key: 'color', serviceType: 'color', name: '뿌리 염색', price: 80000, minutes: 120 },
    ],
    slots: [
      { menu: 'cut', at: 2, rate: 50 },
      { menu: 'set', at: 9, rate: 30 },
      { menu: 'color', at: 40, rate: 20, newOnly: true },
    ],
  },
  {
    key: 'h',
    name: '샘플 헤어 안산역',
    category: 'hair',
    status: 'approved',
    area: DANWON,
    dong: '원곡동',
    lat: 37.3279,
    lng: 126.789,
    links: {},
    hours: HAIR_HOURS,
    menus: [
      { key: 'perm', serviceType: 'perm', name: '볼륨 펌', price: 90000, minutes: 150 },
      { key: 'cut', serviceType: 'cut', name: '커트', price: 20000, minutes: 50 },
    ],
    slots: [
      { menu: 'perm', at: 3, rate: 10 },
      { menu: 'cut', at: 22, rate: 40 },
    ],
  },
  {
    key: 'i',
    name: '샘플 네일 호수공원',
    category: 'nail_lash',
    status: 'approved',
    area: DANWON,
    dong: '고잔동',
    lat: 37.3088,
    lng: 126.8275,
    links: {},
    hours: NAIL_HOURS,
    menus: [
      { key: 'care', serviceType: 'nail_care', name: '손톱 케어', price: 20000, minutes: 40 },
      { key: 'gel', serviceType: 'gel_nail', name: '젤네일 그라데이션', price: 45000, minutes: 60 },
    ],
    slots: [
      { menu: 'care', at: 5, rate: 30 },
      { menu: 'gel', at: 44, rate: 50, newOnly: true },
    ],
  },
  {
    key: 'd',
    name: '샘플 헤어 한대앞',
    category: 'hair',
    status: 'approved',
    area: SANGNOK,
    dong: '사동',
    lat: 37.3098,
    lng: 126.8533,
    links: {},
    hours: [],
    menus: [
      { key: 'cut', serviceType: 'cut', name: '커트', price: 24000, minutes: 60 },
      { key: 'color', serviceType: 'color', name: '전체 염색', price: 78000, minutes: 120 },
    ],
    slots: [
      { menu: 'cut', at: 2, rate: 20 },
      { menu: 'color', at: 18, rate: 30 },
      { menu: 'cut', at: 27, rate: 10, status: 'reserved', book: 'b' },
      { menu: 'color', at: -30, rate: 20, status: 'completed', book: 'c', visit: 'visited' },
    ],
  },
  {
    key: 'j',
    name: '샘플 네일 상록수',
    category: 'nail_lash',
    status: 'approved',
    area: SANGNOK,
    dong: '본오동',
    lat: 37.3026,
    lng: 126.8662,
    links: {},
    hours: NAIL_HOURS,
    menus: [
      { key: 'gel', serviceType: 'gel_nail', name: '젤네일 원컬러', price: 42000, minutes: 60 },
      { key: 'ext', serviceType: 'lash_extension', name: '속눈썹 연장', price: 58000, minutes: 90 },
    ],
    slots: [
      { menu: 'gel', at: 1, rate: 40 },
      { menu: 'ext', at: 33, rate: 20 },
    ],
  },
  {
    key: 'k',
    name: '샘플 헤어 월피',
    category: 'hair',
    status: 'approved',
    area: SANGNOK,
    dong: '월피동',
    lat: 37.3271,
    lng: 126.8601,
    links: {},
    hours: HAIR_HOURS,
    menus: [
      { key: 'clinic', serviceType: 'clinic', name: '모발 클리닉', price: 40000, minutes: 60 },
      { key: 'perm', serviceType: 'perm', name: '매직 펌', price: 120000, minutes: 150 },
    ],
    slots: [
      { menu: 'clinic', at: 7, rate: 10 },
      { menu: 'perm', at: 46, rate: 50, newOnly: true },
    ],
  },
  {
    key: 'b',
    name: '샘플 헤어 성포',
    category: 'hair',
    status: 'pending',
    area: SANGNOK,
    dong: '성포동',
    lat: 37.3226,
    lng: 126.846,
    links: {},
    hours: HAIR_HOURS,
    menus: [{ key: 'cut', serviceType: 'cut', name: '커트', price: 23000, minutes: 60 }],
    slots: [],
  },
  {
    key: 'c',
    name: '샘플 네일 선부',
    category: 'nail_lash',
    status: 'rejected',
    rejectionReason: '사업자등록증 사진이 흐려서 확인하기 어려워요. 다시 올려 주세요.',
    area: DANWON,
    dong: '선부동',
    lat: 37.3338,
    lng: 126.8108,
    links: {},
    hours: NAIL_HOURS,
    menus: [{ key: 'gel', serviceType: 'gel_nail', name: '젤네일', price: 38000, minutes: 60 }],
    slots: [],
  },
  {
    key: 'l',
    name: '샘플 헤어 정왕',
    category: 'hair',
    status: 'approved',
    area: SIHEUNG,
    dong: '정왕동',
    lat: 37.346,
    lng: 126.739,
    links: {},
    hours: HAIR_HOURS,
    menus: [{ key: 'cut', serviceType: 'cut', name: '커트', price: 21000, minutes: 60 }],
    slots: [],
  },
];

/**
 * 고객 계정 (#18)
 * a: 이력 없음. 원장님 A 샵 매물 하나를 결제 중(홀딩)
 * b: 원장님 A 샵 이용 완료·노쇼 이력 있음 → A 샵의 신규 고객 전용 매물이 안 보여야 한다
 * c: 예정·이용 완료·취소 예약이 하나씩(내 예약 탭)
 */
export const SEED_CUSTOMERS = [
  { key: 'a', nickname: '샘플 고객 A' },
  { key: 'b', nickname: '샘플 고객 B' },
  { key: 'c', nickname: '샘플 고객 C' },
];

/** 시드 계정 전체. key는 owner-a, customer-a처럼 쓴다 */
export const SEED_ACCOUNTS = [
  ...SEED_SHOPS.map((shop) => ({ key: `owner-${shop.key}`, email: `owner-${shop.key}@${SEED_EMAIL_DOMAIN}` })),
  ...SEED_CUSTOMERS.map((c) => ({
    key: `customer-${c.key}`,
    email: `customer-${c.key}@${SEED_EMAIL_DOMAIN}`,
  })),
];
