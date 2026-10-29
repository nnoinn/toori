// 정산 계산 (X-205, 연결 #10, #129). 계산만 하는 함수라 화면과 서버 어디서나 가져올 수 있다.
// 예: import { previewSettlement } from '@/server/settlements';

export {
  allocatePenalties,
  calcSettlementFees,
  calcTuriShare,
  type OutstandingPenalty,
  type SettlementFees,
  settlementBaseAmount,
  type TuriShare,
} from './calc-settlement';
export { previewSettlement, type SettlementPreview } from './preview';
