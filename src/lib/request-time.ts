import { connection } from 'next/server';

// 서버 컴포넌트에서 "지금"이 필요할 때 쓴다(남은 시간 타이머의 serverNow 등).
// Cache Components에서는 현재 시각을 미리 만들어 둔 화면에 넣을 수 없어서, connection()으로 요청 때 만든다.
// 이 함수를 쓰는 컴포넌트는 <Suspense> 안에 둔다.
export async function getRequestNow(): Promise<Date> {
  await connection();
  return new Date();
}
