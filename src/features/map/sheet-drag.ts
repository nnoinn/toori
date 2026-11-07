'use client';

// 홈 지도 아래 목록 시트 끌기 (폰, 11/7). 시트는 내림(손잡이만) / 반 / 전체 3단계다.
// 손잡이를 끌면 시트 높이가 손가락을 따라오고, 놓으면 가장 가까운 단계에 붙는다. 빠르게 튕기면 튕긴 쪽의 다음 단계로 간다.
// 그냥 누르면 내림 → 반, 반 → 전체, 전체 → 반.
// 높이 계산·붙을 곳 정하기는 화면 없이 테스트한다(sheet-drag.test.ts).

import { useRef, useState, type PointerEvent, type RefObject } from 'react';

export type SheetSize = 'min' | 'half' | 'full';

/** 시트 단계별 높이(px). min은 손잡이 높이, full은 지도+시트 전체 칸 높이 */
export type SheetPoints = Record<SheetSize, number>;

const ORDER: SheetSize[] = ['min', 'half', 'full'];

/** 이만큼(px) 안 움직이고 떼면 끈 것이 아니라 누른 것으로 본다 */
export const SHEET_TAP_SLOP = 8;

/** 놓기 직전 이 빠르기(px/ms)보다 빠르면 가까운 쪽이 아니라 튕긴 쪽으로 붙인다 */
export const SHEET_FLICK_SPEED = 0.5;

/** 손가락을 멈춘 채 이 시간(ms)이 지나고 떼면 튕긴 것으로 보지 않는다 */
const FLICK_WINDOW_MS = 100;

/** 끄는 동안 시트 높이는 내림(손잡이만)과 전체 사이에서만 움직인다 */
export function clampSheetHeight(height: number, points: SheetPoints): number {
  return Math.min(points.full, Math.max(points.min, height));
}

/**
 * 놓았을 때 붙을 단계. velocity는 놓기 직전 손가락 빠르기(px/ms, 아래로 +, 위로 −).
 * 빠르게 위로 튕기면 지금 높이보다 큰 다음 단계, 아래로 튕기면 작은 다음 단계, 아니면 가장 가까운 단계
 */
export function snapSheet({
  height,
  points,
  velocity,
}: {
  height: number;
  points: SheetPoints;
  velocity: number;
}): SheetSize {
  if (velocity <= -SHEET_FLICK_SPEED) return ORDER.find((s) => points[s] > height) ?? 'full';
  if (velocity >= SHEET_FLICK_SPEED) {
    return [...ORDER].reverse().find((s) => points[s] < height) ?? 'min';
  }
  return ORDER.reduce((best, s) =>
    Math.abs(points[s] - height) < Math.abs(points[best] - height) ? s : best,
  );
}

/** 손잡이를 그냥 눌렀을 때: 내림 → 반, 반 → 전체, 전체 → 반 */
export function nextSheetOnTap(sheet: SheetSize): SheetSize {
  return sheet === 'half' ? 'full' : 'half';
}

type Drag = {
  pointerId: number;
  startY: number;
  startHeight: number;
  points: SheetPoints;
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
        // 내림 높이 = 손잡이 높이(시트 위 둥근 테두리 포함)
        points: { min: e.currentTarget.offsetHeight + 1, half: full / 2, full },
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
      setHeight(clampSheetHeight(d.startHeight - dy, d.points));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (movedRef.current) {
        const velocity = e.timeStamp - d.lastT > FLICK_WINDOW_MS ? 0 : d.velocity;
        const h = clampSheetHeight(d.startHeight - (e.clientY - d.startY), d.points);
        setSheet(snapSheet({ height: h, points: d.points, velocity }));
      }
      end();
    },
    onPointerCancel() {
      movedRef.current = false;
      end();
    },
    // 그냥 누르기와 키보드(Enter·Space)
    onClick() {
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      setSheet(nextSheetOnTap(sheet));
    },
  };

  return { height, handleProps };
}
