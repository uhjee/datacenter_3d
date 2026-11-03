// ⋯ 메뉴: 휴대폰 상단 바에 다 들어가지 않는 버튼(도면 · 시나리오 · 가이드 투어 등)을 모아 둔다.
// 바깥을 누르거나 Esc · 항목을 고르면 닫힌다

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { IconButton } from './kit';

export interface MoreItem {
  icon: LucideIcon;
  label: string;
  on?: boolean;
  onSelect: () => void;
}

export function MoreMenu({ items, label = '더 보기' }: { items: MoreItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={box}>
      <IconButton icon={MoreHorizontal} label={label} active={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="more-list" role="menu">
          {items.map(({ icon: Icon, label: text, on, onSelect }) => (
            <button
              key={text}
              role="menuitem"
              className={on ? 'on' : ''}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
            >
              <Icon size={16} />
              <span>{text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
