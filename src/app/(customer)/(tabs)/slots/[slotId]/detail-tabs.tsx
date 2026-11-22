'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';

export type DetailTab = { id: string; label: string };

/** 탭을 누른 뒤 내려가는 동안에는 스크롤로 표시를 바꾸지 않는다(ms) */
const CLICK_LOCK_MS = 1000;

/**
 * 매물 상세의 탭 줄(11/18 정찬형, 회의 피드백 5번 A안). 누르면 그 칸으로 내려가고, 내리는 동안 지금 보는 칸을 표시한다.
 * 위쪽에 붙어 따라온다(PC는 위쪽 메뉴 64px 아래). 칸이 늘면(예: 후기) tabs에 하나 더하고 같은 id의 칸을 두면 된다.
 * 화면이 짧아 아래 칸이 위쪽까지 못 올라와도 누른 탭이 표시되고, 맨 아래까지 내리면 마지막 탭이 표시된다
 */
export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  // 탭을 누른 뒤 CLICK_LOCK_MS 동안 true. 그동안은 스크롤로 표시를 바꾸지 않는다
  const locked = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const sections = tabs
      .map((tab) => document.getElementById(tab.id))
      .filter((el): el is HTMLElement => el !== null);
    const last = tabs.at(-1);
    // 맨 아래까지 내렸으면 마지막 탭(아래 칸이 짧아 위쪽 띠까지 못 올라와도)
    function showLastIfAtBottom() {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && last) setActive(last.id);
      return atBottom;
    }
    // 탭 줄 바로 아래 띠(화면 위쪽)에 걸친 칸을 지금 보는 칸으로 본다.
    // 이 알림은 스크롤 뒤에 따로 오므로, 맨 아래면 여기서도 마지막 탭으로 둔다
    const observer = new IntersectionObserver(
      (entries) => {
        if (locked.current || showLastIfAtBottom()) return;
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '-140px 0px -60% 0px' },
    );
    for (const section of sections) observer.observe(section);
    function handleScroll() {
      if (locked.current) return;
      showLastIfAtBottom();
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [tabs]);

  // 떠날 때 남은 타이머를 지운다
  useEffect(() => () => clearTimeout(unlockTimer.current), []);

  function select(id: string) {
    locked.current = true;
    clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => {
      locked.current = false;
    }, CLICK_LOCK_MS);
    setActive(id);
  }

  return (
    <nav
      aria-label="매물 정보"
      className="sticky top-0 z-10 border-b bg-background md:top-16 md:col-start-1"
    >
      <ul className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-2 md:px-0">
        {tabs.map((tab) => (
          <li key={tab.id} className="shrink-0">
            <a
              href={`#${tab.id}`}
              aria-current={active === tab.id ? 'true' : undefined}
              className={cn(
                '-mb-px flex h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap',
                active === tab.id
                  ? 'border-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => select(tab.id)}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
