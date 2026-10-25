// 로그인·계정·권한 함수(연결 #2, Issue #47). 서버에서만 쓴다. 예: import { requireShopOwner } from '@/server/auth';
// loadAccount는 아무 userId나 읽을 수 있어서 내보내지 않는다(W2 로그인 코드와 테스트만 파일에서 직접 쓴다).

export { type AccountMode, type CurrentAccount, getCurrentAccount } from './current-account';
export { ensureAdminPage, ensureCustomerPage, ensureOwnerPage } from './pages';
export {
  AUTH_ERRORS,
  type OwnerAuth,
  requireAdmin,
  requireCustomer,
  requireOwner,
  requireShopOwner,
} from './require';
