// 로그인·계정·권한 함수(연결 #2, Issue #47). 서버에서만 쓴다. 예: import { requireShopOwner } from '@/server/auth';
// loadAccount는 아무 userId나 읽을 수 있어서 내보내지 않는다(로그인 콜백과 테스트만 파일에서 직접 쓴다).
// 화면('use client')에서도 부르는 함수는 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 로그인·로그아웃·계정 전환(signInWithProvider, signOut, switchAccountMode): '@/server/auth/session'
// - 고객 가입·광고성 동의(createCustomerAccount, takeMarketingConsentNotice, setMarketingConsent, getMarketingConsent): '@/server/auth/customer-account'

export { type AccountMode } from './account-mode';
export { type MarketingConsent } from './account-store';
export { type CurrentAccount, getCurrentAccount } from './current-account';
export { ensureAdminPage, ensureCustomerPage, ensureOwnerPage } from './pages';
export {
  AUTH_ERRORS,
  type OwnerAuth,
  requireAdmin,
  requireCustomer,
  requireOwner,
  requireShopOwner,
} from './require';
