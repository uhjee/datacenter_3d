// 장비 목록 > 랙 트리: 층 > 고객사 > 랙. 고객사가 없는 랙은 층 > 열 > 랙으로 묶는다.

import { useMemo } from "react";
import { BLOCK_NAME, FLOORS, ROOM_BY_ID, SERVER_ROOMS } from "../data/building";
import { CUSTOMERS, CUSTOMER_BY_ID } from "../data/customers";
import { DOMAIN_META } from "../data/equipTypes";
import { RACKS, type Rack } from "../data/racks";
import { focusItem } from "../scene/focus";
import { useView } from "../store/useView";

const byIndex = (a: Rack, b: Rack) => a.row - b.row || a.index - b.index;

export function RackTree({ query }: { query: string }) {
  const focus = useView((s) => s.floorFocus);
  const selectedId = useView((s) => s.selectedId);

  const tree = useMemo(() => {
    const q = query.trim().toUpperCase();
    const hit = (r: Rack) =>
      !q ||
      r.id.includes(q) ||
      (r.customer != null &&
        CUSTOMER_BY_ID[r.customer].name.toUpperCase().includes(q));
    return [...FLOORS].reverse().flatMap((f) => {
      const racks = RACKS.filter((r) => r.floor === f.id && hit(r)).sort(
        byIndex,
      );
      if (racks.length === 0) return [];
      const customers = CUSTOMERS.filter((c) => c.floor === f.id)
        .map((c) => ({ c, racks: racks.filter((r) => r.customer === c.id) }))
        .filter((g) => g.racks.length > 0);
      const rows = [0, 1, 2, 3, 4, 5]
        .map((row) => ({
          row,
          racks: racks.filter((r) => !r.customer && r.row === row),
        }))
        .filter((g) => g.racks.length > 0);
      const sr = SERVER_ROOMS.find((s) => s.floor === f.id)!;
      return [
        {
          floor: f,
          room: ROOM_BY_ID[sr.roomId].name,
          customers,
          rows,
          count: racks.length,
        },
      ];
    });
  }, [query]);

  const searching = query.trim() !== "";
  const has = (racks: Rack[]) =>
    racks.some((r) => `rack:${r.id}` === selectedId);

  return (
    <div className="tree">
      {tree.length === 0 && <p className="hint">찾는 랙이 없습니다.</p>}
      {tree.map(({ floor, room, customers, rows, count }) => (
        <details key={floor.id} open={floor.id === focus || !focus}>
          <summary>
            <b>{floor.id}</b> {room} <span className="count">{count}</span>
          </summary>
          {customers.length > 0 && (
            <div className="room-group">
              <div className="room-name">고객사</div>
              {customers.map(({ c, racks }) => (
                <details
                  key={c.id}
                  className="sub"
                  open={searching || has(racks)}
                >
                  <summary>
                    <span className="dot" style={{ background: c.color }} />
                    {c.name}
                    <small className="tree-tag">
                      {c.cage ? "케이지" : "랙 단위"}
                    </small>
                    <span className="count">{racks.length}</span>
                    <button
                      className={`tree-info${selectedId === `customer:${c.id}` ? " on" : ""}`}
                      title={`${c.name} 계약 · 전력 정보`}
                      onClick={(e) => {
                        e.preventDefault();
                        focusItem(`customer:${c.id}`);
                      }}
                    >
                      정보
                    </button>
                  </summary>
                  {racks.map((r) => (
                    <RackItem
                      key={r.id}
                      r={r}
                      color={c.color}
                      selected={selectedId === `rack:${r.id}`}
                    />
                  ))}
                </details>
              ))}
            </div>
          )}
          {rows.length > 0 && (
            <div className="room-group">
              <div className="room-name">
                {customers.length > 0 ? "그 밖의 랙 (열별)" : "열별"}
              </div>
              {rows.map(({ row, racks }) => (
                <details
                  key={row}
                  className="sub"
                  open={searching || has(racks)}
                >
                  <summary>
                    {row + 1}열<span className="count">{racks.length}</span>
                  </summary>
                  {racks.map((r) => (
                    <RackItem
                      key={r.id}
                      r={r}
                      selected={selectedId === `rack:${r.id}`}
                    />
                  ))}
                </details>
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

function RackItem({
  r,
  color,
  selected,
}: {
  r: Rack;
  color?: string;
  selected: boolean;
}) {
  const id = `rack:${r.id}`;
  const empty = r.devices.length === 0;
  const c = color ?? DOMAIN_META.it.color;
  return (
    <button
      className={`item ${selected ? "sel" : ""}`}
      onClick={() => focusItem(id)}
      onMouseEnter={() => useView.getState().hover(id)}
      onMouseLeave={() => useView.getState().hover(null)}
      title={`${r.row + 1}열 ${r.index + 1}번 · ${BLOCK_NAME[r.block]}`}
    >
      {/* 장비가 없는 빈 랙은 속이 빈 점 */}
      <span
        className="dot"
        style={
          empty ? { boxShadow: `inset 0 0 0 1.5px ${c}` } : { background: c }
        }
      />
      {r.id}
      <span className="item-meta num">{empty ? "빈 랙" : `${r.uUsed}U`}</span>
    </button>
  );
}
