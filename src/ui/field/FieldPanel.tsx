// 현장 모드 길 안내 패널 (가로: 오른쪽, 세로: 아래).
//   고른 것이 없을 때: 찾을 장비 · 랙을 고르는 안내 + 검색 · [주의] 목록 바로가기
//   고른 것이 있을 때: 그 장비 · 랙 정보 카드 (도착해서 그 자리에서 보는 정보)
//   길 안내(경로 · 단계 · 이전 / 다음)는 경로 데이터가 생기면 이 패널에 붙는다 (문서 §15 S10 · S11)

import { Search, X } from 'lucide-react';
import { nodeInfo } from '../../data/graph';
import { useView } from '../../store/useView';
import { AlertPanel } from '../AlertPanel';
import { InfoBody } from '../InfoPanel';

export function FieldPanel({ onSearch }: { onSearch: () => void }) {
  const id = useView((s) => s.selectedId);
  const groupId = useView((s) => s.groupId);
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
