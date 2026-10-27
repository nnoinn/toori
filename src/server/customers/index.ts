// 신규 고객 판별 (연결 #7, Issue #49). 서버에서만 쓴다. 예: import { newCustomerOnlyVisible } from '@/server/customers';

export {
  getVisitedShopIds,
  isNewCustomer,
  newCustomerOnlyVisible,
  VISITED_RESERVATION_STATUSES,
} from './new-customer';
