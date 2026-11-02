// 전역 검색 (상단 검색 단추 · ⌘K / Ctrl+K): 장비 · 랙 · 고객사 · 계통 묶음 · 층 · 시나리오 · 보기 명령을 한 곳에서 찾는다.
// ↑ ↓ 로 고르고 Enter로 실행, Esc로 닫는다. 고르면 그 대상으로 바로 이동한다

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Handshake, Layers, Search, Server, Siren, Thermometer, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FLOORS, ROOM_BY_ID, ROOM_LABELS } from '../data/building';
import { CUSTOMERS } from '../data/customers';
import { EQUIPMENT } from '../data/equipment';
import { DOMAIN_META, TYPE_BY_ID } from '../data/equipTypes';
import { GROUPS } from '../data/groups';
import { RACKS } from '../data/racks';
import { AIR_LAYOUT } from '../data/thermal';
import { SCENARIO_ITEMS } from '../scenario/ScenarioPanel';
import { activateGroup, enterHeat, focusItem, goFloor } from '../scene/focus';
import { useView } from '../store/useView';
import { DOMAIN_ICON } from './kit';

interface Item {
  key: string;
  kind: string; // 분류 이름 (결과 묶음 머리)
  icon: LucideIcon;
  color?: string;
  name: string;
  sub: string;
  hay: string; // 검색 대상 글 (소문자)
  run: () => void;
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, '');

function buildItems(): Item[] {
  const out: Item[] = [];
  const add = (it: Omit<Item, 'hay'>, extra = '') => out.push({ ...it, hay: norm(`${it.name} ${it.sub} ${extra}`) });
  for (const c of CUSTOMERS)
    add({ key: `cu-${c.id}`, kind: '고객사', icon: Handshake, color: c.color, name: c.name, sub: `${c.floor} · 계약 ${c.contract.kw}kW${c.cage ? ' · 케이지' : ''}`, run: () => focusItem(`customer:${c.id}`) });
  for (const e of EQUIPMENT) {
    const t = TYPE_BY_ID[e.type];
    add(
      { key: `eq-${e.id}`, kind: '장비', icon: DOMAIN_ICON[t.domain], color: DOMAIN_META[t.domain].color, name: e.name, sub: `${e.floor} · ${ROOM_BY_ID[e.room]?.name ?? ''} · ${t.name}`, run: () => focusItem(e.id) },
      `${t.code ?? ''} ${e.id}`,
    );
  }
  for (const r of RACKS) {
    const cust = r.customer ? CUSTOMERS.find((c) => c.id === r.customer)?.name ?? '' : '';
    add(
      { key: `rk-${r.id}`, kind: '랙', icon: Server, color: DOMAIN_META.it.color, name: r.id, sub: `${r.floor} 서버실 ${r.serverRoom} · ${r.row + 1}열 ${r.index + 1}번${cust ? ` · ${cust}` : ''}`, run: () => focusItem(`rack:${r.id}`) },
      `랙 rack ${cust}`,
    );
  }
  for (const g of GROUPS) add({ key: `gr-${g.id}`, kind: '계통 묶음', icon: Layers, color: 'var(--info)', name: g.name, sub: g.desc, run: () => activateGroup(g.id) }, g.short);
  for (const f of FLOORS) add({ key: `fl-${f.id}`, kind: '층', icon: Building2, name: `${f.id} ${f.name}`, sub: f.summary, run: () => goFloor(f.id) });
  for (const [icon, name, desc, start] of SCENARIO_ITEMS)
    if (start) add({ key: `sc-${name}`, kind: '시나리오 시작', icon: icon ?? Siren, color: 'var(--crit)', name, sub: desc, run: start }, '시나리오 사고');
  for (const r of ROOM_LABELS)
    add({ key: `th-${r}`, kind: '보기', icon: Thermometer, color: '#ff922b', name: `온도 보기 · 서버실 ${r}`, sub: `${AIR_LAYOUT[r].floor} 히트맵 · 에어 플로우 · 2D 상면도`, run: () => enterHeat(r, true) }, '히트맵 기류 에어 플로우 온도');
  add({ key: 'dg-power', kind: '보기', icon: Workflow, name: '전력 단선도 열기', sub: '하단 도면', run: () => openDiagram('power') }, '흐름도 도면 단선도');
  add({ key: 'dg-cool', kind: '보기', icon: Workflow, name: '공조 흐름도 열기', sub: '하단 도면', run: () => openDiagram('cooling') }, '흐름도 도면 냉수 냉매');
  return out;
}

function openDiagram(tab: 'power' | 'cooling') {
  const s = useView.getState();
  if (s.diagramMode === 'off') s.setDiagramMode('half');
  s.setDiagramTab(tab);
}

// 분류별 최대 개수 (랙 · 장비가 결과를 다 차지하지 않게)
const LIMIT: Record<string, number> = { 고객사: 4, 장비: 8, 랙: 6, '계통 묶음': 5, 층: 6, '시나리오 시작': 7, 보기: 4 };

export function useSearchHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const all = useMemo(buildItems, []);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return all.filter((it) => it.kind === '보기' || it.kind === '고객사' || it.kind === '층');
    const scored = all
      .map((it) => {
        const name = norm(it.name);
        const score = name === n ? 0 : name.startsWith(n) ? 1 : name.includes(n) ? 2 : it.hay.includes(n) ? 3 : -1;
        return { it, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score);
    const count: Record<string, number> = {};
    return scored.filter(({ it }) => (count[it.kind] = (count[it.kind] ?? 0) + 1) <= (LIMIT[it.kind] ?? 5)).map((x) => x.it);
  }, [q, all]);

  // 분류 순서대로 묶어 보여 준다 (↑ ↓ 순서도 같게)
  const ordered = useMemo(() => {
    const kinds = [...new Set(results.map((r) => r.kind))];
    return kinds.flatMap((k) => results.filter((r) => r.kind === k));
  }, [results]);
  useEffect(() => setCur(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const run = (it: Item) => {
    onClose();
    it.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCur((c) => Math.min(ordered.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCur((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && ordered[cur]) run(ordered[cur]);
  };

  let last = '';
  const rows: ReactNode[] = [];
  ordered.forEach((it, i) => {
    if (it.kind !== last) {
      last = it.kind;
      rows.push(
        <div key={`h-${it.kind}`} className="sp-h">
          {it.kind}
        </div>,
      );
    }
    const Icon = it.icon;
    rows.push(
      <button key={it.key} data-i={i} className={`sp-item${i === cur ? ' on' : ''}`} onMouseEnter={() => setCur(i)} onClick={() => run(it)}>
        <Icon size={15} style={it.color ? { color: it.color } : undefined} />
        <span className="sp-name">{it.name}</span>
        <span className="sp-sub">{it.sub}</span>
      </button>,
    );
  });

  return createPortal(
    <div className="sp-back" onMouseDown={onClose}>
      <div className="sp" role="dialog" aria-label="전체 검색" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sp-input">
          <Search size={16} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="장비 · 랙 번호 · 고객사 · 계통 · 층 · 시나리오 검색"
            aria-label="검색어"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="sp-list" ref={list}>
          {rows.length ? rows : <p className="hint sp-empty">찾는 항목이 없습니다.</p>}
        </div>
        <div className="sp-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> 고르기
          </span>
          <span>
            <kbd>Enter</kbd> 이동 · 실행
          </span>
          <span>
            <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd> 열기
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
