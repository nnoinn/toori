'use client';

import * as React from 'react';
import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'cn';
import { GripVertical } from 'lucide-react';

import {
  handleLabel,
  reorderIds,
  SORTABLE_INSTRUCTIONS,
  SORTABLE_ROLE_DESCRIPTION,
  sortableTexts,
} from './sortable-list-texts';

// 끌어서 순서 바꾸기 목록(11/13 nnoinn, #358 메뉴 순서·사진 순서). @dnd-kit으로 마우스·터치·키보드를 모두 받는다.
// 줄마다 손잡이를 잡고 위아래로 끌면 순서가 바뀌고, 놓으면 onReorder로 새 순서(id 목록)를 준다. 저장은 부른 쪽이 한다
// (저장이 실패하면 부른 쪽이 items를 원래 순서로 돌려준다. 이 목록은 items 순서를 그대로 그린다).
// 키보드: 손잡이에서 스페이스·엔터로 잡고 ↑↓로 옮긴 뒤 스페이스·엔터로 놓는다(Esc는 그만두기). 화면 읽기 프로그램에 한국어로 알려 준다.
// 폰: 손잡이에만 touch-action: none을 걸어서, 손잡이가 아닌 곳을 끌면 화면이 그대로 스크롤된다.
//
// 쓰는 법:
//   <SortableList
//     items={menus}
//     getId={(menu) => menu.id}
//     getName={(menu) => menu.name}
//     onReorder={(ids) => saveOrder(ids)}
//     renderItem={(menu, handle) => (
//       <div className="flex items-center gap-2">{handle}<span>{menu.name}</span></div>
//     )}
//   />

/** 위아래로만 움직인다(옆으로 흔들리지 않게) */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

type SortableListProps<T> = {
  items: readonly T[];
  getId: (item: T) => string;
  /** 줄 이름. 손잡이 이름표와 화면 읽기 프로그램 안내에 쓴다(예: 메뉴 이름) */
  getName: (item: T) => string;
  /** 끌어 놓은 뒤의 새 순서(id 목록). 제자리에 놓으면 부르지 않는다 */
  onReorder: (orderedIds: string[]) => void;
  /** 한 줄. handle(손잡이)을 줄 안의 원하는 자리에 둔다 */
  renderItem: (item: T, handle: React.ReactNode) => React.ReactNode;
  /** 저장하는 동안처럼 잠시 끌지 못하게 할 때 */
  disabled?: boolean;
  className?: string;
};

export function SortableList<T>({
  items,
  getId,
  getName,
  onReorder,
  renderItem,
  disabled = false,
  className,
}: SortableListProps<T>) {
  // 서버와 브라우저가 같은 id를 쓰게 한다(안내 문구를 잇는 aria-describedby가 hydration 경고를 내지 않게)
  const dndId = React.useId();
  const sensors = useSensors(
    // 4px 넘게 움직여야 끌기로 본다(손잡이를 그냥 누르면 아무 일도 없다)
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);

  const nameOf = (id: UniqueIdentifier) => {
    const item = items.find((candidate) => getId(candidate) === id);
    return item ? getName(item) : '';
  };
  const placeOf = (id: UniqueIdentifier) => ({
    position: ids.indexOf(String(id)) + 1,
    total: ids.length,
  });

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      sortableTexts.picked({ name: nameOf(active.id), ...placeOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? sortableTexts.moved({ name: nameOf(active.id), ...placeOf(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? sortableTexts.dropped({ name: nameOf(active.id), ...placeOf(over.id) })
        : sortableTexts.cancelled(nameOf(active.id)),
    onDragCancel: ({ active }) => sortableTexts.cancelled(nameOf(active.id)),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const next = reorderIds(ids, String(active.id), String(over.id));
    if (next) onReorder(next);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: SORTABLE_INSTRUCTIONS },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul data-slot="sortable-list" className={cn('flex flex-col gap-2', className)}>
          {items.map((item) => (
            <SortableRow
              key={getId(item)}
              id={getId(item)}
              name={getName(item)}
              disabled={disabled}
            >
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  name,
  disabled,
  children,
}: {
  id: string;
  name: string;
  disabled: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled, attributes: { roleDescription: SORTABLE_ROLE_DESCRIPTION } });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={handleLabel(name)}
      disabled={disabled}
      data-slot="sortable-handle"
      className={cn(
        'relative flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50',
        // 폰(md 미만)에서는 보이는 크기는 그대로 두고 누르는 범위를 44px로 넓힌다
        "max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']",
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-lg')}
    >
      {children(handle)}
    </li>
  );
}
