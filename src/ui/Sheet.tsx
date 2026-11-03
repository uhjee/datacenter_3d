// 휴대폰 바텀 시트 (docs/research/03-mobile-responsive.md §4.1): 오른쪽 패널(정보 · 지표 · 주의 · 시나리오)을 아래에서 올라오게 담는다.
//   높이 3단계: peek(손잡이 + 요약 한 줄) · half(화면 절반) · full(상단 바 아래까지). 덮개 없이 3D를 그대로 만질 수 있다
//   손잡이 줄을 끌면 높이가 따라오고, 놓으면 가까운 단계로 붙는다. 탭하면 peek ↔ half
//   지금 높이를 CSS 변수 --sheet-h로 알려 3D 위 칩 줄 · 알림이 시트 위로 비켜 서게 한다

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GROUP_BY_ID } from '../data/groups';
import { nodeInfo } from '../data/graph';
import { useView } from '../store/useView';
import { Pill } from './kit';
import { useMetrics, useNodeStatus } from './useStatus';

export type SheetSnap = 'peek' | 'half' | 'full';

const PEEK = 64; // 손잡이 + 요약 한 줄 (홈 표시줄 여백은 따로 더한다)
const TAP = 6;

function snapPx(s: SheetSnap) {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 48;
  if (s === 'peek') return PEEK;
  if (s === 'half') return Math.round(vh * 0.5);
  return Math.round(vh - top - 8);
}

export function Sheet({ snap, onSnap, children }: { snap: SheetSnap; onSnap: (s: SheetSnap) => void; children: ReactNode }) {
  const [drag, setDrag] = useState<number | null>(null); // 끄는 중 높이(px)
  const start = useRef<{ y: number; h: number } | null>(null);
  const [, setVh] = useState(0);
  // 화면 회전 · 주소창 변화로 높이가 바뀌면 단계 높이를 다시 잰다
  useEffect(() => {
    const re = () => setVh(window.innerHeight);
    window.addEventListener('resize', re);
    return () => window.removeEventListener('resize', re);
  }, []);
  const h = drag ?? snapPx(snap);
  useEffect(() => {
    if (drag != null) return;
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
    document.documentElement.dataset.sheet = snap;
  }, [drag, h, snap]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--sheet-h');
      delete document.documentElement.dataset.sheet;
    },
    [],
  );

  const onDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, h };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    if (drag == null && Math.abs(dy) < TAP) return;
    setDrag(Math.max(PEEK, Math.min(snapPx('full'), s.h - dy)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (drag == null) {
      // 탭: 접혀 있으면 절반으로, 펼쳐져 있으면 접는다
      onSnap(snap === 'peek' ? 'half' : 'peek');
      return;
    }
    const near = (['peek', 'half', 'full'] as SheetSnap[]).reduce((a, b) => (Math.abs(snapPx(b) - drag) < Math.abs(snapPx(a) - drag) ? b : a));
    setDrag(null);
    onSnap(near);
  };

  return (
    <div className={`sheet${drag != null ? ' dragging' : ''}`} style={{ height: `calc(${h}px + env(safe-area-inset-bottom))` }} data-snap={snap}>
      <div className="sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <i aria-hidden />
        <SheetPeek />
      </div>
      <div className="sheet-body" aria-hidden={snap === 'peek' && drag == null}>
        {children}
      </div>
    </div>
  );
}

// 접혀 있을 때 보이는 한 줄: 고른 대상(이름 · 층 · 상태) → 계통 묶음 → 건물 PUE
function SheetPeek() {
  const id = useView((s) => s.selectedId);
  const groupId = useView((s) => s.groupId);
  if (id) return <PickedPeek id={id} />;
  if (groupId && GROUP_BY_ID[groupId]) return <Peek title={GROUP_BY_ID[groupId].name} sub="계통 묶음" />;
  return <PuePeek />;
}

function PickedPeek({ id }: { id: string }) {
  const n = nodeInfo(id);
  const st = useNodeStatus(id);
  return (
    <Peek
      title={n?.name ?? id}
      sub={n?.floor}
      aside={
        st && (
          <Pill tone={st.tone} color={st.color}>
            {st.label}
          </Pill>
        )
      }
    />
  );
}

function PuePeek() {
  const m = useMetrics();
  return <Peek title="건물 개요" sub="지하 1층 ~ 옥상" aside={<span className="sheet-pue num">PUE <b>{m.pue.toFixed(2)}</b></span>} />;
}

function Peek({ title, sub, aside }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="sheet-peek">
      <b>{title}</b>
      {sub && <span>{sub}</span>}
      {aside && <span className="sheet-aside">{aside}</span>}
    </div>
  );
}
