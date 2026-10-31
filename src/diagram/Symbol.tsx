// 흐름도 노드 왼쪽의 간단한 기호 (단선도 기호를 단순화). 원점 중심, 약 22px.

import type { DNode } from './model';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } as const;

function Fan() {
  return (
    <g {...S}>
      <circle r={9} />
      {[0, 120, 240].map((a) => (
        <path key={a} d="M0,0 Q4,-3 2,-8" transform={`rotate(${a})`} />
      ))}
    </g>
  );
}

export function Symbol({ type }: { type: DNode['type'] }) {
  switch (type) {
    case 'kepco':
      return (
        <g {...S}>
          <path d="M-7,9 L0,-9 L7,9 M-4,1 H4 M-5.5,5 H5.5" />
        </g>
      );
    case 'hvPanel':
    case 'lvPanel':
      // 차단기: 사각형 안 X
      return (
        <g {...S}>
          <rect x={-7} y={-7} width={14} height={14} />
          <path d="M-7,-7 L7,7 M7,-7 L-7,7" />
        </g>
      );
    case 'tr':
      return (
        <g {...S}>
          <circle cy={-4} r={6} />
          <circle cy={4} r={6} />
        </g>
      );
    case 'generator':
      return (
        <g {...S}>
          <circle r={9} />
          <text y={4} textAnchor="middle" fontSize={11} fill="currentColor" stroke="none">
            G
          </text>
        </g>
      );
    case 'mcc':
      return (
        <g {...S}>
          <circle r={9} />
          <text y={4} textAnchor="middle" fontSize={10} fill="currentColor" stroke="none">
            M
          </text>
        </g>
      );
    case 'fuelTank':
      return (
        <g {...S}>
          <rect x={-9} y={-6} width={18} height={12} rx={5} />
        </g>
      );
    case 'ats':
    case 'sts':
      // 절체 스위치: 두 접점 중 하나로 넘어가는 칼날
      return (
        <g {...S}>
          <circle cx={-6} cy={-7} r={1.6} />
          <circle cx={6} cy={-7} r={1.6} />
          <circle cy={8} r={1.6} />
          <path d="M0,6.5 L-5,-5.5" />
          {type === 'sts' && <path d="M3,2 L7,-2 M5,2 L9,-2" />}
        </g>
      );
    case 'ups':
      return (
        <g {...S}>
          <rect x={-9} y={-8} width={18} height={16} />
          <path d="M-9,8 L9,-8" />
          <path d="M-7,-3 q1.5,-2 3,0 t3,0" />
          <path d="M1,4 h6 M1,6 h6" />
        </g>
      );
    case 'battery':
      return (
        <g {...S}>
          <path d="M-8,-4 V4 M-4,-7 V7 M0,-4 V4 M4,-7 V7" strokeWidth={1.8} />
        </g>
      );
    case 'pdu':
      return (
        <g {...S}>
          <rect x={-7} y={-9} width={14} height={18} />
          <path d="M-4,-5 h8 M-4,-1 h8 M-4,3 h8" />
        </g>
      );
    case 'group':
      return (
        <g {...S}>
          <rect x={-9} y={-9} width={8} height={18} />
          <rect x={1} y={-9} width={8} height={18} />
          <path d="M-7,-5 h4 M-7,-1 h4 M3,-5 h4 M3,-1 h4" />
        </g>
      );
    case 'hub':
      return (
        <g {...S}>
          <path d="M-9,0 H9" strokeWidth={4} />
          <path d="M-5,0 V7 M0,0 V7 M5,0 V7" />
        </g>
      );
    case 'crac':
    case 'crah':
      return (
        <g {...S}>
          <rect x={-9} y={-9} width={18} height={18} />
          <path d="M-5,-4 h10 M-5,0 h10 M-5,4 h10" />
        </g>
      );
    case 'condenser':
    case 'coolingTower':
    case 'mech':
      return <Fan />;
    case 'pump':
      return (
        <g {...S}>
          <circle r={8} />
          <path d="M-4,-5 L6,0 L-4,5 Z" />
        </g>
      );
    case 'chiller':
      return (
        <g {...S}>
          <rect x={-9} y={-8} width={18} height={16} />
          <path d="M0,-5 V5 M-4.3,-2.5 L4.3,2.5 M-4.3,2.5 L4.3,-2.5" />
        </g>
      );
    case 'hx':
      return (
        <g {...S}>
          <rect x={-8} y={-9} width={16} height={18} />
          <path d="M-8,-5 L8,-1 L-8,3 L8,7" />
        </g>
      );
    default:
      return (
        <g {...S}>
          <rect x={-7} y={-7} width={14} height={14} />
        </g>
      );
  }
}
