import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowUpDown, Building2, Crosshair, Network, X } from 'lucide-react';
import { FLOOR_BY_ID, FLOORS, ROOM_BY_ID, SERVER_ROOMS, SHAFTS, SR_BY_LABEL, roomOfId } from '../data/building';
import { EQUIP_BY_ID, EQUIPMENT, type Equip } from '../data/equipment';
import { DOMAIN_META, EQUIP_TYPES, TYPE_BY_ID, type Domain } from '../data/equipTypes';
import { RACK_BY_ID, RACKS, type DeviceKind, type Rack } from '../data/racks';
import { BLOCK_NAME, EXPANSION_BLOCK, RACK } from '../data/building';
import { CIRCUIT, CUSTOMER_BY_ID, type CustomerId } from '../data/customers';
import { CustomerCard } from './CustomerCard';
import { CustomerAlert } from './CustomerSummary';
import { AlertPanel, useAlerts } from './AlertPanel';
import { HUB_BY_ID, type Hub } from '../data/connections';
import { focusItem, goFloor } from '../scene/focus';
import { useView, type RightTab } from '../store/useView';
import { SupplyBody, ThermalSheet } from './ThermalPanel';
import { FloorPlan } from '../diagram/FloorPlan';
import { ConnSection, GroupsSection, ShaftLinks } from './ConnPanel';
import { GroupCard } from './GroupCard';
import { MetricsPanel } from './MetricsPanel';
import { ScenarioPanel } from '../scenario/ScenarioPanel';
import { rackKw } from '../data/thermal';
import { incoming, nodeName, outgoing } from '../data/graph';
import { RackTempSection, SensorTemps, TEMP_TONE, UnitTemps } from './ThermInfo';
import { Card, DOMAIN_ICON, Glyph, IconButton, Kpi, KpiRow, LearnBox, PanelHead, Pill, Props, Section } from './kit';
import { useMetrics, useNodeStatus, useRoomTherm } from './useStatus';
import { BAT_KWH, values } from '../scenario/outage';
import { values as upsFailValues } from '../scenario/upsFail';
import { upsLoad } from '../data/metrics';

// inSheet: 휴대폰 바텀 시트 안에 담을 때 (오른쪽 칸 · 겹쳐 띄우기 배치를 쓰지 않는다).
//   온도 보기 중에는 시트 탭을 온도 · 급기 · 수치 · 2D 상면도 · 정보 · 시나리오로 바꾼다 (PC의 온도 카드 · 급기 카드 · 하단 도면 자리)
export function InfoPanel({ inSheet = false }: { inSheet?: boolean }) {
  const id = useView((s) => s.selectedId);
  const groupId = useView((s) => s.groupId);
  const tab = useView((s) => s.rightTab);
  const thermal = useView((s) => s.airOn || s.heatOn);
  const alerts = useAlerts();
  const alertN = alerts.length;
  const alertTone = alerts.some((a) => a.tone === 'crit') ? 'crit' : 'warn';
  const therm = inSheet && thermal;
  // 장비 · 묶음을 새로 고르면 정보 탭으로
  useEffect(() => {
    if (id || groupId) useView.getState().setRightTab('info');
  }, [id, groupId]);
  // 시트: 온도 보기를 켜면 [온도] 탭(고른 장비가 있으면 정보), 끄면 온도용 탭에 있던 것을 정보로
  // (PC 오른쪽 패널에는 온도용 탭이 없으므로 휴대폰에서 창을 넓혀 온 경우 정보로)
  useEffect(() => {
    const v = useView.getState();
    const thermTab = v.rightTab === 'temp' || v.rightTab === 'supply' || v.rightTab === 'plan';
    if (inSheet && thermal) v.setRightTab(v.selectedId ? 'info' : 'temp');
    else if (thermTab) v.setRightTab('info');
  }, [inSheet, thermal]);
  const tabs: { id: RightTab; name: ReactNode }[] = therm
    ? [
        { id: 'temp', name: '온도' },
        { id: 'supply', name: '급기 · 수치' },
        { id: 'plan', name: '2D 상면도' },
        { id: 'info', name: '정보' },
        { id: 'scenario', name: '시나리오' },
      ]
    : [
        { id: 'info', name: '정보' },
        { id: 'metrics', name: '지표 · 용량' },
        {
          id: 'alerts',
          name: (
            <>
              주의
              {alertN > 0 && <span className={`rt-badge ${alertTone}`}>{alertN}</span>}
            </>
          ),
        },
        { id: 'scenario', name: '시나리오' },
      ];
  return (
    <aside className={inSheet ? `panel sheet-panel${therm && tab === 'plan' ? ' tab-plan' : ''}` : 'panel right'}>
      <div className="right-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => useView.getState().setRightTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      {tab === 'metrics' ? (
        <MetricsPanel />
      ) : tab === 'scenario' ? (
        <ScenarioPanel />
      ) : tab === 'alerts' ? (
        <AlertPanel />
      ) : therm && tab === 'temp' ? (
        <ThermalSheet />
      ) : therm && tab === 'supply' ? (
        <SupplyBody open />
      ) : therm && tab === 'plan' ? (
        <div className="sheet-plan">
          <FloorPlan fitKey={0} compact keepView />
        </div>
      ) : (
        <InfoBody id={id} groupId={groupId} />
      )}
    </aside>
  );
}

export function InfoBody({ id, groupId }: { id: string | null; groupId: string | null }) {
  return (
    <>
      {!id && groupId && <GroupCard id={groupId} />}
      {!id && !groupId && <Overview />}
      {id && id.startsWith('rack:') && <RackCard rack={RACK_BY_ID[id.slice(5)]} />}
      {id && id.startsWith('customer:') && <CustomerCard id={id.slice(9) as CustomerId} />}
      {id && id.startsWith('shaft:') && <ShaftCard id={id.slice(6)} />}
      {id && HUB_BY_ID[id] && <HubCard h={HUB_BY_ID[id]} />}
      {id && EQUIP_BY_ID[id] && <EquipCard e={EQUIP_BY_ID[id]} />}
    </>
  );
}

function HeadActions({ focusId }: { focusId?: string }) {
  return (
    <>
      {focusId && <IconButton icon={Crosshair} label="카메라 이동" onClick={() => focusItem(focusId)} />}
      <IconButton icon={X} label="닫기" onClick={() => useView.getState().select(null)} />
    </>
  );
}

// 운전 상태 알약 (평상시 · 시나리오)
function StatusPill({ id }: { id: string }) {
  const st = useNodeStatus(id);
  if (!st) return null;
  return (
    <Pill tone={st.tone} color={st.color} title={st.scen ? '시나리오 재생 중 상태' : '평상시 상태'}>
      {st.label}
    </Pill>
  );
}

const systemColor = (s: string) => (s.startsWith('A') ? 'var(--a)' : s.startsWith('B') ? 'var(--b)' : 'var(--ink-2)');
const f0 = (v: number) => Math.round(v).toLocaleString('ko-KR');
const pctText = (v: number) => `${Math.round(v * 100)}%`;

function EquipCard({ e }: { e: Equip }) {
  const t = TYPE_BY_ID[e.type];
  const floor = FLOOR_BY_ID[e.floor];
  const room = ROOM_BY_ID[e.room];
  const siblings = EQUIPMENT.filter((x) => x.type === e.type);
  const dm = DOMAIN_META[t.domain];
  return (
    <Card
      head={
        <PanelHead
          glyph={<Glyph icon={DOMAIN_ICON[t.domain]} color={dm.color} />}
          crumb={[floor.id, room?.name ?? floor.name, `${t.code} ${t.name}`]}
          title={e.name}
          pills={
            <>
              <StatusPill id={e.id} />
              {e.system && (
                <Pill ghost color={systemColor(e.system)}>
                  {e.system}
                </Pill>
              )}
            </>
          }
          actions={<HeadActions focusId={e.id} />}
        />
      }
    >
      <EquipKpis e={e} />
      {e.type === 'sensor' && <SensorTemps sensorId={e.id} />}
      {(e.type === 'crac' || e.type === 'crah' || e.type === 'cracFront') && <UnitTemps room={roomOfId(e.room)} />}
      <p className="role">{t.role}</p>
      {t.domain === 'fire' && <FireFlow current={e.id} />}
      <ConnSection id={e.id} />
      <Section id="specs" title="성능 포인트" count={e.specs.length}>
        <Props items={e.specs.map(([k, v]) => ({ k, v, wide: v.length > 14 }))} />
      </Section>
      {t.detail.length > 0 && (
        <LearnBox title={`알아보기 · ${t.name}`} long={t.detail.join('').length > 90}>
          {t.detail.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </LearnBox>
      )}
      <GroupsSection id={e.id} />
      {siblings.length > 1 && (
        <Section id="siblings" title="같은 유형 장비" count={siblings.length} defaultOpen={false}>
          <div className="siblings">
            {siblings.map((s) => (
              <button key={s.id} className={s.id === e.id ? 'on' : ''} onClick={() => focusItem(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </Section>
      )}
    </Card>
  );
}

// 장비 유형별 핵심 수치. 지표 모델 · 시나리오 값에서 바로 가져온다
const GEN_KW = 2000;

function EquipKpis({ e }: { e: Equip }) {
  const m = useMetrics();
  const itLoad = useView((s) => s.itLoad);
  const sc = useView((s) => s.scenario);
  const soc: Record<string, number> = sc?.id === 'outage' || sc?.id === 'lineOut' ? values(sc.t, sc.params, sc.series).soc : {};
  // UPS 고장 시나리오 중에는 그 시각의 UPS 출력으로 다시 계산
  const upsNow = sc?.id === 'upsFail' ? upsFailValues(sc.t, sc.params).load : null;
  // UPS · 배터리 id: ups-a1 / bat-b3 → 계통 · 서버실 번호
  const upsKey = e.id.replace(/^bat/, 'ups');
  const side = (e.id.split('-')[1]?.[0] === 'a' ? 'A' : 'B') as 'A' | 'B';
  const upsRoom = SERVER_ROOMS.find((s) => upsKey.endsWith(String(s.num)))?.label ?? 'A';
  const socOf = soc[upsKey] ?? 1;

  if (e.type === 'ups' || e.type === 'battery') {
    // UPS 고장 시나리오는 그 서버실 UPS 한 쌍만 다시 계산
    const u = upsNow && sc?.id === 'upsFail' && sc.params.room === upsRoom ? upsLoad(upsNow[side]) : m.ups[upsKey];
    const backup = u.out > 0 ? ((socOf * BAT_KWH * 0.95) / u.out) * 60 : 0;
    if (e.type === 'battery')
      return (
        <KpiRow>
          <Kpi label="잔량" value={(socOf * 100).toFixed(socOf < 1 ? 1 : 0)} unit="%" meter={{ v: socOf, color: '#ffe066' }} />
          <Kpi label="백업 시간" value={u.out > 0 ? Math.round(backup) : '—'} unit={u.out > 0 ? '분' : undefined} sub={u.out > 0 ? `${nodeName(upsKey)} ${f0(u.out)}kW 기준` : `${nodeName(upsKey)} 출력 없음`} />
          <Kpi label="용량" value={BAT_KWH} unit="kWh" />
        </KpiRow>
      );
    return (
      <KpiRow>
        <Kpi
          label="출력"
          value={f0(u.out)}
          unit="kW"
          meter={{ v: u.pct, mark: 0.5, markLabel: '2N 권장 상한 50%', color: u.pct > 0.5 ? 'var(--warn)' : 'var(--ok)' }}
          sub={`부하율 ${pctText(u.pct)}`}
        />
        <Kpi label="효율" value={u.out > 0 ? (u.eff * 100).toFixed(1) : '—'} unit={u.out > 0 ? '%' : undefined} sub={`손실 ${f0(u.loss)}kW`} />
        <Kpi label="배터리" value={Math.round(socOf * 100)} unit="%" sub={u.out > 0 ? `약 ${Math.round(backup)}분 버팀` : '출력 없음'} />
      </KpiRow>
    );
  }
  if (e.type === 'generator') {
    return (
      <KpiRow>
        <Kpi label="정격 출력" value={f0(GEN_KW)} unit="kW" />
        <Kpi label="정전 시 부하" value={f0(m.total)} unit="kW" meter={{ v: m.total / GEN_KW, color: m.total > GEN_KW ? 'var(--crit)' : 'var(--ok)' }} sub="시설 전체" />
        <Kpi label="부하율" value={pctText(m.total / (3 * GEN_KW))} sub={`2대만 돌면 ${pctText(m.total / (2 * GEN_KW))}`} />
      </KpiRow>
    );
  }
  if (e.type === 'pdu' || e.type === 'sts') {
    // STS는 랙에 바로 주지 않고 PDU-S를 거치므로 한 단계 더 내려가 담당 랙을 모은다
    const outs = e.type === 'sts' ? outgoing(e.id).flatMap((c) => outgoing(c.to)) : outgoing(e.id);
    const racks = outs.filter((c) => c.to.startsWith('rack:')).map((c) => RACK_BY_ID[c.to.slice(5)]);
    const load = racks.reduce((s, r) => s + rackKw(r, itLoad) * (r.feed === 'AB' ? 0.5 : 1), 0);
    const kva = Number(/(\d+)kVA/.exec(e.specs.find(([k]) => k === '용량')?.[1] ?? '')?.[1] ?? 0);
    const cap = kva * 0.8 * 0.9;
    return (
      <KpiRow>
        <Kpi
          label="부하"
          value={load.toFixed(1)}
          unit="kW"
          meter={cap ? { v: load / cap, color: load > cap ? 'var(--crit)' : 'var(--ok)' } : undefined}
          sub={racks.some((r) => r.feed === 'AB') ? '이중전원 랙은 절반만' : '단일전원 랙 전부'}
        />
        <Kpi label="담당 랙" value={racks.length} unit="대" />
        {kva > 0 ? <Kpi label="용량" value={kva} unit="kVA" sub={`연속 ${f0(cap)}kW`} /> : <Kpi label="절체" value="4~8" unit="ms" />}
      </KpiRow>
    );
  }
  if (e.type === 'chiller') {
    const b = m.rooms.B;
    const ch = b.coolingParts.find((p) => p.key === 'chiller')!;
    return (
      <KpiRow>
        <Kpi label="서버실 B 열부하" value={f0(b.it)} unit="kW" />
        <Kpi label="냉동기 전력" value={f0(ch.kw)} unit="kW" sub="3대 합계" />
        <Kpi label="프리쿨링" value={pctText(b.freeCooling)} sub={b.freeCooling > 0 ? '판형 열교환기' : '외기가 높아 안 함'} />
      </KpiRow>
    );
  }
  return null;
}

// 방재 연동 (얕게): 감지 → 판단 → 방출. 전력 · 공조처럼 연결선으로 그리지 않고 순서만 보여준다
function FireFlow({ current }: { current: string }) {
  const steps: { id: string; name: string; note: string }[] = [
    { id: 'fd-sr-a', name: '화재 감지기', note: '연기·열 감지 (회로 A·B)' },
    { id: 'fire-panel', name: '소화 수신반', note: '교차회로 확인 → 20~30초 지연' },
    { id: 'gas-system', name: '가스 소화설비', note: '선택밸브로 해당 구역에만 방출' },
  ];
  const isDetector = current.startsWith('fd-');
  return (
    <Section
      id="fire-flow"
      title="방재 연동 순서"
      count={steps.length}
      info={
        current.startsWith('leak')
          ? '누수 감지기는 소화와 별개로 통합관제실에 경보만 보냅니다. 아래는 화재 때 감지 → 판단 → 방출 순서입니다.'
          : '화재 때 감지 → 판단 → 방출 순서입니다. 이름을 누르면 그 장비로 이동합니다.'
      }
    >
      <ol className="fire-flow">
        {steps.map((s) => {
          const on = s.id === current || (isDetector && s.id === 'fd-sr-a');
          return (
            <li key={s.id} className={on ? 'on' : ''}>
              <button className="link" onClick={() => focusItem(s.id)}>
                {s.name}
              </button>
              <small>{s.note}</small>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

// 랙 입면 · 범례용 밝은 색 (3D 장비 색은 어두워서 패널에서는 따로 쓴다)
const DEVICE_UI: Record<DeviceKind, { name: string; color: string }> = {
  server: { name: '서버', color: '#4dabf7' },
  storage: { name: '스토리지', color: '#9775fa' },
  gpu: { name: 'GPU 서버', color: '#f06595' },
  network: { name: '네트워크', color: '#20c997' },
  patch: { name: '패치 패널', color: '#868e96' },
};

function RackCard({ rack }: { rack: Rack | undefined }) {
  const itLoad = useView((s) => s.itLoad);
  const room = useRoomTherm(rack?.serverRoom ?? 'A');
  const t = rack ? room.racks[rack.id] : undefined;
  if (!rack) return null;
  const kw = rackKw(rack, itLoad);
  const from = (kind: string) => nodeName(incoming(`rack:${rack.id}`).find((c) => c.kind === kind)?.from ?? '');
  // 단일전원 랙: rPDU ← PDU-S ← STS 순서라 STS 이름은 PDU-S의 입력에서 찾는다
  const pduS = incoming(`rack:${rack.id}`).find((c) => c.kind === 'sts')?.from;
  const stsName = pduS ? nodeName(incoming(pduS).find((c) => c.kind === 'sts')?.from ?? '') : '';
  const maxIn = t && t.kw > 0 ? Math.max(...t.inlet) : null;
  const pw = kw / rack.designKw;
  const cust = rack.customer ? CUSTOMER_BY_ID[rack.customer] : null;
  // 고객사 랙은 계약한 회로 규격, 그 밖에는 단상 7kVA
  const circuit = cust && cust.contract.circuit === '3P32' ? `3상 ${CIRCUIT['3P32'].kva}kVA` : '단상 7kVA';
  return (
    <Card
      head={
        <PanelHead
          glyph={<Glyph icon={DOMAIN_ICON.it} color={DOMAIN_META.it.color} />}
          crumb={[rack.floor, `서버실 ${rack.serverRoom}`, `${rack.row + 1}열 ${rack.index + 1}번`, BLOCK_NAME[rack.block]]}
          title={rack.name}
          pills={
            <>
              <StatusPill id={`rack:${rack.id}`} />
              {cust && (
                <button className="pill-link" title="고객사 정보 보기" onClick={() => useView.getState().select(`customer:${cust.id}`)}>
                  <Pill color={cust.color} title={cust.summary}>
                    {cust.name}
                    {cust.cage ? ' · 케이지' : ''} ›
                  </Pill>
                </button>
              )}
              {!cust && rack.serverRoom === 'B' && rack.block === EXPANSION_BLOCK && rack.devices.length === 0 && (
                <Pill ghost color="var(--ink-3)" title="고객사 임대를 기다리는 빈 랙">
                  임대 대기
                </Pill>
              )}
              <Pill ghost color={rack.feed === 'AB' ? 'var(--ink-2)' : '#be4bdb'}>
                {rack.feed === 'AB' ? '이중전원' : '단일전원 (STS)'}
              </Pill>
              <Pill ghost color="var(--ink-2)" title="앞면(흡기, 밝은 문 · 파란 띠)이 향하는 냉복도. 뒷면(배기 · rPDU, 빨간 띠)은 열복도">
                앞면 {rack.facing > 0 ? '남쪽' : '북쪽'} 냉복도
              </Pill>
            </>
          }
          actions={<HeadActions focusId={`rack:${rack.id}`} />}
        />
      }
    >
      <KpiRow>
        <Kpi
          label="전력"
          value={kw}
          unit={`/${rack.designKw}kW`}
          meter={{ v: pw, color: pw > 1 ? 'var(--crit)' : pw > 0.9 ? 'var(--warn)' : 'var(--ink-2)' }}
          sub={`할당의 ${pctText(pw)}`}
        />
        <Kpi label="공간" value={rack.uUsed} unit={`/${RACK.U}U`} meter={{ v: rack.uUsed / RACK.U }} sub={`빈 칸 ${RACK.U - rack.uUsed}U`} />
        {maxIn != null && t ? (
          <Kpi
            label="최고 흡기"
            value={maxIn}
            unit="°C"
            tone={t.status === 'ok' ? undefined : TEMP_TONE[t.status]}
            meter={{ v: (maxIn - 16) / 24, mark: (27 - 16) / 24, markLabel: '권장 상한 27°C', color: `var(--${TEMP_TONE[t.status]})` }}
            sub="권장 18~27°C"
          />
        ) : (
          <Kpi label="최고 흡기" value="—" sub="발열 없음" />
        )}
      </KpiRow>
      <p className="role">{TYPE_BY_ID.rack.role}</p>
      <Section
        id="rack-elev"
        title="탑재 장비"
        count={`${rack.devices.length}대 · ${RACK.U}U 입면`}
        info="칸에 마우스를 올리면 장비와 U 위치가 나옵니다. 위가 42U, 아래가 1U입니다. IT 장비 상세는 추후 단계에서 다룹니다."
      >
        <RackElevation rack={rack} />
      </Section>
      <Section id="rack-feed" title="급전 (랙 후면 rPDU)">
        <div className="rp-feed">
          {rack.feed === 'AB' ? (
            <>
              <div style={{ borderLeftColor: 'var(--a)' }}>
                <b>rPDU-A</b>
                <small>{from('upsA')} ← UPS-A{SR_BY_LABEL[rack.serverRoom].num}</small>
                <small className="num">{circuit} · {(kw / 2).toFixed(1)}kW</small>
              </div>
              <div style={{ borderLeftColor: 'var(--b)' }}>
                <b>rPDU-B</b>
                <small>{from('upsB')} ← UPS-B{SR_BY_LABEL[rack.serverRoom].num}</small>
                <small className="num">{circuit} · {(kw / 2).toFixed(1)}kW</small>
              </div>
            </>
          ) : (
            <div style={{ borderLeftColor: '#be4bdb' }} className="wide">
              <b>rPDU</b>
              <small>{from('sts')} ← {stsName} ← UPS-A/B 중 택1</small>
              <small className="num">{circuit} · {kw.toFixed(1)}kW</small>
            </div>
          )}
        </div>
      </Section>
      <RackTempSection rackId={rack.id} />
      <ConnSection id={`rack:${rack.id}`} defaultOpen={false} />
      <GroupsSection id={`rack:${rack.id}`} />
    </Card>
  );
}

// 42U 입면: 위가 42U. 칸에 마우스를 올리면 장비 · U 위치
// 랙 입면: 마우스가 가리키는 U를 계산해 그 칸(장비)을 강조하고 범례 아래에 바로 읽어 준다.
// 브라우저 기본 툴팁(title)은 늦게 뜨고 빈 칸은 알려 주지 않아 직접 그린다
function RackElevation({ rack }: { rack: Rack }) {
  const [hoverU, setHoverU] = useState<number | null>(null);
  if (rack.devices.length === 0) return <p className="detail muted">비어 있는 예약 랙입니다 (공간 용량 여유).</p>;
  const counts = rack.devices.reduce<Partial<Record<DeviceKind, { n: number; u: number }>>>((m, d) => {
    const c = m[d.kind] ?? { n: 0, u: 0 };
    m[d.kind] = { n: c.n + 1, u: c.u + d.h };
    return m;
  }, {});
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const y = e.clientY - el.getBoundingClientRect().top - el.clientTop - pad;
    const row = Math.floor((y / (el.clientHeight - pad * 2)) * RACK.U);
    setHoverU(Math.min(RACK.U, Math.max(1, RACK.U - row)));
  };
  const hit = hoverU == null ? null : rack.devices.find((d) => hoverU >= d.u && hoverU < d.u + d.h);
  const uText = (u: number, h: number) => (h > 1 ? `U${u}~${u + h - 1}` : `U${u}`);
  return (
    <div className="rp-rack">
      <div className="rp-elev" style={{ gridTemplateRows: `repeat(${RACK.U}, 1fr)` }} onMouseMove={onMove} onMouseLeave={() => setHoverU(null)}>
        {rack.devices.map((d, i) => (
          <i
            key={i}
            className={hit === d ? 'on' : undefined}
            style={{ gridRow: `${RACK.U + 2 - d.u - d.h} / span ${d.h}`, background: DEVICE_UI[d.kind].color }}
          />
        ))}
        {hoverU != null && !hit && <i className="u-empty" style={{ gridRow: `${RACK.U + 1 - hoverU} / span 1` }} />}
      </div>
      <div className="rp-elev-legend">
        {(Object.keys(DEVICE_UI) as DeviceKind[])
          .filter((k) => counts[k])
          .map((k) => (
            <div key={k} className={hit?.kind === k ? 'on' : undefined}>
              <span className="sw" style={{ background: DEVICE_UI[k].color }} />
              <span className="grow">{DEVICE_UI[k].name}</span>
              <b className="num">{counts[k]!.n}</b>
              <small className="num">{counts[k]!.u}U</small>
            </div>
          ))}
        <div className={hoverU != null && !hit ? 'on' : undefined}>
          <span className="sw empty" />
          <span className="grow">빈 칸</span>
          <b className="num">{RACK.U - rack.uUsed}U</b>
        </div>
        {hoverU != null && (
          <p className="rp-elev-read">
            {hit ? (
              <>
                <span className="sw" style={{ background: DEVICE_UI[hit.kind].color }} />
                <b>{DEVICE_UI[hit.kind].name}</b>
                <span className="num">
                  {uText(hit.u, hit.h)} · {hit.h}U
                </span>
              </>
            ) : (
              <>
                <span className="sw empty" />
                <b>빈 칸</b>
                <span className="num">U{hoverU}</span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function ShaftCard({ id }: { id: string }) {
  const s = SHAFTS.find((k) => k.id === id);
  if (!s) return null;
  return (
    <Card
      head={
        <PanelHead
          glyph={<Glyph icon={ArrowUpDown} color="var(--ink-2)" />}
          crumb={['공간 요소', '수직 샤프트']}
          title={s.name}
          pills={<Pill ghost color="var(--ink-2)">{s.floors.join(' → ')}</Pill>}
          actions={<HeadActions focusId={`shaft:${s.id}`} />}
        />
      }
    >
      <p className="role">{s.summary}</p>
      <Section id="shaft-links" title="지나는 연결">
        <ShaftLinks shaftId={s.id} />
      </Section>
      <LearnBox title="알아보기 · 샤프트">
        <p>샤프트는 장비가 아니라 층을 넘는 연결이 지나가는 통로입니다.</p>
      </LearnBox>
    </Card>
  );
}

function HubCard({ h }: { h: Hub }) {
  const floor = FLOOR_BY_ID[h.floor];
  return (
    <Card
      head={
        <PanelHead
          glyph={<Glyph icon={Network} color={DOMAIN_META[h.domain].color} />}
          crumb={[floor.id, ROOM_BY_ID[h.room]?.name ?? floor.name, '연결 지점']}
          title={h.name}
          pills={<StatusPill id={h.id} />}
          actions={<HeadActions focusId={h.id} />}
        />
      }
    >
      <p className="role">{h.summary}</p>
      <ConnSection id={h.id} />
      <LearnBox title="알아보기 · 연결 지점">
        <p>연결 지점은 성능 포인트가 없어 장비유형으로 세지 않습니다. 여러 장비가 모이는 자리를 보여주기 위해 표시합니다.</p>
      </LearnBox>
    </Card>
  );
}

const LEGEND: [string, string][] = [
  ['#3d8bfd', 'A계통'],
  ['#fd7e14', 'B계통'],
  ['#be4bdb', 'STS (단일전원)'],
  ['#9775fa', '냉매'],
  ['#22b8cf', '냉수'],
  ['#20c997', '냉각수'],
  ['#ff6b6b', '특고압 공용'],
  ['#a9e34b', '발전기'],
  ['#ffe066', '직류(배터리)'],
];

function Overview() {
  const byDomain = (d: Domain) => EQUIP_TYPES.filter((t) => t.domain === d);
  return (
    <Card
      head={<PanelHead glyph={<Glyph icon={Building2} color="var(--ink-2)" />} crumb={['지하 1층 ~ 옥상 · 6개 층']} title="건물 개요" info="층을 누르면 그 층으로 이동하고, 3D에서 장비를 클릭하면 이 자리에 정보가 나옵니다." pills={<Pill ghost color="var(--ink-2)">랙 {RACKS.length}대</Pill>} />}
    >
      <CustomerAlert />
      <Section id="ov-floors" title="층" count={FLOORS.length}>
        <div className="rp-floors">
          {[...FLOORS].reverse().map((f) => (
            <button key={f.id} onClick={() => goFloor(f.id)}>
              <b>{f.id}</b>
              <span>{f.summary}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section id="ov-types" title="장비유형" count={EQUIP_TYPES.length}>
        <div className="rp-types">
          {(['power', 'cooling', 'fire', 'security'] as Domain[]).map((d) => {
            const Icon = DOMAIN_ICON[d];
            return (
              <div key={d}>
                <span className="rp-types-h" style={{ color: DOMAIN_META[d].color }}>
                  <Icon size={14} />
                  {DOMAIN_META[d].name}
                  <small className="num">{byDomain(d).length}</small>
                </span>
                <span className="rp-types-list">{byDomain(d).map((t) => t.name).join(' · ')}</span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section id="ov-legend" title="연결선 색">
        <div className="legend">
          {LEGEND.map(([c, n]) => (
            <span key={n}>
              <i style={{ background: c }} /> {n}
            </span>
          ))}
        </div>
      </Section>
      <LearnBox title="알아보기 · 연결 따라가기">
        <p>장비를 고르면 연결된 선이 굵게 표시됩니다. 정보 카드의 "상류 추적 · 하류 추적"으로 전기와 냉각이 어디서 와서 어디로 가는지 끝까지 따라가 볼 수 있고, 아래 흐름도도 같은 장비를 함께 강조합니다.</p>
      </LearnBox>
    </Card>
  );
}

