// 2D 상면도 (조감도): 기류 · 히트맵을 켜면 하단 패널에 서버실 평면을 위에서 본 모습으로 그린다.
// 바닥에는 고른 높이 단면의 온도 분포(히트맵), 위에는 랙 칸(흡기 · 배기 · ΔT 값과 구간 색)을 올린다.
// 냉복도 · 열복도, 봉쇄 경계, 항온항습기, 온습도 센서, 고객사 케이지를 함께 표시하고 3D 선택과 연동한다.
// 좌표: 세계 x → 화면 오른쪽, 세계 z(남쪽) → 화면 아래. 1 단위 = 1m

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { AISLE_W, BLOCK_LEN, RACK, ROOM_BY_ID } from '../data/building';
import { CUSTOMERS } from '../data/customers';
import { EQUIPMENT } from '../data/equipment';
import { computeHeatField, HEAT_RES, HEIGHT_M, HEIGHT_NAME, heatAlpha, sampleField, type HeatField } from '../data/heatField';
import { RACKS, type Rack } from '../data/racks';
import { AIR_LAYOUT, computeRoom, RECOMMENDED, statusOf, STATUS_META, tempColor, tempRGB, type Containment, type RackTherm, type RoomLabel } from '../data/thermal';
import { rampColor } from '../scene/rackColor';
import { focusItem } from '../scene/focus';
import { useView, type HeatValue } from '../store/useView';
import { InfoTip, TipSwatch, TipTable } from '../ui/kit';
import { useHeatField, useNodeStatus, useRoomTherm } from '../ui/useStatus';

interface ViewT {
  k: number;
  tx: number;
  ty: number;
}
const PAD = 28;
const DT_MAX = 20; // ΔT 색 막대 상한 (K)

const VALUE_NAME: Record<HeatValue, string> = { inlet: '흡기', exhaust: '배기', dT: 'ΔT' };

// 랙 칸에 보여 줄 값
function rackValue(t: RackTherm | undefined, v: HeatValue, h: number) {
  if (!t || t.kw <= 0) return null;
  return v === 'inlet' ? t.inlet[h] : v === 'exhaust' ? t.exhaust[h] : t.dT;
}
// 랙 칸 색: 흡기 · 배기는 온도 색, ΔT는 한 색 밝기
const rackFill = (val: number | null, v: HeatValue) => (val == null ? '#20262e' : v === 'dT' ? rampColor(val / DT_MAX) : tempColor(val));

// 온도 분포를 캔버스에 찍는다 (격자 1칸 = 1픽셀, 화면에서는 부드럽게 늘린다)
function paintField(c: HTMLCanvasElement, f: HeatField, hotOnly: boolean) {
  c.width = f.nx;
  c.height = f.nz;
  const g = c.getContext('2d')!;
  const img = g.createImageData(f.nx, f.nz);
  for (let i = 0; i < f.nx * f.nz; i++) {
    const [r, gg, b] = tempRGB(f.data[i]);
    img.data[i * 4] = r * 255;
    img.data[i * 4 + 1] = gg * 255;
    img.data[i * 4 + 2] = b * 255;
    img.data[i * 4 + 3] = heatAlpha(f.data[i], hotOnly) * 255;
  }
  g.putImageData(img, 0, 0);
}

// 비교 보기 등 SVG 안에 넣을 그림 (PNG 인코딩이라 느리므로 자주 바뀌는 본 화면에는 쓰지 않는다)
function fieldImage(f: HeatField, hotOnly: boolean) {
  const c = document.createElement('canvas');
  paintField(c, f, hotOnly);
  return c.toDataURL();
}

export function FloorPlan({ fitKey, compact }: { fitKey: number; compact: boolean }) {
  const label = useView((s) => s.airRoom);
  const L = AIR_LAYOUT[label];
  const room = ROOM_BY_ID[L.roomId];
  const th = useRoomTherm(label);
  const cfg = useView((s) => s.airCfg[label]);
  const h = useView((s) => s.heatHeight);
  const value = useView((s) => s.heatValue);
  const airOn = useView((s) => s.airOn);
  const selectedId = useView((s) => s.selectedId);
  const hoveredId = useView((s) => s.hoveredId);
  const field = useHeatField(label, true);
  const hotOnly = useView((s) => s.heatHotOnly);
  // 본 화면의 온도 분포는 SVG 아래 캔버스에 바로 찍는다 (시나리오 재생 중 자주 바뀌어 PNG 인코딩을 피한다)
  const fieldCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (field && fieldCanvas.current) paintField(fieldCanvas.current, field, hotOnly);
  }, [field, hotOnly]);
  const racks = useMemo(() => RACKS.filter((r) => r.serverRoom === label), [label]);
  const sensors = useMemo(() => EQUIPMENT.filter((e) => e.type === 'sensor' && e.room === L.roomId), [L.roomId]);
  const cages = useMemo(() => CUSTOMERS.filter((c) => c.room === L.roomId && c.cage), [L.roomId]);
  const [nums, setNums] = useState(true);
  const [hotOpen, setHotOpen] = useState(!compact);
  const [compare, setCompare] = useState(false);

  // 핫스팟: 이 높이 흡기가 권장 상한을 넘는 랙
  const hot = useMemo(
    () =>
      racks
        .map((r) => ({ r, t: th.racks[r.id] }))
        .filter(({ t }) => t && t.kw > 0 && t.inlet[h] > RECOMMENDED[1])
        .sort((a, b) => b.t.inlet[h] - a.t.inlet[h]),
    [racks, th, h],
  );

  // 확대 · 이동 (흐름도와 같은 방식)
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 300 });
  const [view, setView] = useState<ViewT>({ k: 10, tx: 0, ty: 0 });
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const w = room.x[1] - room.x[0];
    const d = room.z[1] - room.z[0];
    const top = 34; // 위쪽 도구 막대 자리
    const k = Math.min((size.w - PAD * 2) / w, (size.h - PAD - top) / d);
    setView({ k, tx: (size.w - w * k) / 2 - room.x[0] * k, ty: top + (size.h - top - PAD - d * k) / 2 - room.z[0] * k });
  }, [label, size.w, size.h, fitKey, room]);

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    setView((v) => {
      const k = Math.min(160, Math.max(4, v.k * Math.exp(-e.deltaY * 0.0015)));
      return { k, tx: px - ((px - v.tx) * k) / v.k, ty: py - ((py - v.ty) * k) / v.k };
    });
  };
  const [hoverPt, setHoverPt] = useState<{ x: number; y: number; wx: number; wz: number } | null>(null);
  const onDown = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    setHoverPt({ x: px, y: py, wx: (px - view.tx) / view.k, wz: (py - view.ty) / view.k });
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    g.moved = true;
    setView((v) => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }));
  };
  const onUp = () => setTimeout(() => (drag.current = null), 0);
  const dragged = () => !!drag.current?.moved;

  // 고른 랙이 화면 밖이면 가운데로
  useEffect(() => {
    const r = selectedId?.startsWith('rack:') ? racks.find((k) => `rack:${k.id}` === selectedId) : null;
    if (!r) return;
    setView((v) => {
      const sx = r.x * v.k + v.tx;
      const sy = r.z * v.k + v.ty;
      if (sx > 30 && sx < size.w - 30 && sy > 40 && sy < size.h - 20) return v;
      return { ...v, tx: size.w / 2 - r.x * v.k, ty: size.h / 2 - r.z * v.k };
    });
  }, [selectedId, racks, size.w, size.h]);

  const k = view.k;
  const px = (n: number) => n / k; // 화면 픽셀 → 세계 단위 (글자 · 선 굵기를 화면 기준으로)
  const showNums = nums && k * RACK.w >= 16;

  const hoverRack = hoveredId?.startsWith('rack:') ? racks.find((r) => `rack:${r.id}` === hoveredId) : undefined;
  const hoverT = hoverPt && field ? sampleField(field, hoverPt.wx, hoverPt.wz) : null;

  return (
    <div className="plan-wrap">
      <div className="plan-tools">
        {/* 서버실 · 단면 높이는 3D의 온도 카드에서 고른다 */}
        <span className="plan-where">
          서버실 {label} · {L.floor} · {HEIGHT_NAME[h]} {HEIGHT_M[h]}m 단면
        </span>
        <div className="seg small" role="group" aria-label="랙 값">
          {(Object.keys(VALUE_NAME) as HeatValue[]).map((v) => (
            <button key={v} className={value === v ? 'on' : ''} onClick={() => useView.getState().setHeatValue(v)}>
              {VALUE_NAME[v]}
            </button>
          ))}
        </div>
        <label className="chk small">
          <input type="checkbox" checked={nums} onChange={(e) => setNums(e.target.checked)} /> 숫자
        </label>
        <button className={`plan-hot-btn${hot.length ? ' warn' : ''}${hotOpen ? ' on' : ''}`} onClick={() => setHotOpen((o) => !o)}>
          핫스팟 {hot.length}
        </button>
        <button className={`plan-hot-btn${compare ? ' on' : ''}`} aria-pressed={compare} onClick={() => setCompare((c) => !c)} title="다른 봉쇄 방식과 온도 분포를 나란히 비교">
          비교
        </button>
      </div>

      <div
        ref={box}
        className="plan-box"
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHoverPt(null)}
        onClick={() => !dragged() && useView.getState().select(null)}
      >
        {/* 방 바닥 + 온도 분포: SVG와 같은 확대 · 이동을 CSS 변환으로 맞춘 캔버스 */}
        <div
          className="plan-floor"
          style={{
            left: view.tx + room.x[0] * k,
            top: view.ty + room.z[0] * k,
            width: (room.x[1] - room.x[0]) * k,
            height: (room.z[1] - room.z[0]) * k,
          }}
        />
        {field && (
          <canvas
            ref={fieldCanvas}
            className="plan-field"
            style={{ transform: `translate(${view.tx + field.x0 * k}px, ${view.ty + field.z0 * k}px) scale(${k * HEAT_RES})` }}
          />
        )}
        <svg width={size.w} height={size.h}>
          <g transform={`translate(${view.tx},${view.ty}) scale(${k})`}>
            <rect className="plan-room edge" x={room.x[0]} y={room.z[0]} width={room.x[1] - room.x[0]} height={room.z[1] - room.z[0]} strokeWidth={px(1.5)} />

            {/* 봉쇄 경계 */}
            {cfg.containment !== 'none' &&
              (cfg.containment === 'CAC' ? L.coldZ : L.hotZ).flatMap((z) =>
                L.blocks.map(([bx0, bx1]) => (
                  <rect
                    key={`${z}|${bx0}`}
                    className={`plan-contain ${cfg.containment}`}
                    x={bx0 - 0.05}
                    y={z - AISLE_W / 2}
                    width={bx1 - bx0 + 0.1}
                    height={AISLE_W}
                    strokeWidth={px(1.5)}
                    strokeDasharray={`${px(5)} ${px(3)}`}
                  />
                )),
              )}

            {/* 고객사 케이지 */}
            {cages.map((c) => (
              <g key={c.id}>
                <rect
                  className="plan-cage"
                  x={c.cage!.x[0]}
                  y={c.cage!.z[0]}
                  width={c.cage!.x[1] - c.cage!.x[0]}
                  height={c.cage!.z[1] - c.cage!.z[0]}
                  stroke={c.color}
                  strokeWidth={px(1.5)}
                  strokeDasharray={`${px(2)} ${px(2)}`}
                />
                <text className="plan-cage-t" x={c.cage!.x[0] + px(4)} y={c.cage!.z[0] - px(4)} fontSize={px(10)} fill={c.color} strokeWidth={px(3)}>
                  {c.name}
                </text>
              </g>
            ))}

            {/* 기류 화살표: 냉복도 → 랙 → 열복도 (기류를 켰을 때) */}
            {airOn && <AirArrows label={label} px={px} />}

            {/* 랙 칸 */}
            {racks.map((r) => {
              const t = th.racks[r.id];
              const val = rackValue(t, value, h);
              const id = `rack:${r.id}`;
              const sel = selectedId === id;
              const hov = hoveredId === id;
              return (
                <g
                  key={r.id}
                  className="plan-rack"
                  onPointerEnter={() => useView.getState().hover(id)}
                  onPointerLeave={() => useView.getState().hoveredId === id && useView.getState().hover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!dragged()) useView.getState().select(id);
                  }}
                  // 더블클릭: 3D 카메라를 그 랙으로
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    focusItem(id);
                  }}
                >
                  <rect
                    x={r.x - RACK.w / 2 + 0.02}
                    y={r.z - RACK.d / 2}
                    width={RACK.w - 0.04}
                    height={RACK.d}
                    fill={rackFill(val, value)}
                    stroke={sel ? '#ffd43b' : hov ? '#e9ecef' : '#0d1117'}
                    strokeWidth={px(sel || hov ? 2 : 0.8)}
                  />
                  {/* 앞면(흡기) 표시 */}
                  <line
                    x1={r.x - RACK.w / 2 + 0.06}
                    x2={r.x + RACK.w / 2 - 0.06}
                    y1={r.z + (r.facing * RACK.d) / 2 - r.facing * 0.06}
                    y2={r.z + (r.facing * RACK.d) / 2 - r.facing * 0.06}
                    stroke="rgba(13,17,23,0.75)"
                    strokeWidth={px(2)}
                  />
                  {showNums && val != null && (
                    <text className="plan-num" x={r.x} y={r.z + px(4)} fontSize={px(Math.min(11, k * 0.26))}>
                      {Math.round(val)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 항온항습기 */}
            {L.units.map((u, i) => (
              <Unit key={u.id} id={u.id} x={u.x} z={u.z} n={i + 1} px={px} supply={cfg.supply} ret={th.returnT} />
            ))}

            {/* 온습도 센서 */}
            {sensors.map((s) => (
              <g key={s.id}>
                <circle className="plan-sensor" cx={s.pos[0]} cy={s.pos[2]} r={px(4)} strokeWidth={px(1.5)} />
              </g>
            ))}

            {/* 통로 이름 */}
            {L.coldZ.map((z) => (
              <text key={`c${z}`} className="plan-aisle cold" x={L.x0 - px(6)} y={z + px(4)} fontSize={px(11)} strokeWidth={px(3)}>
                냉복도
              </text>
            ))}
            {L.hotZ.map((z) => (
              <text key={`h${z}`} className="plan-aisle hot" x={L.x0 - px(6)} y={z + px(4)} fontSize={px(11)} strokeWidth={px(3)}>
                열복도
              </text>
            ))}
          </g>
        </svg>

        {/* 마우스 위치 읽기 */}
        {hoverPt && !drag.current?.moved && (hoverRack || hoverT != null) && (
          <div className="plan-tip num" style={{ left: Math.min(hoverPt.x + 14, size.w - 210), top: Math.max(4, hoverPt.y - 10) }}>
            {hoverRack ? <RackTip r={hoverRack} t={th.racks[hoverRack.id]} h={h} /> : <>
                <b>{hoverT!.toFixed(1)}°C</b> · {HEIGHT_NAME[h]} {HEIGHT_M[h]}m 공기
              </>}
          </div>
        )}

        {hotOpen && !compare && (
          <div className="plan-hot" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className="plan-hot-h">
              핫스팟 · {HEIGHT_NAME[h]} 흡기 {RECOMMENDED[1]}°C 초과
            </div>
            {hot.length === 0 && <p className="hint">이 높이에서 권장 상한을 넘는 랙이 없습니다.</p>}
            {hot.slice(0, 12).map(({ r, t }) => (
              <button key={r.id} className={selectedId === `rack:${r.id}` ? 'on' : ''} onClick={() => focusItem(`rack:${r.id}`)}>
                <i style={{ background: tempColor(t.inlet[h]) }} />
                <span>{r.id}</span>
                <b className="num">{t.inlet[h].toFixed(1)}°</b>
              </button>
            ))}
            {hot.length > 12 && <p className="hint">외 {hot.length - 12}대</p>}
          </div>
        )}

        {!compare && <PlanLegend value={value} />}
        {compare && field && <ComparePlans label={label} h={h} value={value} th={th} field={field} />}
      </div>
    </div>
  );
}

// ── 비교 보기: 지금 봉쇄 방식 | 다른 봉쇄 방식. 같은 높이 · 같은 운전 조건으로 계산해 나란히 ──
const CONT_NAME: Record<Containment, string> = { none: '봉쇄 없음', CAC: '냉복도 봉쇄 (CAC)', HAC: '열복도 봉쇄 (HAC)' };

function ComparePlans({ label, h, value, th, field }: { label: RoomLabel; h: number; value: HeatValue; th: ReturnType<typeof useRoomTherm>; field: HeatField }) {
  const cfg = useView((s) => s.airCfg[label]);
  const itLoad = useView((s) => s.itLoad);
  const others = (Object.keys(CONT_NAME) as Containment[]).filter((c) => c !== cfg.containment);
  const [alt, setAlt] = useState<Containment>(others[0]);
  const altC = others.includes(alt) ? alt : others[0];
  const b = useMemo(() => {
    const c2 = { ...cfg, containment: altC };
    const th2 = computeRoom(label, c2, itLoad);
    return { th: th2, field: computeHeatField(label, c2, th2, h) };
  }, [cfg, altC, label, itLoad, h]);
  return (
    <div className="cmp" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <MiniPlan label={label} h={h} value={value} th={th} field={field} head={<b>지금 · {CONT_NAME[cfg.containment]}</b>} />
      <MiniPlan
        label={label}
        h={h}
        value={value}
        th={b.th}
        field={b.field}
        head={
          <>
            <b>비교</b>
            <div className="seg small">
              {others.map((c) => (
                <button key={c} className={altC === c ? 'on' : ''} onClick={() => setAlt(c)}>
                  {CONT_NAME[c]}
                </button>
              ))}
            </div>
          </>
        }
        base={th}
      />
    </div>
  );
}

function MiniPlan({
  label,
  h,
  value,
  th,
  field,
  head,
  base,
}: {
  label: RoomLabel;
  h: number;
  value: HeatValue;
  th: ReturnType<typeof useRoomTherm>;
  field: HeatField;
  head: ReactNode;
  base?: ReturnType<typeof useRoomTherm>;
}) {
  const L = AIR_LAYOUT[label];
  const room = ROOM_BY_ID[L.roomId];
  const img = useMemo(() => fieldImage(field, false), [field]);
  const racks = useMemo(() => RACKS.filter((r) => r.serverRoom === label), [label]);
  const over = racks.filter((r) => {
    const t = th.racks[r.id];
    return t && t.kw > 0 && t.inlet[h] > RECOMMENDED[1];
  }).length;
  const maxIn = Math.max(...racks.map((r) => (th.racks[r.id]?.kw ? th.racks[r.id].inlet[h] : 0)));
  // 비교 쪽은 지금 대비 차이를 함께
  const diff = (v: number, b: number | undefined, unit: string, better: 'low' | 'high') => {
    if (b == null) return null;
    const d = +(v - b).toFixed(1);
    if (d === 0) return <small className="cmp-d">같음</small>;
    const good = better === 'low' ? d < 0 : d > 0;
    return <small className={`cmp-d ${good ? 'good' : 'bad'}`}>{`${d > 0 ? '+' : ''}${d}${unit}`}</small>;
  };
  const baseMax = base ? Math.max(...racks.map((r) => (base.racks[r.id]?.kw ? base.racks[r.id].inlet[h] : 0))) : undefined;
  const baseOver = base
    ? racks.filter((r) => {
        const t = base.racks[r.id];
        return t && t.kw > 0 && t.inlet[h] > RECOMMENDED[1];
      }).length
    : undefined;
  return (
    <div className="cmp-col">
      <div className="cmp-head">{head}</div>
      <svg viewBox={`${room.x[0]} ${room.z[0]} ${room.x[1] - room.x[0]} ${room.z[1] - room.z[0]}`} preserveAspectRatio="xMidYMid meet">
        <rect className="plan-room" x={room.x[0]} y={room.z[0]} width={room.x[1] - room.x[0]} height={room.z[1] - room.z[0]} strokeWidth={0.08} />
        <image href={img} x={field.x0} y={field.z0} width={field.nx * HEAT_RES} height={field.nz * HEAT_RES} preserveAspectRatio="none" opacity={0.9} />
        {racks.map((r) => {
          const val = rackValue(th.racks[r.id], value, h);
          return (
            <rect
              key={r.id}
              x={r.x - RACK.w / 2 + 0.02}
              y={r.z - RACK.d / 2}
              width={RACK.w - 0.04}
              height={RACK.d}
              fill={rackFill(val, value)}
              stroke="#0d1117"
              strokeWidth={0.04}
            />
          );
        })}
      </svg>
      <div className="cmp-stats num">
        <span>
          최고 흡기 <b style={{ color: tempColor(maxIn) }}>{maxIn.toFixed(1)}°C</b> {diff(maxIn, baseMax, '°C', 'low')}
        </span>
        <span>
          권장 초과 <b>{over}대</b> {diff(over, baseOver, '대', 'low')}
        </span>
        <span>
          환기 <b>{th.returnT}°C</b> {diff(th.returnT, base?.returnT, '°C', 'high')}
        </span>
      </div>
    </div>
  );
}

function RackTip({ r, t, h }: { r: Rack; t: RackTherm | undefined; h: number }) {
  if (!t || t.kw <= 0)
    return (
      <>
        <b>{r.id}</b> · 장비 없음 (발열 없음)
      </>
    );
  const st = statusOf(t.inlet[h]);
  return (
    <>
      <b>{r.id}</b> · {t.kw}kW · ΔT {t.dT.toFixed(1)}K
      <div className="plan-tip-grid">
        <span />
        <span>하</span>
        <span>중</span>
        <span>상</span>
        <span>흡기</span>
        {t.inlet.map((v, i) => (
          <span key={i} style={{ color: tempColor(v), fontWeight: i === h ? 700 : 400 }}>
            {v.toFixed(1)}
          </span>
        ))}
        <span>배기</span>
        {t.exhaust.map((v, i) => (
          <span key={i} style={{ color: tempColor(v), fontWeight: i === h ? 700 : 400 }}>
            {v.toFixed(1)}
          </span>
        ))}
      </div>
      <span style={{ color: STATUS_META[st].color }}>{STATUS_META[st].name}</span>
    </>
  );
}

// 항온항습기: 상태(시나리오 고장이면 ✕) · 급기 / 환기 온도
function Unit({ id, x, z, n, px, supply, ret }: { id: string; x: number; z: number; n: number; px: (v: number) => number; supply: number; ret: number }) {
  const st = useNodeStatus(id);
  const e = EQUIPMENT.find((k) => k.id === id)!;
  const turned = e.rotY && Math.abs(Math.sin(e.rotY)) > 0.5;
  const w = turned ? e.size[2] : e.size[0];
  const d = turned ? e.size[0] : e.size[2];
  const down = st && (st.tone === 'crit' || st.label.startsWith('정지'));
  const sel = useView((s) => s.selectedId === id);
  return (
    <g
      className="plan-unit"
      onClick={(ev) => {
        ev.stopPropagation();
        useView.getState().select(id);
      }}
    >
      <rect x={x - w / 2} y={z - d / 2} width={w} height={d} className={down ? 'down' : ''} stroke={sel ? '#ffd43b' : undefined} strokeWidth={px(sel ? 2 : 1)} />
      {down && (
        <path d={`M${x - w / 3},${z - d / 3}L${x + w / 3},${z + d / 3}M${x + w / 3},${z - d / 3}L${x - w / 3},${z + d / 3}`} className="plan-x" strokeWidth={px(2.5)} />
      )}
      <title>{`${e.name} · ${down ? '정지' : `급기 ${supply}°C → 환기 ${ret}°C`}`}</title>
      <text x={x} y={z + px(4)} fontSize={px(10)} className="plan-unit-t">
        {n}
      </text>
      <text x={x} y={z + d / 2 + px(11)} fontSize={px(9)} strokeWidth={px(3)} className={`plan-unit-s${down ? ' down' : ''}`}>
        {down ? '정지' : `${supply}→${Math.round(ret)}°`}
      </text>
    </g>
  );
}

// 블록 · 열마다 화살표 하나: 냉복도 중심 → 랙 앞면(파랑), 랙 뒷면 → 열복도 중심(빨강)
function AirArrows({ label, px }: { label: RoomLabel; px: (v: number) => number }) {
  const L = AIR_LAYOUT[label];
  const rows = useMemo(() => {
    const out: { x: number; z: number; f: 1 | -1 }[] = [];
    const rs = RACKS.filter((r) => r.serverRoom === label);
    for (const row of new Set(rs.map((r) => r.row)))
      for (const [bx0] of L.blocks) {
        const r = rs.find((k) => k.row === row && Math.abs(k.x - (bx0 + BLOCK_LEN / 2 - RACK.w / 2)) < 0.31);
        if (r) out.push({ x: bx0 + BLOCK_LEN / 2, z: r.z, f: r.facing });
      }
    return out;
  }, [label, L.blocks]);
  const head = (x: number, y: number, dir: number, c: string) => (
    <path d={`M${x - px(5)},${y - dir * px(7)}L${x},${y}L${x + px(5)},${y - dir * px(7)}`} fill="none" stroke={c} strokeWidth={px(2)} />
  );
  return (
    <g className="plan-air">
      {rows.map(({ x, z, f }, i) => {
        const front = z + (f * RACK.d) / 2;
        const rear = z - (f * RACK.d) / 2;
        const cold = front + (f * AISLE_W) / 2;
        const hot = rear - f * (AISLE_W / 2 - 0.15); // 마주 오는 화살표와 한가운데서 겹치지 않게
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={cold} y2={front} stroke="#74c0fc" strokeWidth={px(2)} />
            {head(x, front, -f, '#74c0fc')}
            <line x1={x} x2={x} y1={rear} y2={hot} stroke="#ff8787" strokeWidth={px(2)} />
            {head(x, hot, -f, '#ff8787')}
          </g>
        );
      })}
    </g>
  );
}

// 범례: 연속 온도 색 + ASHRAE 경계 눈금 (ΔT 보기면 랙 칸 색 막대도)
function PlanLegend({ value }: { value: HeatValue }) {
  const lo = 15;
  const hi = 40;
  const pos = (t: number) => `${((t - lo) / (hi - lo)) * 100}%`;
  const grad = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => tempColor(lo + ((hi - lo) * i) / 12)).join(', ')})`;
  return (
    <div className="plan-legend" onPointerDown={(e) => e.stopPropagation()}>
      <div className="plan-legend-bar" style={{ background: grad }}>
        {[18, 27, 32].map((t) => (
          <em key={t} style={{ left: pos(t) }} />
        ))}
      </div>
      <div className="plan-legend-t num">
        {[15, 18, 27, 32, 40].map((t) => (
          <span key={t} style={{ left: pos(t) }}>
            {t}
          </span>
        ))}
      </div>
      <div className="plan-legend-n">
        <span>공기 온도 °C</span>
        <InfoTip
          text={
            <>
              <p>권장 18~27°C · 허용 상한 32°C (ASHRAE A1). 판정은 랙 흡기 기준이고, 열복도의 35°C 넘는 값은 정상 배기입니다.</p>
              <TipTable
                head={['기호', '뜻']}
                rows={[
                  [<><TipSwatch color={tempColor(22)} />랙 칸</>, '고른 값(흡기 · 배기 · ΔT)의 색 · 숫자. 어두운 칸은 장비 없는 랙'],
                  [<><TipSwatch color="#0d1117" line />칸 안 어두운 선</>, '랙 앞면 (흡기 쪽)'],
                  [<><TipSwatch color="#e9ecef" />흰 점</>, '온습도 센서'],
                  [<><TipSwatch color="#2b3542" />숫자 칸</>, '항온항습기 (아래 급기 → 환기 °C, 고장이면 ✕)'],
                  [<><TipSwatch color="#74c0fc" line />파란 점선</>, '냉복도 봉쇄 (CAC)'],
                  [<><TipSwatch color="#ff8787" line />빨간 점선</>, '열복도 봉쇄 (HAC)'],
                  [<><TipSwatch color="#f783ac" line />색 점선</>, '고객사 케이지'],
                  [<><TipSwatch color="#74c0fc" line />화살표</>, '기류를 켰을 때 냉복도 → 랙 → 열복도'],
                ]}
              />
            </>
          }
        />
      </div>
      {value === 'dT' && (
        <div className="plan-legend-dt">
          랙 ΔT <i style={{ background: `linear-gradient(90deg, ${rampColor(0)}, ${rampColor(1)})` }} /> 0~{DT_MAX}K
        </div>
      )}
    </div>
  );
}
