// 시간대 매물 (S-201 두 번째 방식, C-201·C-301·C-404 시간대, #308). 서버 코드용. 예: import { listSlotWindows } from '@/server/slot-windows';
// 화면('use client')에서 부르는 함수는 '@/server/slot-windows/actions'(createSlotWindows, getLastWindowSettings, closeSlotWindow, holdWindowSlot)에서,
// 모양은 '@/server/slot-windows/types', 실패 문구는 '@/server/slot-windows/errors', 상태·시작 시각 계산은 '@/server/slot-windows/starts'에서 가져온다.

export { notWindowSlot, shopInArea, staleWindowHold, type WindowArea } from './conditions';
export { SLOT_WINDOW_ERRORS, type SlotWindowErrorCode, type SlotWindowResult } from './errors';
export {
  getSlotWindow,
  listSlotWindows,
  type SlotWindowDetailQuery,
  type SlotWindowListQuery,
} from './queries';
export { checkWindowDraft, mergeRanges } from './rules';
export { closeStaleWindowHolds } from './store';
export { menusMatchingFilters, type Range, windowStarts, windowStatus } from './starts';
export type * from './types';
