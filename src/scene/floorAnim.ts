// 층 그룹의 현재(애니메이션 중) 높이. 층 밖에서 그리는 연결선이 층을 따라가도록 공유한다.

import { FLOORS, type FloorId } from '../data/building';

export const floorAnimY = Object.fromEntries(FLOORS.map((f) => [f.id, f.y])) as Record<FloorId, number>;
