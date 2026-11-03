// 전국 시·군·구 동네 목록 만들기 (#200). 한 번 돌려 src/features/map/region-data.ts를 만들고, 바뀐 행정구역이 있을 때 다시 돌린다.
//   node scripts/build-regions.mjs && npm run format
// 1) 시·군·구 이름과 코드: 행정표준코드관리시스템(code.go.kr) 법정동코드 화면의 시·도별 시·군·구 목록(현존만)
// 2) 중심 좌표: 카카오 로컬 API 주소 검색(.env.local의 KAKAO_REST_API_KEY, R5 #16). 기존 안산 두 곳과 같은 방법
// 일반구가 있는 시(예: 안산시)는 시 대신 구(안산시 상록구·단원구)를 쓴다. 샵의 sigungu_code(법정동 코드 앞 5자리)가 구 코드라서다.
// 시·군·구가 없는 세종특별자치시는 시·도를 그대로 쓴다(geocode.ts 주석과 같게).

import { writeFileSync } from 'node:fs';

const CODE_SITE = 'https://www.code.go.kr';
const OUT_FILE = 'src/features/map/region-data.ts';

process.loadEnvFile('.env.local');
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
if (!KAKAO_KEY) throw new Error('.env.local에 KAKAO_REST_API_KEY가 없어요.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function codeSitePage() {
  const response = await fetch(`${CODE_SITE}/stdcode/regCodeL.do`);
  if (!response.ok) throw new Error(`법정동코드 화면을 열지 못했어요: ${response.status}`);
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { html: await response.text(), cookie };
}

/** 법정동코드 화면의 시·도 고르기 목록 */
function parseSidos(html) {
  const select = html.match(/<select name="sidoCd"[\s\S]*?<\/select>/)?.[0] ?? '';
  return [...select.matchAll(/<option value="(\d{2})"\s*>([^<]+)<\/option>/g)].map(([, code, name]) => ({
    code,
    name: name.trim(),
  }));
}

/** 그 시·도의 시·군·구(현존) 이름과 코드 뒤 세 자리 */
async function fetchSigungus(sidoCode, cookie) {
  const body = new URLSearchParams({ sidoCd: sidoCode, searchOk: '0', codeseId: '00002', disuseAt: '0' });
  const response = await fetch(`${CODE_SITE}/stdcode/sggCodeIL.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body,
  });
  if (!response.ok) throw new Error(`${sidoCode} 시·군·구 목록을 받지 못했어요: ${response.status}`);
  const html = await response.text();
  const names = html.match(/strSggNm = "([^"]*)"/)?.[1].split(',').filter(Boolean) ?? [];
  const codes = html.match(/strSggCd = "([^"]*)"/)?.[1].split(',').filter(Boolean) ?? [];
  if (names.length !== codes.length) throw new Error(`${sidoCode} 이름과 코드 수가 달라요`);
  return names.map((name, i) => ({ name: name.trim(), code: `${sidoCode}${codes[i]}` }));
}

/** 일반구가 있는 시는 빼고 구를 남긴다(예: 안산시 → 안산시 단원구·상록구) */
function leafSigungus(list) {
  return list.filter((item) => !list.some((other) => other.name.startsWith(`${item.name} `)));
}

/**
 * 카카오 주소 검색으로 그 시·군·구의 대표 좌표. 결과의 법정동 코드가 그 시·군·구(세종은 시·도)로 시작하지 않으면 null.
 * 행정구역이 바뀐 곳(예: 광주·전남 → 전남광주통합특별시, 인천 구 개편)은 코드표에 옛 코드가 남아 있어도
 * 카카오 주소는 새 코드라서 여기서 빠진다. 샵 주소(geocode.ts)도 카카오 코드를 쓰므로 새 코드만 있으면 된다
 */
async function kakaoCenter(query, code) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', query);
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!response.ok) throw new Error(`카카오 주소 검색 실패(${query}): ${response.status}`);
  const { documents } = await response.json();
  const match = documents.find((doc) => doc.address?.b_code?.startsWith(code)) ?? null;
  if (!match) return null;
  return { lat: Number(Number(match.y).toFixed(6)), lng: Number(Number(match.x).toFixed(6)) };
}

const { html, cookie } = await codeSitePage();
const sidos = parseSidos(html);
if (sidos.length < 17) throw new Error(`시·도가 너무 적어요(${sidos.length}). 화면 모양이 바뀌었는지 확인해 주세요`);

const result = [];
const missing = [];
for (const sido of sidos) {
  const list = await fetchSigungus(sido.code, cookie);
  // 시·군·구가 없는 시·도(세종)는 시·도 하나를 동네로 쓴다. 코드는 샵 주소의 법정동 코드 앞 5자리(36110)
  const items = list.length > 0 ? leafSigungus(list) : [{ name: sido.name, code: `${sido.code}110` }];
  const regions = [];
  for (const item of items) {
    const isSido = item.name === sido.name;
    const query = isSido ? sido.name : `${sido.name} ${item.name}`;
    const center = await kakaoCenter(query, isSido ? sido.code : item.code);
    await sleep(60);
    if (!center) {
      missing.push(`${item.code} ${query}`);
      continue;
    }
    const parts = item.name.split(' ');
    regions.push({
      code: item.code,
      name: parts.at(-1),
      sigungu: item.name,
      sido: sido.name,
      center,
    });
  }
  // 시·도 안에서는 코드 순서(행정 순서, 관심 동네를 돌려주는 순서). 화면은 이름 순서로 보여 준다
  regions.sort((a, b) => a.code.localeCompare(b.code));
  // 시·군·구가 모두 빠진 시·도(통합으로 없어진 옛 시·도)는 목록에 두지 않는다
  if (regions.length > 0) result.push({ code: sido.code, name: sido.name, regions });
  await sleep(200);
}

const header = `// 전국 시·군·구 동네 목록 (#200). scripts/build-regions.mjs가 만든 파일이라 손으로 고치지 않는다.
// 이름·코드: 행정표준코드관리시스템 법정동코드(현존), 중심 좌표: 카카오 로컬 API 주소 검색. 만든 날: ${new Date().toISOString().slice(0, 10)}
// 동네를 고르는 화면·관심 동네·동네 쿠키 확인이 이 목록을 쓴다(regions.ts).

import type { RegionSido } from './regions';

export const REGION_SIDOS: readonly RegionSido[] = `;
writeFileSync(OUT_FILE, `${header}${JSON.stringify(result, null, 2)};\n`);
const total = result.reduce((sum, sido) => sum + sido.regions.length, 0);
console.log(`시·도 ${result.length}곳, 시·군·구 ${total}곳 → ${OUT_FILE}`);
if (missing.length > 0) console.log(`좌표를 찾지 못해 뺀 곳 ${missing.length}곳:\n${missing.join('\n')}`);
