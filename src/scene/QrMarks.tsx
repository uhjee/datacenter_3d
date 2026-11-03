// 현장 모드 3D 속 QR 표지: QR 라벨을 붙일 자리(코어 앞 · 출입문 · 냉복도 끝)에 작은 라벨을 세워 둔다.
// 가상 건물에서는 이 표지를 누르는 것이 '라벨을 찍었다'와 같다 (실제 라벨과 같은 setHere · 주소)

import { useCursor } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { FACE_VEC, floorTopAt, labelPlaces, type LabelPlace } from '../data/route';
import { floorWorldY, useView } from '../store/useView';
import { setHere } from '../ui/field/guide';
import { qrCanvas } from '../ui/field/labels';
import { TAP_SLOP } from '../ui/touch';

const SIZE = 0.5; // 라벨 한 변 (m)
const HEIGHT = 1.4; // 바닥 위 라벨 가운데 높이
const AHEAD = 0.5; // 선 자리에서 라벨까지

export function QrMarks() {
  const floor = useView((s) => s.floorFocus);
  const mode = useView((s) => s.viewMode);
  const places = useMemo(() => (floor ? labelPlaces().filter((p) => p.floor === floor) : []), [floor]);
  if (!floor) return null;
  const base = floorWorldY(floor, mode);
  return (
    <group>
      {places.map((p) => (
        <QrMark key={p.id} p={p} y={base + floorTopAt(floor, p.x, p.z)} />
      ))}
    </group>
  );
}

function QrMark({ p, y }: { p: LabelPlace; y: number }) {
  const [tex, setTex] = useState<CanvasTexture | null>(null);
  const [over, setOver] = useState(false);
  const here = useView((s) => s.fieldHere?.place === p.id);
  useCursor(over);
  useEffect(() => {
    let t: CanvasTexture | null = null;
    qrCanvas(p, 128).then((c) => {
      t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      setTex(t);
    });
    return () => t?.dispose();
  }, [p]);
  const [fx, fz] = FACE_VEC[p.face];
  // 라벨 앞면이 선 사람 쪽(보는 방향의 반대)을 향하게
  const rot = Math.atan2(-fx, -fz);
  return (
    <group position={[p.x + fx * AHEAD, y + HEIGHT, p.z + fz * AHEAD]} rotation={[0, rot, 0]}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setOver(true);
        }}
        onPointerOut={() => setOver(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > TAP_SLOP) return;
          setHere(p.id, p.face, 'qr');
        }}
      >
        <planeGeometry args={[SIZE, SIZE]} />
        <meshBasicMaterial map={tex ?? undefined} color={tex ? '#ffffff' : '#dee2e6'} toneMapped={false} />
      </mesh>
      {/* 테두리: 내 위치로 정한 라벨은 파랑, 가리키면 노랑 */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[SIZE + 0.08, SIZE + 0.08]} />
        <meshBasicMaterial color={here ? '#4dabf7' : over ? '#ffd43b' : '#343a40'} />
      </mesh>
    </group>
  );
}
