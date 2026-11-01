// 계통 묶음 카드: 설명, 층별 구성 장비, 연결 수

import { Layers, X } from 'lucide-react';
import { FLOORS } from '../data/building';
import { CONN_BY_ID, nodeInfo, nodeName } from '../data/graph';
import { GROUP_BY_ID, GROUP_CATS } from '../data/groups';
import { KIND_META } from '../data/connections';
import { RACK_BY_ID } from '../data/racks';
import { activateGroup, focusItem } from '../scene/focus';
import { useView } from '../store/useView';
import { Card, Glyph, IconButton, Kpi, KpiRow, PanelHead, Pill, Props, Section } from './kit';

export function GroupCard({ id }: { id: string }) {
  const g = GROUP_BY_ID[id];
  const ids = [...g.nodes];
  const racks = ids.filter((n) => n.startsWith('rack:'));
  const rackRooms = racks.reduce<Record<string, number>>((m, r) => {
    const k = RACK_BY_ID[r.slice(5)].serverRoom;
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  const kinds = [...g.edges].reduce<Record<string, number>>((m, e) => {
    const k = KIND_META[CONN_BY_ID[e].kind].name;
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  const byFloor = [...FLOORS].reverse().map((f) => ({
    f,
    items: ids.filter((n) => !n.startsWith('rack:') && nodeInfo(n)?.floor === f.id),
  }));
  const used = byFloor.filter((x) => x.items.length > 0);
  return (
    <Card
      head={
        <PanelHead
          glyph={<Glyph icon={Layers} color="var(--info)" />}
          crumb={[GROUP_CATS.find((c) => c.key === g.cat)!.name, '계통 묶음']}
          title={g.name}
          info="장비를 누르면 그 장비 카드로 이동합니다. 묶음 강조는 오른쪽 위 ✕(묶음 해제)를 누를 때까지 유지됩니다."
          pills={<Pill tone="info">3D · 흐름도에서 강조 중</Pill>}
          actions={<IconButton icon={X} label="묶음 해제" onClick={() => activateGroup(null)} />}
        />
      }
    >
      <KpiRow>
        <Kpi label="장비" value={ids.length - racks.length} unit="개" sub={`${used.length}개 층`} />
        <Kpi
          label="랙"
          value={racks.length}
          unit="대"
          sub={
            Object.entries(rackRooms)
              .map(([r, n]) => `${r} ${n}`)
              .join(' · ') || '없음'
          }
        />
        <Kpi label="연결" value={g.edges.size} unit="개" sub={`${Object.keys(kinds).length}종류`} />
      </KpiRow>
      <p className="role">{g.desc}</p>
      <Section id="group-floors" title="층별 구성" count={used.length}>
        <div className="rp-member">
          {used.map(({ f, items }) => (
            <div key={f.id} className="rp-member-floor">
              <span className="fl">{f.id}</span>
              <div className="siblings">
                {items.map((n) => (
                  <button
                    key={n}
                    onClick={() => focusItem(n)}
                    onMouseEnter={() => useView.getState().hover(n)}
                    onMouseLeave={() => useView.getState().hover(null)}
                  >
                    {nodeName(n)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
      {Object.keys(kinds).length > 0 && (
        <Section id="group-kinds" title="연결 종류" count={Object.keys(kinds).length} defaultOpen={false}>
          <Props items={Object.entries(kinds).map(([k, n]) => ({ k, v: `${n}개` }))} />
        </Section>
      )}
    </Card>
  );
}
