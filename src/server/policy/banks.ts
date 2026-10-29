// 정산 계좌 은행 (S-107, #47 4장). 금융결제원 3자리 은행 코드(10/28 강규민 결정).
// 원장님 가입 화면(정민석)의 은행 고르기와 서버 확인이 같은 목록을 쓴다. 화면에서도 가져다 쓰므로 server-only 표시를 하지 않는다.
// 토스페이먼츠 지급대행 셀러 등록(#15 W20) 때 PG 코드 체계가 다르면 그때 바꿔 넣는다.

export const BANKS = [
  { code: '004', name: 'KB국민은행' },
  { code: '088', name: '신한은행' },
  { code: '020', name: '우리은행' },
  { code: '081', name: '하나은행' },
  { code: '011', name: 'NH농협은행' },
  { code: '012', name: '지역농축협' },
  { code: '003', name: 'IBK기업은행' },
  { code: '090', name: '카카오뱅크' },
  { code: '092', name: '토스뱅크' },
  { code: '089', name: '케이뱅크' },
  { code: '071', name: '우체국' },
  { code: '045', name: '새마을금고' },
  { code: '048', name: '신협' },
  { code: '007', name: 'Sh수협은행' },
  { code: '002', name: 'KDB산업은행' },
  { code: '023', name: 'SC제일은행' },
  { code: '027', name: '한국씨티은행' },
  { code: '031', name: 'iM뱅크(대구)' },
  { code: '032', name: '부산은행' },
  { code: '039', name: '경남은행' },
  { code: '034', name: '광주은행' },
  { code: '037', name: '전북은행' },
  { code: '035', name: '제주은행' },
  { code: '050', name: '저축은행' },
  { code: '064', name: '산림조합' },
] as const;

export type BankCode = (typeof BANKS)[number]['code'];

export const BANK_CODES = BANKS.map((bank) => bank.code) as [BankCode, ...BankCode[]];
