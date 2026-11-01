// 짧은 안내 (3D 아래 가운데, 칩 줄 위): 화면이 말없이 다른 곳으로 옮겨 갈 때 이유를 알린다. 4초 뒤 사라지고 ✕로 닫는다

import { useEffect } from 'react';
import { Info, X } from 'lucide-react';
import { useView } from '../store/useView';

const SHOW_MS = 4000;

export function Toast() {
  const toast = useView((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useView.getState().hideToast(), SHOW_MS);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div key={toast.key} className="toast" role="status">
      <Info size={15} />
      <span>{toast.text}</span>
      <button className="icon" onClick={() => useView.getState().hideToast()} aria-label="안내 닫기">
        <X size={13} />
      </button>
    </div>
  );
}
