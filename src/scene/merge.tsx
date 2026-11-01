// 정적 형상 합치기: 장비처럼 한 번 그리고 나면 모양이 바뀌지 않는 묶음에서, 같은 재질의 부품 메시를 하나로 합쳐
// 그리기 호출을 줄인다 (장비 하나가 부품 10~50개 → 재질 수만큼 2~5개).
// 합친 뒤 원래 부품은 숨긴다. 재질 객체는 원래 것을 그대로 쓰므로 흐리게 하기(useDim)도 같이 적용된다.
// 주의: 자식이 상태에 따라 모양 · 색을 바꾸는 묶음에는 쓰지 않는다 (합친 형상은 처음 모양 그대로다)

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Matrix4, Mesh, type BufferGeometry, type Group, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const RAYCAST = Mesh.prototype.raycast;
const noRaycast = () => null;

// 같은 재질로 볼 수 있는지 판정하는 열쇠 (재질 종류 · 색 · 투명도 등 + 지오메트리 속성 구성 + 클릭 여부)
function keyOf(m: Mesh): string | null {
  const mat = m.material as Material & Record<string, unknown>;
  if (Array.isArray(m.material) || !mat) return null;
  if (!['MeshStandardMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial'].includes(mat.type)) return null;
  const g = m.geometry as BufferGeometry;
  const attrs = Object.keys(g.attributes).sort().join('+');
  const col = (k: string) => (mat[k] as { getHexString?: () => string } | undefined)?.getHexString?.() ?? '';
  return [
    mat.type,
    col('color'),
    col('emissive'),
    mat.emissiveIntensity,
    mat.opacity,
    mat.transparent,
    mat.depthWrite,
    mat.side,
    mat.toneMapped,
    mat.metalness,
    mat.roughness,
    (mat.map as { uuid?: string } | null)?.uuid ?? '',
    (mat.alphaMap as { uuid?: string } | null)?.uuid ?? '',
    g.index ? 'i' : 'n',
    attrs,
    m.renderOrder,
    m.raycast === RAYCAST ? 'hit' : 'nohit',
  ].join('|');
}

export function MergeStatic({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const inv = new Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map<string, Mesh[]>();
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || m.userData.noMerge) return;
      const k = keyOf(m);
      if (!k) return;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(m);
    });
    const made: Mesh[] = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld)));
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new Mesh(merged, list[0].material);
      mesh.renderOrder = list[0].renderOrder;
      if (list[0].raycast !== RAYCAST) mesh.raycast = noRaycast;
      mesh.userData.merged = true;
      for (const m of list) m.visible = false;
      root.add(mesh);
      made.push(mesh);
    }
    return () => {
      for (const m of made) {
        root.remove(m);
        m.geometry.dispose();
      }
    };
  }, []);
  return <group ref={ref}>{children}</group>;
}
