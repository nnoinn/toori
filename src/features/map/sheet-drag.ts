'use client';

// 홈 지도 아래 목록 시트 끌기 (폰, 11/7). 손잡이를 끌면 시트 높이가 손가락을 따라오고,
// 놓으면 반 / 전체 중 가까운 쪽에 붙는다. 빠르게 튕기면 튕긴 쪽으로 간다. 그냥 누르면 지금처럼 반 ↔ 전체로 바뀐다.
// 높이 계산·붙을 곳 정하기는 화면 없이 테스트한다(sheet-drag.test.ts).

import { useRef, useState, type PointerEvent, type RefObject } from 'react';

export type SheetSize = 'half' | 'full';

/** 이만큼(px) 안 움직이고 떼면 끈 것이 아니라 누른 것으로 본다 */
export const SHEET_TAP_SLOP = 8;

/** 놓기 직전 이 빠르기(px/ms)보다 빠르면 가까운 쪽이 아니라 튕긴 쪽으로 붙인다 */
export const SHEET_FLICK_SPEED = 0.5;

/** 손가락을 멈춘 채 이 시간(ms)이 지나고 떼면 튕긴 것으로 보지 않는다 */
const FLICK_WINDOW_MS = 100;

/** 끄는 동안 시트 높이는 반과 전체 사이에서만 움직인다 */
export function clampSheetHeight(height: number, half: number, full: number): number {
  return Math.min(full, Math.max(half, height));
}

/**
 * 놓았을 때 붙을 크기. velocity는 놓기 직전 손가락 빠르기(px/ms, 아래로 +, 위로 −).
 * 빠르게 위로 튕기면 전체, 아래로 튕기면 반, 아니면 반과 전체의 가운데를 넘었는지로 정한다
 */
export function snapSheet({
  height,
  half,
  full,
  velocity,
}: {
  height: number;
  half: number;
  full: number;
  velocity: number;
}): SheetSize {
  if (velocity <= -SHEET_FLICK_SPEED) return 'full';
  if (velocity >= SHEET_FLICK_SPEED) return 'half';
  return height >= (half + full) / 2 ? 'full' : 'half';
}

type Drag = {
  pointerId: number;
  startY: number;
  startHeight: number;
  half: number;
  full: number;
  lastY: number;
  lastT: number;
  velocity: number;
};

/**
 * 손잡이에 붙일 끌기. sheetRef는 시트(section), 시트의 부모가 지도+시트 전체 칸이다.
 * height는 끄는 동안의 시트 높이(px), 끌지 않을 때는 null(평소처럼 반/전체 클래스로 그린다)
 */
export function useSheetDrag(
  sheet: SheetSize,
  setSheet: (next: SheetSize) => void,
  sheetRef: RefObject<HTMLElement | null>,
) {
  const dragRef = useRef<Drag | null>(null);
  // 끌고 난 뒤 따라오는 click은 누른 것으로 치지 않는다
  const movedRef = useRef(false);
  const [height, setHeight] = useState<number | null>(null);

  const end = () => {
    dragRef.current = null;
    setHeight(null);
  };

  const handleProps = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = sheetRef.current;
      const container = el?.parentElement;
      if (!el || !container) return;
      const full = container.clientHeight;
      movedRef.current = false;
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: el.getBoundingClientRect().height,
        half: full / 2,
        full,
        lastY: e.clientY,
        lastT: e.timeStamp,
        velocity: 0,
      };
      // 손잡이 밖으로 나가도 계속 따라오게 붙잡는다
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 못 붙잡아도(이미 끝난 손가락 등) 끌기는 그대로 한다
      }
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dy = e.clientY - d.startY;
      if (!movedRef.current && Math.abs(dy) < SHEET_TAP_SLOP) return;
      movedRef.current = true;
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      setHeight(clampSheetHeight(d.startHeight - dy, d.half, d.full));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (movedRef.current) {
        const velocity = e.timeStamp - d.lastT > FLICK_WINDOW_MS ? 0 : d.velocity;
        const h = clampSheetHeight(d.startHeight - (e.clientY - d.startY), d.half, d.full);
        setSheet(snapSheet({ height: h, half: d.half, full: d.full, velocity }));
      }
      end();
    },
    onPointerCancel() {
      movedRef.current = false;
      end();
    },
    // 그냥 누르기와 키보드(Enter·Space)는 지금처럼 반 ↔ 전체
    onClick() {
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      setSheet(sheet === 'half' ? 'full' : 'half');
    },
  };

  return { height, handleProps };
}
