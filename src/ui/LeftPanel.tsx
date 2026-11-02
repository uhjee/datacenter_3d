import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { FLOORS, ROOM_BY_ID, ROOMS, SHAFTS } from "../data/building";
import { LINK_GROUPS } from "../data/connections";
import { GROUP_CATS, GROUPS } from "../data/groups";
import { EQUIPMENT } from "../data/equipment";
import { DOMAIN_META, TYPE_BY_ID, type Domain } from "../data/equipTypes";
import { activateGroup, focusItem } from "../scene/focus";
import { RACK_COLOR_META, RAMP_CSS } from "../scene/rackColor";
import { LAYER_META, useView, type RackColorMode } from "../store/useView";
import { InfoTip, keyToggle, TipTable, ToggleTag } from "./kit";
import { tempGradient } from "../data/thermal";
import { RackTree } from "./RackTree";

const TEMP_CSS = tempGradient(15, 40); // 온도 카드 · 히트맵과 같은 척도

const TAB_KEY = "dc3d.leftTab";
const readTab = (): "browse" | "view" => {
  try {
    return localStorage.getItem(TAB_KEY) === "view" ? "view" : "browse";
  } catch {
    return "browse";
  }
};

const FILTERS: { key: Domain | "all"; name: string }[] = [
  { key: "all", name: "전체" },
  { key: "power", name: "전력" },
  { key: "cooling", name: "공조" },
  { key: "fire", name: "방재" },
  { key: "security", name: "보안" },
];

export function LeftPanel() {
  const layers = useView((s) => s.layers);
  const toggleLayer = useView((s) => s.toggleLayer);
  const focus = useView((s) => s.floorFocus);
  const selectedId = useView((s) => s.selectedId);
  const linkFilter = useView((s) => s.linkFilter);
  const groupId = useView((s) => s.groupId);
  const rackColor = useView((s) => s.rackColor);
  const [filter, setFilter] = useState<Domain | "all">("all");
  const [query, setQuery] = useState("");
  const [treeMode, setTreeMode] = useState<"equip" | "rack">("equip");
  const [tab, setTabState] = useState<"browse" | "view">(readTab);
  const setTab = (t: "browse" | "view") => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // 저장이 막힌 환경에서는 이번 화면에서만 유지
    }
  };

  const tree = useMemo(() => {
    const q = query.trim();
    return [...FLOORS].reverse().map((f) => {
      const items = EQUIPMENT.filter(
        (e) =>
          e.floor === f.id &&
          (filter === "all" || TYPE_BY_ID[e.type].domain === filter) &&
          (!q || e.name.includes(q) || TYPE_BY_ID[e.type].name.includes(q)),
      );
      const rooms = ROOMS.filter((r) => r.floor === f.id)
        .map((r) => ({ room: r, items: items.filter((e) => e.room === r.id) }))
        .filter((g) => g.items.length > 0);
      return { floor: f, rooms, count: items.length };
    });
  }, [filter, query]);

  return (
    <aside className="panel left">
      {/* 탐색(장비 목록)과 표시 설정(레이어 · 연결선 · 랙 색칠 · 묶음)을 탭으로 나눠, 자주 쓰는 목록이 아래로 밀리지 않게 */}
      <div className="lp-tabs seg small" role="tablist">
        {(
          [
            ["browse", "탐색"],
            ["view", "표시"],
          ] as const
        ).map(([k, name]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {name}
          </button>
        ))}
      </div>
      {tab === "view" && (
        <div className="lp-view">
          <LeftSection
            id="layers"
            title="레이어"
            info="3D에 보일 장비 분야와 보조 표시를 켜고 끕니다. 끈 분야의 장비는 화면과 클릭 대상에서 빠집니다."
            summary={`${LAYER_META.filter((l) => layers[l.key]).length}/${LAYER_META.length} 켬`}
          >
            <div className="lp-tags">
              {LAYER_META.map((l) => (
                <ToggleTag
                  key={l.key}
                  on={layers[l.key]}
                  onToggle={() => toggleLayer(l.key)}
                  label={l.name}
                  color={
                    l.key in DOMAIN_META
                      ? DOMAIN_META[l.key as Domain].color
                      : "#868e96"
                  }
                />
              ))}
            </div>
          </LeftSection>

          <LeftSection
            id="links"
            title="연결선"
            info={
              <TipTable
                head={["표시", "뜻"]}
                rows={[
                  ["실선", "평상시 전기 · 냉매 · 물이 흐르는 경로"],
                  ["점선", "평상시 쓰지 않는 대기 경로 (발전기 · 예비선 · 연계 · 프리쿨링)"],
                  ["움직이는 꺾쇠 >>>", "장비 선택 · 상류/하류 추적 중 흐름 방향 (보내는 곳 → 받는 곳). 계통 묶음 강조 · 시나리오는 움직이는 점선"],
                  ["두 줄 배관", "공급과 환수 (냉수 · 냉각수 · 냉매)"],
                  ["층을 넘는 선", "샤프트를 지남 (EPS-A/B 전력, PS 배관, 냉매 배관 샤프트)"],
                ]}
              />
            }
            summary={
              layers.links
                ? `${LINK_GROUPS.filter((g) => linkFilter[g.key]).length}/${LINK_GROUPS.length} 켬`
                : "레이어 꺼짐"
            }
          >
            <div className={`lp-tags ${layers.links ? "" : "off"}`}>
              {LINK_GROUPS.map((g) => (
                <ToggleTag
                  key={g.key}
                  on={linkFilter[g.key]}
                  disabled={!layers.links}
                  onToggle={() => useView.getState().toggleLink(g.key)}
                  label={g.name}
                  color={g.color}
                  line
                />
              ))}
            </div>
          </LeftSection>

          <LeftSection
            id="rack-color"
            title="랙 색칠"
            info={
              <TipTable
                head={["방식", "칠하는 값", "범위"]}
                rows={(["u", "power", "temp"] as const).map((k) => [
                  RACK_COLOR_META[k].short,
                  RACK_COLOR_META[k].desc,
                  <span className="num">
                    {RACK_COLOR_META[k].low} ~ {RACK_COLOR_META[k].high}
                  </span>,
                ])}
              />
            }
            summary={
              rackColor === "none" ? "없음" : RACK_COLOR_META[rackColor].name
            }
          >
            <div className="seg small">
              {(["none", "u", "power", "temp"] as RackColorMode[]).map((k) => (
                <button
                  key={k}
                  className={rackColor === k ? "on" : ""}
                  onClick={() => useView.getState().setRackColor(k)}
                >
                  {k === "none" ? "없음" : RACK_COLOR_META[k].short}
                </button>
              ))}
            </div>
            {rackColor !== "none" && (
              <div className="ramp-legend">
                <i
                  style={{ background: rackColor === "temp" ? TEMP_CSS : RAMP_CSS }}
                />
                <span>
                  {RACK_COLOR_META[rackColor].name} {RACK_COLOR_META[rackColor].low}
                </span>
                <span>{RACK_COLOR_META[rackColor].high}</span>
              </div>
            )}
          </LeftSection>

          <LeftSection
            id="groups"
            title="계통 묶음"
            info="묶음을 고르면 그 장비와 연결만 남기고 나머지는 흐리게 표시합니다. 흐름도도 그 부분만 보여줍니다. 버튼에 마우스를 올리면 묶음 설명이 나옵니다."
            summary={
              groupId
                ? GROUPS.find((g) => g.id === groupId)?.short
                : `${GROUPS.length}개`
            }
          >
            {/* 층별 묶음은 층 막대와 겹치므로 여기 두지 않고, 층을 고르면 3D 아래 칩 줄의 '장비 강조'로 켠다 */}
              {GROUP_CATS.filter((c) => c.key !== "floor").map((c) => (
              <div key={c.key} className="group-row">
                <span className="group-cat">{c.name}</span>
                <div className="group-btns">
                  {GROUPS.filter((g) => g.cat === c.key).map((g) => (
                    <button
                      key={g.id}
                      className={groupId === g.id ? "on" : ""}
                      title={g.desc}
                      onClick={() => activateGroup(g.id)}
                    >
                      {g.short}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </LeftSection>
        </div>
      )}
      {tab === "browse" && (
        <>
          <section className="grow">
            <div className="lp-tree-head">
              <h3 className="lp-h">
                장비 목록
                <InfoTip
                  text={
                    <>
                      <TipTable
                        head={["보기", "담는 것", "묶는 순서", "검색"]}
                        rows={[
                          ["설비", "전력 · 공조 · 방재 · 보안 장비", "층 > 실 > 장비", "장비 이름"],
                          ["랙", "서버실 랙", "층 > 고객사 > 랙 (고객사 없는 랙은 층 > 열 > 랙)", "랙 번호 · 고객사"],
                        ]}
                      />
                      <p>항목을 누르면 3D에서 그 장비로 이동합니다.</p>
                    </>
                  }
                />
              </h3>
              {/* 설비 = 전력 · 공조 · 방재 · 보안 장비, 랙 = 층 > 고객사 · 열 > 랙 */}
              <div className="seg small" role="tablist">
                {(
                  [
                    ["equip", "설비"],
                    ["rack", "랙"],
                  ] as const
                ).map(([k, name]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={treeMode === k}
                    className={treeMode === k ? "on" : ""}
                    onClick={() => {
                      setTreeMode(k);
                      setQuery("");
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            {treeMode === "equip" && (
              <div className="seg small">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={filter === f.key ? "on" : ""}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            <input
              className="search"
              placeholder={
                treeMode === "equip" ? "장비 이름 검색" : "랙 번호 · 고객사 검색"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {treeMode === "rack" ? (
              <RackTree query={query} />
            ) : (
              <div className="tree">
                {tree.map(({ floor, rooms, count }) =>
                  count === 0 ? null : (
                    <details key={floor.id} open={floor.id === focus || !focus}>
                      <summary>
                        <b>{floor.id}</b> {floor.name}{" "}
                        <span className="count">{count}</span>
                      </summary>
                      {rooms.map(({ room, items }) => (
                        <div key={room.id} className="room-group">
                          <div className="room-name">
                            {ROOM_BY_ID[room.id].name}
                          </div>
                          {items.map((e) => {
                            const t = TYPE_BY_ID[e.type];
                            return (
                              <button
                                key={e.id}
                                className={`item ${selectedId === e.id ? "sel" : ""}`}
                                onClick={() => focusItem(e.id)}
                                onMouseEnter={() => useView.getState().hover(e.id)}
                                onMouseLeave={() => useView.getState().hover(null)}
                              >
                                <span
                                  className="dot"
                                  style={{
                                    background: DOMAIN_META[t.domain].color,
                                  }}
                                />
                                {e.name}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </details>
                  ),
                )}
                {filter === "all" && !query && (
                  <details>
                    <summary>
                      <b>샤프트</b> 수직 통로{" "}
                      <span className="count">{SHAFTS.length}</span>
                    </summary>
                    {SHAFTS.map((s) => (
                      <button
                        key={s.id}
                        className={`item ${selectedId === `shaft:${s.id}` ? "sel" : ""}`}
                        onClick={() => focusItem(`shaft:${s.id}`)}
                      >
                        <span className="dot" style={{ background: s.color }} />
                        {s.name}
                      </button>
                    ))}
                  </details>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </aside>
  );
}

// 접는 섹션: 접힌 제목 옆에 지금 값(예: 랙 색칠 · 없음)을 보여 열지 않아도 상태를 안다. 열림 상태는 브라우저에 기억
const OPEN_KEY = "dc3d.left.open";
function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function LeftSection({
  id,
  title,
  info,
  summary,
  children,
}: {
  id: string;
  title: string;
  info?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? true);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(
        OPEN_KEY,
        JSON.stringify({ ...readOpen(), [id]: !open }),
      );
    } catch {
      // 저장이 막힌 환경에서는 이번 화면에서만 유지
    }
  };
  return (
    <section className={`lp-sect${open ? "" : " closed"}`}>
      {/* 제목 줄 전체가 접기 단추. 안에 info 단추가 들어가므로 button 대신 role=button */}
      <div
        className="lp-sect-h"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={keyToggle(toggle)}
      >
        <span className="lp-h">
          {title}
          {info && <InfoTip text={info} />}
        </span>
        {summary != null && <span className="lp-sum">{summary}</span>}
        <ChevronDown className="k-chev" size={14} />
      </div>
      {open && <div className="lp-sect-body">{children}</div>}
    </section>
  );
}
