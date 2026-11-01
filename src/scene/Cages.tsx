// 고객사 케이지: 랙과 앞 · 뒤 통로를 두른 철망 울타리 + 출입문 + 이름표.
// 케이지 없이 랙만 빌린 고객사는 바닥에 랙 테두리만 그린다.

import { Html, useCursor } from "@react-three/drei";
import { useMemo, useState, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { CanvasTexture, DoubleSide, RepeatWrapping } from "three";
import { RACK, RAISED_H, type FloorId } from "../data/building";
import { CAGE_H, CUSTOMERS, type Customer } from "../data/customers";
import { RACKS } from "../data/racks";
import { useView } from "../store/useView";
import { htmlPortal } from "./htmlPortal";

const MESH_CELL = 0.3; // 철망 무늬 한 장 크기 (m)
const POST = 0.05;
const DOOR_W = 0.9;

function useMeshTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 2;
    // 마름모 철망
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(32, 32);
    g.moveTo(32, 0);
    g.lineTo(0, 32);
    g.stroke();
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  }, []);
}

function Fence({
  from,
  to,
  color,
  tex,
  lit,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
  tex: CanvasTexture;
  lit: boolean;
}) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const h = CAGE_H - RAISED_H;
  const map = useMemo(() => {
    const t = tex.clone();
    t.repeat.set(len / MESH_CELL, h / MESH_CELL);
    t.needsUpdate = true;
    return t;
  }, [tex, len, h]);
  const rotY = -Math.atan2(to[1] - from[1], to[0] - from[0]);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  return (
    <group position={[cx, RAISED_H + h / 2, cz]} rotation={[0, rotY, 0]}>
      {/* 철망 면은 누를 수 있다 (고객사 선택) */}
      <mesh renderOrder={4}>
        <planeGeometry args={[len, h]} />
        <meshBasicMaterial
          color={color}
          alphaMap={map}
          transparent
          opacity={lit ? 0.95 : 0.55}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 위 · 아래 테두리 */}
      {[h / 2, -h / 2 + 0.03].map((y) => (
        <mesh key={y} position={[0, y, 0]} raycast={() => null}>
          <boxGeometry args={[len, 0.04, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
      {/* 기둥: 1.2m 간격 */}
      {Array.from(
        { length: Math.floor(len / 1.2) + 1 },
        (_, i) => -len / 2 + Math.min(len, i * 1.2),
      ).map((x) => (
        <mesh key={x} position={[x, 0, 0]} raycast={() => null}>
          <boxGeometry args={[POST, h, POST]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function CageMesh({ c, lit }: { c: Customer; lit: boolean }) {
  const tex = useMeshTexture();
  const cage = c.cage!;
  const [x0, x1] = cage.x;
  const [z0, z1] = cage.z;
  const dx = cage.door === "east" ? x1 : x0;
  const zm = (z0 + z1) / 2;
  const h = CAGE_H - RAISED_H;
  // 출입문이 난 면은 문 양옆 두 토막으로 나눈다
  return (
    <group>
      <Fence from={[x0, z0]} to={[x1, z0]} color={c.color} tex={tex} lit={lit} />
      <Fence from={[x0, z1]} to={[x1, z1]} color={c.color} tex={tex} lit={lit} />
      <Fence
        from={[cage.door === "east" ? x0 : x1, z0]}
        to={[cage.door === "east" ? x0 : x1, z1]}
        color={c.color}
        tex={tex}
        lit={lit}
      />
      <Fence
        from={[dx, z0]}
        to={[dx, zm - DOOR_W / 2]}
        color={c.color}
        tex={tex}
        lit={lit}
      />
      <Fence
        from={[dx, zm + DOOR_W / 2]}
        to={[dx, z1]}
        color={c.color}
        tex={tex}
        lit={lit}
      />
      {/* 출입문: 조금 열린 문짝 */}
      <group
        position={[dx, RAISED_H, zm - DOOR_W / 2]}
        rotation={[0, cage.door === "east" ? -0.5 : 0.5, 0]}
      >
        <mesh
          position={[0, h / 2 - 0.15, DOOR_W / 2]}
          raycast={() => null}
          renderOrder={4}
        >
          <boxGeometry args={[0.03, h - 0.3, DOOR_W]} />
          <meshStandardMaterial
            color={c.color}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 1.05, DOOR_W - 0.1]} raycast={() => null}>
          <boxGeometry args={[0.08, 0.16, 0.05]} />
          <meshStandardMaterial color="#dee2e6" />
        </mesh>
      </group>
    </group>
  );
}

// 케이지 없는 고객사: 랙 둘레를 바닥에 표시
function RackOutline({ c, lit }: { c: Customer; lit: boolean }) {
  const racks = useMemo(() => RACKS.filter((r) => r.customer === c.id), [c.id]);
  return (
    <group>
      {racks.flatMap((r) => {
        const w = RACK.w + 0.2;
        const d = RACK.d + 0.2;
        const t = lit ? 0.09 : 0.06;
        // 테두리 네 변: [중심 x, 중심 z, 폭, 깊이]
        const sides: [number, number, number, number][] = [
          [0, -d / 2, w, t],
          [0, d / 2, w, t],
          [-w / 2, 0, t, d],
          [w / 2, 0, t, d],
        ];
        return sides.map(([sx, sz, sw, sd], i) => (
          <mesh
            key={`${r.id}-${i}`}
            position={[r.x + sx, RAISED_H + 0.012, r.z + sz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[sw, sd]} />
            <meshBasicMaterial color={c.color} />
          </mesh>
        ));
      })}
    </group>
  );
}

function CustomerTag({ c, hidden, lit }: { c: Customer; hidden: boolean; lit: boolean }) {
  const racks = RACKS.filter((r) => r.customer === c.id);
  const pos: [number, number, number] = c.cage
    ? [
        (c.cage.x[0] + c.cage.x[1]) / 2,
        CAGE_H + 0.35,
        (c.cage.z[0] + c.cage.z[1]) / 2,
      ]
    : [racks[0].x, RAISED_H + RACK.h + 1.1, racks[0].z];
  return (
    <Html
      portal={htmlPortal}
      position={pos}
      center
      zIndexRange={[5, 0]}
    >
      <div
        className={`cage-tag${lit ? " on" : ""}`}
        style={{ display: hidden ? "none" : undefined, borderColor: c.color }}
        title={`${c.name} 정보 보기`}
        onClick={() => useView.getState().select(`customer:${c.id}`)}
        onMouseEnter={() => useView.getState().hover(`customer:${c.id}`)}
        onMouseLeave={() => useView.getState().hover(null)}
      >
        <i style={{ background: c.color }} />
        {c.name}
        <small>{c.cage ? `케이지 · 랙 ${racks.length}대` : "랙 1대"}</small>
      </div>
    </Html>
  );
}

// 철망 너머로 랙이 겹쳐 보이면 랙을 고르게 둔다 (이벤트를 막지 않으면 뒤의 랙이 받는다)
// 철망 뒤에 보이는 첫 랙 (없으면 null). 랙 묶음 메시의 userData.rackIds로 인스턴스 → 랙 번호
const rackBehind = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
  const h = e.intersections.find((k) => k.object.userData.rackIds && k.distance > e.distance);
  return h && h.instanceId != null ? `rack:${h.object.userData.rackIds[h.instanceId]}` : null;
};

function CustomerPick({ c, children }: { c: Customer; children: ReactNode }) {
  const id = `customer:${c.id}`;
  const [over, setOver] = useState(false);
  useCursor(over);
  return (
    <group
      onPointerMove={(e) => {
        // 철망을 이미 가리키던 중이면 R3F가 뒤 물체로 이동 이벤트를 넘기지 않으므로 뒤 랙의 강조를 여기서 건다
        const rack = rackBehind(e);
        e.stopPropagation();
        if (!over) setOver(true);
        if (rack) {
          if (useView.getState().hoveredId !== rack) useView.getState().hover(rack);
          return;
        }
        if (useView.getState().hoveredId !== id) useView.getState().hover(id);
      }}
      onPointerOut={() => {
        setOver(false);
        const h = useView.getState().hoveredId;
        if (h === id || h?.startsWith('rack:')) useView.getState().hover(null);
      }}
      onClick={(e) => {
        if (rackBehind(e)) return;
        e.stopPropagation();
        useView.getState().select(id);
      }}
    >
      {children}
    </group>
  );
}

export function Cages({ floor }: { floor: FloorId }) {
  const shown = useView((s) => s.layers.cages);
  const focus = useView((s) => s.floorFocus);
  const selectedId = useView((s) => s.selectedId);
  const hoveredId = useView((s) => s.hoveredId);
  const customers = useMemo(
    () => CUSTOMERS.filter((c) => c.floor === floor),
    [floor],
  );
  if (customers.length === 0) return null;
  // 이름표는 그 층을 보고 있을 때만 (다른 층 위에 떠 있지 않도록)
  const tagHidden = !shown || focus !== floor;
  return (
    <group visible={shown}>
      {customers.map((c) => {
        const lit = selectedId === `customer:${c.id}` || hoveredId === `customer:${c.id}`;
        return (
          <group key={c.id}>
            <CustomerPick c={c}>{c.cage ? <CageMesh c={c} lit={lit} /> : <RackOutline c={c} lit={lit} />}</CustomerPick>
            <CustomerTag c={c} hidden={tagHidden} lit={lit} />
          </group>
        );
      })}
    </group>
  );
}
