// 하단 흐름도 패널: 전력 흐름도(단선도) / 공조 흐름도 탭, 크게 보기, 3D 선택 연동

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Route, Scan, X } from 'lucide-react';
import { nodeName } from '../data/graph';
import { startTrace } from '../scene/focus';
import { useView } from '../store/useView';
import { Help, IconButton } from '../ui/kit';
import { FlowDiagram } from './FlowDiagram';
import { DIAGRAMS, diagramOf, type DiagramId } from './model';

const TABS: { id: DiagramId; name: string }[] = [
  { id: 'power', name: '전력 흐름도 (단선도)' },
  { id: 'cooling', name: '공조 흐름도' },
];

const LEGEND: Record<DiagramId, { color: string; text: string; dash?: boolean }[]> = {
  power: [
    { color: '#ff6b6b', text: '특고압 공용' },
    { color: '#3d8bfd', text: 'A계통' },
    { color: '#fd7e14', text: 'B계통' },
    { color: '#be4bdb', text: 'STS' },
    { color: '#a9e34b', text: '발전기', dash: true },
    { color: '#ffe066', text: '직류' },
    { color: '#ced4da', text: '공조 동력' },
  ],
  cooling: [
    { color: '#9775fa', text: '냉매 (액관 · 가스관)' },
    { color: '#22b8cf', text: '냉수 7°C 공급 · 12°C 환수' },
    { color: '#20c997', text: '냉각수 32°C 공급 · 37°C 환수' },
    { color: '#adb5bd', text: '프리쿨링 (대기)', dash: true },
  ],
};

export function DiagramPanel() {
  const mode = useView((s) => s.diagramMode);
  const tab = useView((s) => s.diagramTab);
  const selectedId = useView((s) => s.selectedId);
  const traced = useView((s) => s.traced);
  const [fitKey, setFitKey] = useState(0);

  // 3D에서 고른 장비가 다른 흐름도에만 있으면 탭 전환. 선택이 바뀔 때만 따지고,
  // 사용자가 직접 탭을 바꾼 것은 되돌리지 않는다.
  const lastSel = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === lastSel.current) return;
    lastSel.current = selectedId;
    if (!selectedId) return;
    const cur = useView.getState().diagramTab;
    const here = DIAGRAMS[cur].nodes.some((n) => n.ref === selectedId || (!n.ref && n.type !== 'mech' && n.members.includes(selectedId)));
    const where = diagramOf(selectedId);
    if (!here && where) useView.getState().setDiagramTab(where);
  }, [selectedId]);

  if (mode === 'off') return null;
  const set = useView.getState().setDiagramMode;
  return (
    <section className={`diagram-panel ${mode}`}>
      <header>
        <div className="dp-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => useView.getState().setDiagramTab(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="legend small">
          {LEGEND[tab].map((l) => (
            <span key={l.text}>
              <i style={{ background: l.dash ? `repeating-linear-gradient(90deg, ${l.color} 0 4px, transparent 4px 7px)` : l.color }} /> {l.text}
            </span>
          ))}
        </div>
        <div className="spacer" />
        {traced && (
          <span className="trace-chip">
            <Route size={13} />
            추적 중 · {nodeName(traced.origin)}
            <button className="small" onClick={() => startTrace(null)}>
              끄기
            </button>
          </span>
        )}
        <Help text="휠: 확대/축소 · 드래그: 이동 · 장비 클릭: 3D에서 그 장비로 이동 · 굵은 선: 선택 장비의 연결" />
        <IconButton icon={Scan} label="흐름도를 화면에 맞춤" onClick={() => setFitKey((k) => k + 1)} />
        <IconButton icon={mode === 'full' ? Minimize2 : Maximize2} label={mode === 'full' ? '3D 같이 보기' : '크게 보기'} onClick={() => set(mode === 'full' ? 'half' : 'full')} />
        <IconButton icon={X} label="흐름도 닫기" onClick={() => set('off')} />
      </header>
      <FlowDiagram key={tab} id={tab} fitKey={fitKey} compact={mode === 'half'} />
    </section>
  );
}
