// 공통 부품 미리보기 (개발 중에만 ?kit 으로 열림). 부품 모양을 앱 흐름과 따로 확인하는 용도

import { Crosshair, X } from 'lucide-react';
import { DOMAIN_ICON, Glyph, Help, IconButton, Kpi, KpiRow, LearnBox, Meter, PanelHead, Pill, Props, Section, Status } from './kit';

const noop = () => {};

export function KitPreview() {
  return (
    <div className="kit-preview">
      <aside className="panel right">
        <PanelHead
          glyph={<Glyph icon={DOMAIN_ICON.power} color="var(--power)" />}
          crumb={['2F', 'UPS실 A', 'P8 UPS']}
          title="UPS-A"
          pills={
            <>
              <Pill tone="ok">상용 운전</Pill>
              <Pill ghost color="var(--a)">
                A계통 · 2N
              </Pill>
            </>
          }
          actions={
            <>
              <IconButton icon={Crosshair} label="카메라 이동" onClick={noop} />
              <IconButton icon={X} label="닫기" onClick={noop} />
            </>
          }
        />
        <div className="kit-body">
          <KpiRow>
            <Kpi label="출력" value="520" unit="kW" meter={{ v: 0.48, mark: 0.5, color: 'var(--ok)', markLabel: '2N 권장 상한 50%' }} sub="부하율 48% · 기준 50%" />
            <Kpi label="효율" value="96.4" unit="%" sub="손실 20kW" />
            <Kpi label="배터리" value="100" unit="%" sub="300kWh · 약 34분" />
          </KpiRow>
          <Section title="성능 포인트" count={5}>
            <Props
              items={[
                { k: '방식', v: '온라인 이중변환' },
                { k: '용량', v: '1,200kVA / 1,080kW' },
                { k: '효율', v: '94~97%' },
                { k: '권장 부하율', v: '≤ 50% (2N)' },
                { k: '담당', v: '서버실 A·B의 A계통 · PDU 18대 · STS 2대', wide: true },
              ]}
            />
          </Section>
          <Section
            title={
              <>
                남은 용량 <Help text="공간 · 전력 · 냉각 중 하나가 먼저 차면 나머지가 남아도 랙을 더 넣지 못합니다(고립 용량)." />
              </>
            }
            id="kit-cap"
            aside={<Status tone="warn">냉각 먼저 참</Status>}
          >
            <Meter v={0.86} size="md" color="var(--warn)" />
            <Meter v={0.65} mark={0.86} size="md" />
            <Meter v={0.58} mark={0.86} size="md" />
          </Section>
          <LearnBox title="알아보기 · 2N이란?" long>
            <p>UPS-A·B가 평소 절반씩 맡고, 한쪽이 멈추면 다른 쪽이 전부 받습니다. 그래서 한 대를 50% 이하로 운영합니다.</p>
            <p>온라인 이중변환 방식은 평소에도 AC→DC→AC로 변환해 공급하므로 정전 시 절체 시간이 0입니다.</p>
          </LearnBox>
          <Section title="상태 표기" count={4} defaultOpen={false}>
            <div className="k-pills">
              <Status tone="ok">N+1 충족</Status>
              <Status tone="warn">50% 초과</Status>
              <Status tone="crit">정격 초과</Status>
              <Status tone="info">대기</Status>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}
