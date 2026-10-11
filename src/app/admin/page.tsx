import type { Metadata } from 'next';

export const metadata: Metadata = { title: '운영자' };

// 운영자 화면(A-101~). 강규민이 만든다.
export default function AdminHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-2 p-6">
      <h1 className="text-xl font-bold">운영자 화면</h1>
      <p className="text-muted-foreground">지금은 준비 중이에요.</p>
    </main>
  );
}
