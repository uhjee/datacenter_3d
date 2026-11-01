// 호버·선택 대상 이름표. 3D 안의 Html 대신 DOM 오버레이 하나를 매 프레임 투영해 움직인다.

import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useView } from '../store/useView';
import { labelAnchor } from './focus';

const els: { hover: HTMLDivElement | null; select: HTMLDivElement | null } = { hover: null, select: null };
const v = new Vector3();

export function LabelOverlay() {
  return (
    <>
      <div className="tag float" ref={(el) => {
          els.hover = el;
        }} />
      <div className="tag tag-strong float" ref={(el) => {
          els.select = el;
        }} />
    </>
  );
}

export function LabelProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const { hoveredId, selectedId } = useView.getState();
    place(els.select, selectedId);
    place(els.hover, hoveredId && hoveredId !== selectedId ? hoveredId : null);
  });

  function place(el: HTMLDivElement | null, id: string | null) {
    if (!el) return;
    // 고객사는 3D에 이름표(케이지 태그)가 늘 떠 있어 따로 띄우지 않는다
    const a = id && !id.startsWith('customer:') ? labelAnchor(id) : null;
    if (!a) {
      el.style.display = 'none';
      return;
    }
    v.set(...a.pos).project(camera);
    if (v.z > 1) {
      el.style.display = 'none';
      return;
    }
    const x = ((v.x + 1) / 2) * size.width;
    const y = ((1 - v.y) / 2) * size.height;
    el.style.display = 'block';
    el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    if (el.textContent !== a.name) el.textContent = a.name;
  }
  return null;
}
