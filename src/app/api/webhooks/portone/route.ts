// 포트원 웹훅 (X-204, W13). 포트원 콘솔에 등록한 주소다. 서명이 맞을 때만 처리한다.
// 200이 아니면 포트원이 다시 보낸다(최대 5번, 1·4·16·64·256분 뒤). 끝내 못 받아도 정리 작업이 오래된 주문과 취소를 마무리한다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { handlePortOneWebhook, verifyWebhook } from '@/server/payments';

// 포트원을 부르므로 넉넉히 둔다. 포트원은 30초까지 기다리고, 끊겨도 다시 보낸다
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] PORTONE_WEBHOOK_SECRET이 없어요');
    return Response.json({ error: 'NOT_CONFIGURED' }, { status: 500 });
  }

  const now = await getRequestNow();
  // 서명은 받은 그대로의 내용으로 계산한다
  const event = verifyWebhook(secret, await request.text(), request.headers, now);
  if (!event) {
    console.error('[webhook] 서명이 맞지 않아요');
    return Response.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  try {
    const outcome = await handlePortOneWebhook(getDb(), event, now);
    return Response.json({ outcome }, { status: outcome === 'retry' ? 503 : 200 });
  } catch (error) {
    console.error('[webhook] 처리 실패:', error instanceof Error ? error.name : 'unknown');
    return Response.json({ error: 'FAILED' }, { status: 500 });
  }
}
