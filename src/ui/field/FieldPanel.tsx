// 현장 모드 길 안내 패널 (가로: 오른쪽, 세로: 아래).
//   고른 것이 없을 때: 찾을 장비 · 랙을 고르는 안내 + 검색 · [주의] 목록 바로가기
//   고른 것이 있을 때: 목적지 정보 카드 + [여기로 길 안내]
//   길 안내 중: 목적지 · 거리, 단계 목록(지금 단계 강조, 누르면 그 단계로), 아래 엄지 자리에 [이전] [다음]
//   도착하면 그 자리 정보 카드와 '전원 · 냉기 따라가기'(이 장비에 보내는 곳을 다음 목적지로)

import { ArrowLeft, ArrowRight, Check, Navigation, Search, X } from 'lucide-react';
import { nodeInfo, nodeName } from '../../data/graph';
import { KIND_META, type ConnKind } from '../../data/connections';
import { placeOf, upstreamOf } from '../../data/route';
import { focusFloor } from '../../scene/focus';
import { useView } from '../../store/useView';
import { AlertPanel } from '../AlertPanel';
import { InfoBody } from '../InfoPanel';
import { reaim, showStep, startGuide, stopGuide, useGuide } from './guide';
import { PickHere } from './PickHere';

export function FieldPanel({ onSearch }: { onSearch: () => void }) {
  const id = useView((s) => s.selectedId);
  const groupId = useView((s) => s.groupId);
  const g = useGuide();
  const pick = useView((s) => s.fieldPick);
  if (pick) return <PickHere />;
  if (g) return <GuidePanel />;
  const picked = id ?? groupId;
  return (
    <aside className="panel field-panel">
      {picked ? (
        <>
          <div className="fp-head">
            <span>목적지</span>
            <b>{id ? (nodeInfo(id)?.name ?? id) : '계통 묶음'}</b>
            <button className="fp-clear" onClick={() => useView.getState().select(null)} aria-label="목적지 지우기">
              <X size={18} />
            </button>
          </div>
          <div className="fp-body">
            {id && placeOf(id) && (
              <div className="fp-go">
                <button className="primary" onClick={() => startGuide(id)}>
                  <Navigation size={18} /> 여기로 길 안내
                </button>
              </div>
            )}
            <InfoBody id={id} groupId={groupId} />
          </div>
        </>
      ) : (
        <div className="fp-body">
          <div className="fp-empty">
            <b>찾을 장비 · 랙을 고르세요</b>
            <p>장비 이름 · 랙 번호(예: A-3-07) · 고객사로 찾거나, 아래 주의 목록에서 고릅니다. 3D에서 장비를 눌러도 됩니다.</p>
            <button className="fp-search" onClick={onSearch}>
              <Search size={18} /> 장비 · 랙 찾기
            </button>
          </div>
          <AlertPanel />
        </div>
      )}
    </aside>
  );
}

function GuidePanel() {
  const g = useGuide()!;
  const { route: r, step } = g;
  const last = step === r.steps.length - 1;
  const end = () => {
    stopGuide();
    if (!reaim()) focusFloor(useView.getState().floorFocus ?? r.to.floor);
  };
  return (
    <aside className="panel field-panel guiding">
      <div className="fp-head">
        <span>목적지</span>
        <b>{r.to.name}</b>
        <span className="fp-dist num">
          {r.to.floor} · 약 {r.length}m
        </span>
        <button className="fp-clear" onClick={end} aria-label="길 안내 끝내기">
          <X size={18} />
        </button>
      </div>
      <div className="fp-body">
        <ol className="fp-steps">
          {r.steps.map((st, i) => (
            <li key={i} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button onClick={() => showStep(i)}>
                <span className="fp-n num">{i < step ? <Check size={14} /> : i + 1}</span>
                <span>{st.text}</span>
              </button>
            </li>
          ))}
        </ol>
        {last && <Arrival id={r.to.id} />}
      </div>
      <div className="fp-nav">
        <button onClick={() => showStep(step - 1)} disabled={step === 0}>
          <ArrowLeft size={20} /> 이전
        </button>
        {last ? (
          <button className="primary" onClick={end}>
            <Check size={20} /> 안내 끝내기
          </button>
        ) : (
          <button className="primary" onClick={() => showStep(step + 1)}>
            다음 <ArrowRight size={20} />
          </button>
        )}
      </div>
    </aside>
  );
}

// 도착: 그 자리 정보 카드 + 이 장비 · 랙에 전원 · 냉기를 보내는 곳으로 이어 가기
function Arrival({ id }: { id: string }) {
  const ups = upstreamOf(id);
  return (
    <div className="fp-arrive">
      <h4>도착 · {nodeName(id)}</h4>
      {ups.length > 0 && (
        <div className="fp-follow">
          <span>이어서 따라가기</span>
          {ups.map((u) => {
            const meta = KIND_META[u.kind as ConnKind];
            return (
              <button key={u.id} onClick={() => continueTo(u.id)} style={{ borderColor: meta?.color }}>
                <i style={{ background: meta?.color }} />
                {meta?.name ?? '연결'}
                {u.sys && !meta?.name.endsWith(u.sys) ? ` ${u.sys}계통` : ''} → <b>{nodeName(u.id)}</b>
              </button>
            );
          })}
        </div>
      )}
      <InfoBody id={id} groupId={null} />
    </div>
  );
}

// 지금 목적지에서 다음 목적지로 새 길 안내
function continueTo(next: string) {
  const s = useView.getState();
  const g = s.fieldGuide;
  if (!g) return;
  s.select(next);
  s.setFieldGuide({ from: g.to, to: next, step: 0 });
  showStep(0);
}
