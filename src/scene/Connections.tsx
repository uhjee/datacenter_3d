// 3D 연결선. 평상시엔 얇게, 선택 · 추적 중엔 관련 선만 굵게 하고 흐름 방향으로 움직이는 점선을 보여준다.
// 장비 선택 · 그 장비의 상류 · 하류 추적은 점선 대신 방향이 보이는 꺾쇠(>>>)로 보여준다.
// 계통 묶음 강조(가이드 투어 포함)는 선이 많아 꺾쇠가 어지러우므로 점선, 시나리오도 점선

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { FLOORS } from '../data/building';
import { CONN_BY_ID } from '../data/graph';
import { isFloorVisible, useView } from '../store/useView';
import { floorAnimY } from './floorAnim';
import { buildLines, type LinkLine } from './routes';
import { edgeColor, isLive } from '../scenario/core';

interface Drawn {
  line: LinkLine;
  obj: Line2;
  mat: LineMaterial;
  base: Color; // 원래 색 (시나리오가 끝나면 되돌림)
  flow: boolean; // 흐름 애니메이션 중
  chevOn: boolean; // 흐름을 꺾쇠로 보여 주는 중 (장비 선택)
  chev: Line2; // 흐름 방향 꺾쇠 (같은 좌표를 쓰는 덧그림 선)
  chevMat: LineMaterial;
}

// 꺾쇠 크기 (월드 단위 m): 확대 · 축소해도 모양 비율이 그대로
const CHEV = { width: 0.28, period: 0.6, tip: 0.7, slope: 1.5, thick: 0.07 };

// 점선 재질의 끊김 판정을 꺾쇠 무늬로 바꾼다. 화살 끝은 선 거리가 커지는 쪽(흐름 방향)
//   t: 한 주기 안의 위치, x: 선 중심에서 옆으로 떨어진 거리 → 끝(tip)에서 x만큼 뒤로 물러난 자리가 꺾쇠 팔
function chevronMaterial(color: Color) {
  const mat = new LineMaterial({ color, linewidth: CHEV.width, worldUnits: true, dashed: true, dashSize: CHEV.period, gapSize: 0, transparent: true, depthWrite: false, depthTest: false });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      'if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX',
      `float chT = mod( vLineDistance + dashOffset, dashSize + gapSize );
				float chX = abs( vUv.x ) * linewidth * 0.5;
				if ( abs( chT - ( ${(CHEV.period * CHEV.tip).toFixed(2)} - chX * ${CHEV.slope.toFixed(2)} ) ) > ${(CHEV.thick / 2).toFixed(3)} ) discard;`,
    );
  };
  mat.customProgramCacheKey = () => 'chevron';
  return mat;
}

// 시나리오 재생 중 연결 상태별 표시: 어떤 전원으로 흐르는지 색으로

function positions(l: LinkLine) {
  const arr = new Float32Array(l.points.length * 3);
  l.points.forEach((p, i) => {
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = floorAnimY[p.f] + p.y;
    arr[i * 3 + 2] = p.z;
  });
  return arr;
}

// 흐름 표시: 꺾쇠면 바탕 선을 가는 실선으로 흐리게 두고 위에 같은 색 꺾쇠를 얹고, 아니면 움직이는 점선
function showFlow(d: Drawn, chevron: boolean) {
  const { mat } = d;
  d.chevOn = chevron && d.flow;
  d.chev.visible = d.chevOn && d.obj.visible;
  if (d.chevOn) {
    mat.dashed = false;
    d.chevMat.color.copy(mat.color);
    d.chevMat.depthTest = mat.depthTest;
    d.chevMat.opacity = Math.min(1, mat.opacity + 0.1);
    mat.opacity *= 0.45;
    mat.linewidth /= 2;
    return;
  }
  mat.dashSize = d.flow ? 0.6 : 0.35;
  mat.gapSize = d.flow ? 0.45 : 0.3;
}

export function Connections() {
  const drawn = useMemo<Drawn[]>(
    () =>
      buildLines().map((line) => {
        const geo = new LineGeometry();
        geo.setPositions(positions(line));
        const color = new Color(line.color);
        if (line.ret) color.multiplyScalar(0.6);
        const mat = new LineMaterial({ color, linewidth: 2, transparent: true, opacity: 0.75, depthWrite: false, dashSize: 0.35, gapSize: 0.3 });
        const obj = new Line2(geo, mat);
        obj.computeLineDistances();
        obj.raycast = () => {};
        obj.renderOrder = 2;
        const chevMat = chevronMaterial(color.clone());
        const chev = new Line2(geo, chevMat);
        chev.raycast = () => {};
        chev.visible = false;
        chev.renderOrder = 6;
        return { line, obj, mat, base: color.clone(), flow: false, chevOn: false, chev, chevMat };
      }),
    [],
  );

  const layersOn = useView((s) => s.layers.links);
  const filter = useView((s) => s.linkFilter);
  const focus = useView((s) => s.floorFocus);
  const selectedId = useView((s) => s.selectedId);
  const highlight = useView((s) => s.highlight);
  const airOn = useView((s) => s.airOn || s.heatOn); // 온도 보기 중에는 연결선을 숨긴다
  const snap = useView((s) => s.scenSnap);

  // 상태가 바뀔 때만 재질 · 표시 갱신
  useEffect(() => {
    for (const d of drawn) {
      const { line, obj, mat } = d;
      if (snap) {
        // 시나리오: 전기가 흐르는 선은 움직이는 점선, 끊긴 선은 회색, 대기 경로는 흐린 점선
        const st = snap.edges[line.conns[0]] ?? 'none';
        const live = isLive(st);
        const sc = edgeColor(st);
        if (sc) mat.color.set(sc);
        else mat.color.copy(d.base);
        obj.visible = !airOn && layersOn && line.floors.every((f) => isFloorVisible(f, focus));
        mat.opacity = st === 'none' ? 0.35 : st === 'idle' ? 0.25 : line.ret ? 0.7 : 1;
        mat.linewidth = live ? (line.ret ? 1.8 : 2.8) : 1.5;
        d.flow = live && !line.ret;
        mat.dashed = d.flow || st === 'idle';
        mat.depthTest = true;
        obj.renderOrder = live ? 4 : 2;
        showFlow(d, false);
        continue;
      }
      mat.color.copy(d.base);
      let on = false;
      if (highlight) on = line.conns.some((id) => highlight.edges.has(id));
      else if (selectedId)
        on = line.conns.some((id) => {
          const c = CONN_BY_ID[id];
          return c.from === selectedId || c.to === selectedId;
        });
      const floorsOk = line.floors.every((f) => isFloorVisible(f, focus));
      // 기류 보기 중에는 연결선을 숨겨 기류가 잘 보이게
      obj.visible = !airOn && floorsOk && (on || (layersOn && filter[line.group]));
      const dim = (highlight || selectedId) && !on;
      mat.opacity = on ? 1 : dim ? (highlight ? 0.06 : 0.35) : line.ret ? 0.5 : 0.75;
      mat.linewidth = on ? (line.ret ? 2.5 : 3.5) : line.ret ? 1.2 : 2;
      d.flow = on && !line.standby;
      mat.dashed = line.standby || d.flow;
      mat.depthTest = !on;
      obj.renderOrder = on ? 5 : 2;
      // 꺾쇠: 장비 선택 · 추적만 (계통 묶음 강조는 점선)
      showFlow(d, highlight?.kind === 'trace' || (!highlight && !!selectedId));
    }
  }, [drawn, layersOn, filter, focus, selectedId, highlight, airOn, snap]);

  const lastY = useRef('');
  useFrame(({ invalidate }, dt) => {
    // 층이 움직이는 동안에만 선 좌표를 다시 계산
    const sig = FLOORS.map((f) => floorAnimY[f.id].toFixed(3)).join(',');
    if (sig !== lastY.current) {
      lastY.current = sig;
      for (const d of drawn) {
        d.obj.geometry.setPositions(positions(d.line));
        d.obj.computeLineDistances(); // 꺾쇠 선도 같은 geometry라 함께 갱신
      }
    }
    let flowing = false;
    for (const d of drawn)
      if (d.flow) {
        (d.chevOn ? d.chevMat : d.mat).dashOffset -= dt * 1.6;
        flowing = true;
      }
    // 시나리오에서 전기가 흐르는 점선은 계속 움직인다
    if (flowing) invalidate();
  });

  useEffect(
    () => () => {
      for (const d of drawn) {
        d.obj.geometry.dispose();
        d.mat.dispose();
        d.chevMat.dispose();
      }
    },
    [drawn],
  );

  return (
    <group>
      {drawn.map((d) => (
        <group key={d.line.key}>
          <primitive object={d.obj} />
          <primitive object={d.chev} />
        </group>
      ))}
    </group>
  );
}
