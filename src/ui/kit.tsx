// 패널 공통 부품 (docs/ui-proposal.html 시안의 부품). 클래스 이름은 기존 규칙과 겹치지 않게 k- 로 시작한다

import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Flame,
  Info,
  Minus,
  OctagonX,
  Server,
  Shield,
  Snowflake,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Domain } from '../data/equipTypes';

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

const TONE_VAR: Record<Tone, string> = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', info: 'var(--info)', muted: 'var(--ink-3)' };
// 상태는 색만으로 구분하지 않도록 아이콘을 함께 붙인다
const TONE_ICON: Record<Tone, LucideIcon> = { ok: Check, warn: CircleAlert, crit: OctagonX, info: Info, muted: Minus };

export const DOMAIN_ICON: Record<Domain, LucideIcon> = { power: Zap, cooling: Snowflake, fire: Flame, security: Shield, it: Server };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// 카드 틀: 머리 영역 + 본문
export function Card({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="rp-card">
      {head}
      <div className="rp-body">{children}</div>
    </div>
  );
}

// 영역 아이콘 칸 (머리 영역 왼쪽)
export function Glyph({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span className="k-glyph" style={{ '--c': color } as CSSProperties}>
      <Icon size={20} strokeWidth={2} />
    </span>
  );
}

export function IconButton({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button className={`k-icon-btn${active ? ' on' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}

// 머리 영역: 아이콘 · 위치 경로 · 이름 · 상태 알약 · 아이콘 버튼
export function PanelHead(p: { glyph?: ReactNode; crumb?: string[]; title: ReactNode; pills?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`k-head${p.glyph ? '' : ' no-glyph'}`}>
      {p.glyph}
      <div className="k-head-main">
        {p.crumb && p.crumb.length > 0 && (
          <div className="k-crumb">
            {p.crumb.map((c, i) => (
              <span key={i}>
                {i > 0 && <i>›</i>}
                {c}
              </span>
            ))}
          </div>
        )}
        <h2 className="k-title">{p.title}</h2>
        {p.pills && <div className="k-pills">{p.pills}</div>}
      </div>
      {p.actions && <div className="k-actions">{p.actions}</div>}
    </div>
  );
}

// 상태 알약: 점 + 글자. ghost는 점 없는 테두리형(속성 표시)
export function Pill({ tone = 'ok', color, ghost, children, title }: { tone?: Tone; color?: string; ghost?: boolean; children: ReactNode; title?: string }) {
  const c = color ?? TONE_VAR[tone];
  return (
    <span className={`k-pill${ghost ? ' ghost' : ''}`} style={{ '--c': c } as CSSProperties} title={title}>
      {children}
    </span>
  );
}

// 상태 글자: 아이콘 + 글자 (정상 · 주의 · 위험)
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className="k-status" style={{ '--c': TONE_VAR[tone] } as CSSProperties}>
      <Icon size={12} strokeWidth={2.5} />
      {children}
    </span>
  );
}

// 가로 막대: 값(0~1) + 기준선
export function Meter({ v, mark, markLabel, color, size = 'sm' }: { v: number; mark?: number; markLabel?: string; color?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`k-meter ${size}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <i style={{ width: `${clamp01(v) * 100}%`, background: color }} />
      {mark != null && <em style={{ left: `${clamp01(mark) * 100}%` }} title={markLabel} />}
    </div>
  );
}

// 핵심 수치 타일: 이름 · 큰 숫자 + 단위 · 막대 · 보조 글
export function Kpi(p: { label: ReactNode; value: ReactNode; unit?: string; sub?: ReactNode; meter?: { v: number; mark?: number; markLabel?: string; color?: string }; tone?: Tone }) {
  return (
    <div className="k-kpi">
      <div className="k-kpi-label">{p.label}</div>
      <div className="k-kpi-value num" style={p.tone ? { color: TONE_VAR[p.tone] } : undefined}>
        {p.value}
        {p.unit && <small>{p.unit}</small>}
      </div>
      {p.meter && <Meter {...p.meter} />}
      {p.sub && <div className="k-kpi-sub num">{p.sub}</div>}
    </div>
  );
}

export function KpiRow({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`k-kpis c${cols}`}>{children}</div>;
}

// 접는 섹션. 열림 상태는 제목별로 기억해서 다른 장비를 골라도 유지한다
const openMemo = new Map<string, boolean>();

export function Section(p: { id?: string; title: ReactNode; count?: ReactNode; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const key = p.id ?? String(p.title);
  const [open, setOpen] = useState(() => openMemo.get(key) ?? p.defaultOpen ?? true);
  const toggle = () => {
    openMemo.set(key, !open);
    setOpen(!open);
  };
  return (
    <div className={`k-sect${open ? '' : ' closed'}`}>
      <div className="k-sect-h">
        <button className="k-sect-toggle" aria-expanded={open} onClick={toggle}>
          <span className="k-sect-title">{p.title}</span>
          {p.count != null && <span className="k-sect-count num">{p.count}</span>}
          <span className="grow" />
          <ChevronDown className="k-chev" size={14} />
        </button>
        {p.aside && <span className="k-sect-aside">{p.aside}</span>}
      </div>
      {open && <div className="k-sect-body">{p.children}</div>}
    </div>
  );
}

// 속성 칸: 2열 이름-값 (wide는 한 줄 전체)
export function Props({ items }: { items: { k: ReactNode; v: ReactNode; wide?: boolean }[] }) {
  // 좁은 칸이 홀수면 마지막 좁은 칸을 넓혀 빈 칸이 생기지 않게 한다 (나머지 빈틈은 grid dense가 메움)
  const narrow = items.map((it, i) => (it.wide ? -1 : i)).filter((i) => i >= 0);
  const lastOdd = narrow.length % 2 === 1 ? narrow[narrow.length - 1] : -1;
  return (
    <dl className="k-props">
      {items.map((it, i) => (
        <div key={i} className={it.wide || i === lastOdd ? 'wide' : ''}>
          <dt>{it.k}</dt>
          <dd>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

// 알아보기 상자: 학습용 설명을 실제 값과 다른 모양으로. 길면 세 줄까지만 보이고 펼친다
export function LearnBox({ title, children, long }: { title: string; children: ReactNode; long?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`k-learn${long && !open ? ' clamp' : ''}`}>
      <BookOpen size={16} />
      <div>
        <b>{title}</b>
        <div className="k-learn-body">{children}</div>
        {long && (
          <button className="k-learn-more" onClick={() => setOpen(!open)}>
            {open ? '접기' : '더 읽기'}
          </button>
        )}
      </div>
    </div>
  );
}

// 제목 옆 ? 아이콘: 마우스를 올리거나 초점을 주면 설명. 패널 스크롤에 잘리지 않게 화면 기준(fixed)으로 띄운다
export function Help({ text }: { text: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = 260;
    setPos({ x: Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)), y: r.bottom + 6 });
  };
  return (
    <span
      className="k-help"
      tabIndex={0}
      aria-label="설명"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setPos(null)}
    >
      <CircleHelp size={13} />
      {pos && (
        <span className="k-tip" role="tooltip" style={{ left: pos.x, top: pos.y }}>
          {text}
        </span>
      )}
    </span>
  );
}

// 켜기 · 끄기 스위치 (체크박스 대신). 왼쪽에 색 점이나 선 견본을 붙일 수 있다
export function Switch(p: { checked: boolean; onChange: () => void; label: ReactNode; swatch?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`k-switch${p.disabled ? ' disabled' : ''}`}>
      {p.swatch}
      <span className="k-switch-label">{p.label}</span>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={p.onChange} />
      <span className="k-switch-track" aria-hidden />
    </label>
  );
}
