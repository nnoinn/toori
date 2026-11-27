// 최근 본 매물(C-212)을 이 기기(localStorage)에 읽고 쓴다. 화면에서만 부른다.
// 저장소를 못 쓰면(사생활 보호 창 등) 빈 목록으로 보고, 저장하지 못해도 화면은 그대로 쓴다

import {
  addRecentEntry,
  parseRecentEntries,
  RECENT_SLOTS_EVENT,
  RECENT_SLOTS_KEY,
  type RecentEntry,
} from './recent-rules';

export function readRecentEntries(): RecentEntry[] {
  try {
    return parseRecentEntries(localStorage.getItem(RECENT_SLOTS_KEY));
  } catch {
    return [];
  }
}

function writeRecentEntries(list: RecentEntry[]) {
  try {
    if (list.length > 0) localStorage.setItem(RECENT_SLOTS_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_SLOTS_KEY);
  } catch {
    // 저장하지 못해도 화면은 그대로 쓴다
  }
  // 같은 화면의 [최근 본 매물] 버튼이 바로 알 수 있게 한다(storage 이벤트는 다른 탭에만 간다)
  window.dispatchEvent(new Event(RECENT_SLOTS_EVENT));
}

/** 본 매물을 맨 앞에 남긴다 */
export function rememberRecentEntry(entry: RecentEntry) {
  writeRecentEntries(addRecentEntry(readRecentEntries(), entry));
}

/** 최근 본 매물을 모두 지운다 */
export function clearRecentEntries() {
  writeRecentEntries([]);
}
