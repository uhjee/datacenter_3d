// 3D 위 HTML 라벨(drei Html)을 붙일 고정 DOM 위치.
// 지정하지 않으면 Html이 붙을 곳을 렌더마다 다시 계산하다가 바뀌는 순간 라벨을 모두 다시 만든다.

import type { MutableRefObject } from 'react';

export const htmlPortal = { current: null } as unknown as MutableRefObject<HTMLElement>;
