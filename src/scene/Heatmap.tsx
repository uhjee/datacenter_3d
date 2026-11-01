// 3D 히트맵: 서버실 이중마루 바닥 위에 고른 높이 단면의 공기 온도 분포를 반투명하게 깐다.
// 바닥에 그리므로 랙에 가리지 않고 통로가 보인다. 랙 색도 같은 높이의 흡기로 칠한다 (Racks.tsx).

import { useEffect, useMemo } from 'react';
import { DataTexture, DoubleSide, LinearFilter, RGBAFormat, SRGBColorSpace } from 'three';
import { HEAT_RES } from '../data/heatField';
import { RAISED_H } from '../data/building';
import { tempRGB, type RoomLabel } from '../data/thermal';
import { useView } from '../store/useView';
import { useHeatField } from '../ui/useStatus';

export function Heatmap({ label }: { label: RoomLabel }) {
  const on = useView((s) => s.heatOn);
  const f = useHeatField(label, on);
  const tex = useMemo(() => {
    if (!f) return null;
    const px = new Uint8Array(f.nx * f.nz * 4);
    for (let i = 0; i < f.nx * f.nz; i++) {
      const [r, g, b] = tempRGB(f.data[i]);
      px[i * 4] = r * 255;
      px[i * 4 + 1] = g * 255;
      px[i * 4 + 2] = b * 255;
      px[i * 4 + 3] = 255;
    }
    const t = new DataTexture(px, f.nx, f.nz, RGBAFormat);
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.colorSpace = SRGBColorSpace;
    t.flipY = false;
    t.needsUpdate = true;
    return t;
  }, [f]);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!f || !tex) return null;
  const w = f.nx * HEAT_RES;
  const d = f.nz * HEAT_RES;
  // 평면을 -90° 눕히면 텍스처 v축(아래→위)이 -z 방향이 되므로 z를 뒤집어 맞춘다 (뒤집혀 뒷면이 보이므로 양면)
  return (
    <mesh position={[f.x0 + w / 2, RAISED_H + 0.02, f.z0 + d / 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} transparent opacity={0.82} depthWrite={false} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}
