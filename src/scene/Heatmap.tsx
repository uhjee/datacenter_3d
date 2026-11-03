// 3D 히트맵: 서버실 이중마루 바닥 위에 고른 높이 단면의 공기 온도 분포를 반투명하게 깐다.
// 바닥에 그리므로 랙에 가리지 않고 통로가 보인다. 랙 색도 같은 높이의 흡기로 칠한다 (Racks.tsx).

import { useEffect, useMemo } from 'react';
import { DataTexture, DoubleSide, LinearFilter, PlaneGeometry, RGBAFormat, SRGBColorSpace } from 'three';
import { HEAT_RES, heatAlpha, sampleField } from '../data/heatField';
import { SR_BY_LABEL } from '../data/building';
import { tempRGB, type RoomLabel } from '../data/thermal';
import { useView } from '../store/useView';
import { deviceOf } from '../store/device';
import { TAP_SLOP } from '../ui/touch';
import { useHeatField } from '../ui/useStatus';

// 바닥 평면은 1×1 하나를 같이 쓰고 크기만 늘린다 (켤 때마다 새 지오메트리를 만들지 않도록)
const UNIT_PLANE = new PlaneGeometry(1, 1);

export function Heatmap({ label }: { label: RoomLabel }) {
  // 지금 보고 있는 서버실만 계산 · 표시 (보이지 않는 다른 서버실 분포는 만들지 않는다)
  const on = useView((s) => s.heatOn && s.airRoom === label);
  const f = useHeatField(label, on);
  const hotOnly = useView((s) => s.heatHotOnly);
  const opacity = useView((s) => s.heatOpacity);
  const tex = useMemo(() => {
    if (!f) return null;
    const px = new Uint8Array(f.nx * f.nz * 4);
    for (let i = 0; i < f.nx * f.nz; i++) {
      const [r, g, b] = tempRGB(f.data[i]);
      px[i * 4] = r * 255;
      px[i * 4 + 1] = g * 255;
      px[i * 4 + 2] = b * 255;
      px[i * 4 + 3] = heatAlpha(f.data[i], hotOnly) * 255;
    }
    const t = new DataTexture(px, f.nx, f.nz, RGBAFormat);
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.colorSpace = SRGBColorSpace;
    t.flipY = false;
    t.needsUpdate = true;
    return t;
  }, [f, hotOnly]);
  useEffect(() => () => tex?.dispose(), [tex]);
  // 누른 곳 고정값은 온도 분포(높이 · 공조 조건 · 서버실)가 바뀌거나 히트맵이 꺼지면 지운다 (값이 낡으므로)
  useEffect(
    () => () => {
      if (useView.getState().heatProbe?.pinned) useView.getState().setHeatProbe(null);
    },
    [f],
  );
  if (!f || !tex) return null;
  const w = f.nx * HEAT_RES;
  const d = f.nz * HEAT_RES;
  // 평면을 -90° 눕히면 텍스처 v축(아래→위)이 -z 방향이 되므로 z를 뒤집어 맞춘다 (뒤집혀 뒷면이 보이므로 양면)
  return (
    <mesh
      geometry={UNIT_PLANE}
      position={[f.x0 + w / 2, SR_BY_LABEL[label].raised + 0.02, f.z0 + d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[w, -d, 1]}
      renderOrder={1}
      // 바닥을 가리키면 그 지점 온도를 히트맵 카드에 보여 준다 (층 그룹은 y만 옮기므로 x · z는 그대로)
      // 손가락으로 끄는 것은 회전이므로 값을 바꾸지 않는다 (누른 곳 고정값을 지우지 않게)
      onPointerMove={(e) => {
        if (e.pointerType === 'touch') return;
        const t = sampleField(f, e.point.x, e.point.z);
        useView.getState().setHeatProbe(t == null ? null : { t, x: e.point.x, z: e.point.z });
      }}
      onPointerOut={() => !useView.getState().heatProbe?.pinned && useView.getState().setHeatProbe(null)}
      // 처리기가 붙은 물체를 누르면 빈 곳 클릭(선택 해제)이 불리지 않으므로 직접 푼다.
      // 터치 기기: 누른 곳 온도를 고정해 보여 주고, 같은 곳을 다시 누르면 지운다 (hover가 없으므로)
      onClick={(e) => {
        if (e.delta > TAP_SLOP) return;
        const v = useView.getState();
        v.select(null);
        if (deviceOf() === 'desktop') return;
        const p = v.heatProbe;
        const t = sampleField(f, e.point.x, e.point.z);
        const same = p?.pinned && Math.hypot(p.x - e.point.x, p.z - e.point.z) < 0.6;
        v.setHeatProbe(same || t == null ? null : { t, x: e.point.x, z: e.point.z, pinned: true });
      }}
    >
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}
