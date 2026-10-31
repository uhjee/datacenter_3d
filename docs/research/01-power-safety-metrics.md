# 01. 전력 계통 · 방재/보안 · 운영 지표 리서치

> 목적: 교육용 3D 데이터센터 시뮬레이터(web, three.js/React)의 설비 모델링·지표 계산 근거 자료
> 작성일: 2026-10-31 · 표기: **[확인필요]** = 출처 간 수치가 다르거나 원문(법령·표준) 직접 확인이 필요한 항목
> 수치는 "시뮬레이터 기본값"으로 쓸 수 있는 대표값이며, 실제 설계값은 현장/제조사마다 다르다.

---

## 0. 핵심 결론 (TL;DR)

1. **STS는 UPS의 "뒤(하류)"에 있다.** 올바른 순서는 `수배전반 → (ATS/발전기) → UPS → STS → PDU → rPDU → 서버`이다. "수배전반 > STS > UPS > PDU"는 일반적인 구성이 아니다.
2. STS(Static Transfer Switch)는 **서로 독립된 두 UPS 출력(A/B)** 중 하나를 수 ms 안에 골라 **싱글코드(전원선 1개) 부하**에 공급하는 반도체 스위치다. 듀얼코드(PSU 2개) 서버는 A/B를 직접 받으므로 STS가 필요 없다.
3. UPS 앞단에서 상용 전원과 발전기 사이를 바꾸는 것은 **ATS(기계식, 수 초)** 이다. 정전 시 순서는 `정전 → UPS 배터리가 즉시 부하 유지 → 발전기 기동(~10초) → ATS 절체 → UPS가 발전기 전원으로 정류/충전`.
4. 국내 일반 수전은 **한전 22.9kV-Y 특고압**이고, 변압기에서 **380/220V(3상4선)** 로 낮춘다. 하이퍼스케일급은 154kV를 직접 받기도 한다.
5. PUE = 총 시설 전력 / IT 장비 전력. 2024년 전 세계 평균은 **1.56**(Uptime), 국내 우수 사례는 **1.1~1.3** 수준이다.

---

## 1. 전력 계통 (Power Chain)

### 1.1 End-to-End 흐름 (국내 일반형)

```
[한전 22.9kV 배전선로 (2회선: 상용/예비)]
   │
   ▼  ── 수전설비 (특고압반, 전기실) ─────────────────────────────
 ALTS/LBS ─ MOF(계량) ─ PF/LA(피뢰기) ─ VCB(진공차단기)
   │
   ▼
 TR (몰드변압기 22.9kV → 380/220V)        ※대형 냉동기용 22.9kV→6.6kV TR 별도 가능
   │
   ▼  ── 저압반 (LV Switchgear / MDP, 전기실) ─────────────────────
 ACB(주차단기) ─ 저압 메인 버스 ─ MCCB(분기)
   │                                   ▲
   ▼                                   │ 발전기 전원 (380V 또는 6.6kV/22.9kV)
 ATS (상용 ⇄ 비상 절체) ◀──── 비상 디젤 발전기 (발전기실)
   │
   ├──▶ 기계부하(냉동기·펌프·냉각탑): UPS 미경유, 발전기 백업만
   │
   ▼  ── UPS 계통 (UPS실 + 배터리실) ──────────────────────────────
 UPS 입력반 → UPS [정류기 → DC링크(배터리) → 인버터] (+ 바이패스) → UPS 출력반
   │  (A계통 UPS)                         (B계통 UPS)
   ▼                                          ▼
 ┌─────────── 싱글코드 부하가 있을 때만 ───────────┐
 │  STS (A/B 중 택1, 4~8ms 절체) → 싱글코드 부하용 PDU │
 └──────────────────────────────────────────────┘
   ▼                                          ▼
 PDU / RPP / 분전반 (또는 버스웨이)  A          PDU / RPP / 분전반  B   (전산실)
   ▼                                          ▼
 Rack PDU A  ───────────▶  서버 PSU1 / PSU2  ◀───────────  Rack PDU B
```

### 1.2 STS vs UPS 순서 — 사용자 추정 검증

| 구분 | 내용 |
|---|---|
| 사용자 추정 | 수배전반 → STS → UPS → PDU |
| **일반적 실제** | 수배전반 → ATS → **UPS → STS** → PDU |
| 이유 | STS는 반도체(SCR) 스위치로 **두 개의 이미 깨끗하고 동기화된 AC 소스**(주로 UPS A/B)를 1/4 사이클 이내로 바꾼다. UPS 앞(상용 vs 발전기)은 발전기가 기동하는 10초 동안 어차피 전원이 없으므로 고속 절체가 의미 없고, 그 공백은 UPS 배터리가 메운다. 그래서 UPS 앞은 기계식 **ATS**로 충분하다. |
| Vertiv/GE 사례 | Liebert STS2: "두 개의 독립 UPS 하류에서 듀얼버스 부하에 공급", GE Zenith STS-3: "상류 UPS와 하류 PDU/버스웨이 사이" |

**변형(Variants)** — 시뮬레이터에서 옵션으로 표현 가능:

| 변형 | 위치 | 설명 |
|---|---|---|
| ① 중앙형 STS | UPS 출력 → **STS** → PDU | 가장 일반적. STS와 PDU를 합친 **STS-PDU** 일체형 제품도 있음(Vertiv Liebert STS2-PDU) |
| ② 랙형 STS/ATS | rPDU 직전, 랙 내부 | 1U~2U 랙 전환스위치. 싱글코드 장비(네트워크 스위치, 구형 장비) 몇 대만 이중화할 때 |
| ③ STS 없음 | UPS A/B → PDU A/B → rPDU A/B | 모든 IT가 듀얼코드면 STS를 생략. 하이퍼스케일 다수가 이 방식. STS 자체가 단일 고장점이 될 수 있어 사용 최소화하는 설계도 있음(Google 특허 "low STS use") |
| ④ 고압/수전부 STS | 수전부(2개 한전 회선 사이) | ABB 등 대형 MV-STS를 수전점에 두는 사례. 국내에서는 보통 **ALTS(자동부하절체개폐기)** 로 22.9kV 2회선(상용/예비)을 절체 — 드묾 **[확인필요: 국내 적용 빈도]** |

### 1.3 설비별 역할 · 위치 · 표시용 스펙

| 설비 | 한 줄 역할 | 일반 위치 | 표시용 핵심 스펙 (대표값) |
|---|---|---|---|
| 한전 인입 / 수전점 | 22.9kV 특고압 수전, 책임분계점 | 옥외/지하 인입구 → 전기실 | 22.9kV-Y 3상4선, 계약전력(MW) |
| ALTS | 한전 2회선(상용/예비) 자동 절체 | 특고압반(전기실) | 22.9kV, 630A |
| LBS (부하개폐기) | 수전 첫 개폐기, 부하전류 개폐(사고전류 차단 X) | 특고압반 | 22.9kV, 630A |
| MOF (계기용변성기) | 한전 전력량 계량용 PT/CT | 특고압반 | 변성비 |
| LA / PF | 낙뢰·이상전압 보호 / 전력퓨즈 | 특고압반 | 18kV(LA 정격) |
| VCB (진공차단기) | 특고압 사고전류 차단, 변압기 1차 보호 | 특고압반 | 24kV, 630~1250A, 25kA |
| TR (변압기) | 22.9kV → 380/220V 강압 | 전기실(몰드 TR) | 1,000~3,000kVA, 효율 98~99% |
| ACB (기중차단기) | 변압기 2차 / 저압 주차단 | 저압반(전기실) | 380V, 1,600~6,300A |
| MDP / LV Switchgear | 저압 메인버스에서 각 계통으로 분배 | 전기실 | 380V, 버스 정격(A) |
| MCCB (배선용차단기) | 저압 분기 회로 보호 | 저압반·분전반 | 100~800A |
| 비상발전기 (디젤) | 장시간 정전 시 대체 전원 | 발전기실(+ 연료탱크실) | 1,500~3,000kW/대, 기동 ~10초, 연료 12~48h **[확인필요]** |
| ATS | 상용 ⇄ 발전기 기계식 자동 절체 | 전기실(저압반 내) | 380V, 절체 수 초(open transition) |
| UPS (온라인 이중변환) | 무순단 전원 + 전압/주파수 정화 | UPS실 | 200~1,200kVA/대(모듈형 50~250kW 모듈), 효율 94~97%(이중변환), 98~99%(ECO모드), 출력 PF 0.9~1.0 |
| 축전지 (VRLA/Li-ion) | UPS 정전 시 DC 에너지원 | 배터리실(UPS실 인접) | 백업 5~15분 @ 정격부하, DC 400~600V **[확인필요]** |
| STS | 두 UPS 소스 간 고속(≈4~8ms) 반도체 절체 | UPS실 또는 전산실 | 100~1,200A(400~800kVA급) |
| PDU (Power Distribution Unit, 바닥형) | UPS 출력을 랙열로 분기, (선택) 변압기 내장 | 전산실(화이트스페이스) 가장자리 | 150~300kVA, 분기 회로 42~84개 |
| RPP (Remote Power Panel) | PDU 2차측 분기반, 랙열 가까이 배치 | 전산실 랙열 끝 | 분기 차단기 수 |
| 분전반 | 국내 통칭. RPP/PDU 역할의 분기반 | 전산실·전기실 | 380/220V |
| 버스웨이(Busway/Busduct) | 케이블 대신 천장 레일 + 탭오프 박스로 랙에 급전 | 전산실 천장(랙열 위) | 160~800A, 탭오프 단위 |
| Rack PDU (rPDU) | 랙 내부 콘센트 분배, 계측/스위칭 | 랙 후면 수직 장착(0U) | 1상 220V 32A(≈7kVA) / 3상 380V 32A(≈22kVA), 콘센트 C13/C19 |
| 서버 PSU | AC→DC(12V/54V) 변환, A/B 이중 입력 | 서버 내부 | 800~3,000W, 80 PLUS Titanium ≈96% |

**국내 전압 메모**
- 한전 배전: **22.9kV-Y 3상4선 다중접지**. 초대형 센터는 154kV 수전 + 자체 변전소.
- 저압: **3상4선 380V(선간) / 220V(상-중성선)**. 국내는 이미 220V 단상이 나오므로 미국식(480V→208/120V) **변압기 내장 PDU가 필수는 아니다** — 국내는 변압기 없는 분전반형 PDU가 흔함 **[확인필요: 국내 비율]**. 미국은 480V→208V 변압 PDU(Hubbell/Acme 150~1,250kVA) 일반적.
- 대형 냉동기는 고압(6.6kV/3.3kV) 모터를 쓰기도 해 별도 TR이 있을 수 있음.
- 대형 센터는 단순 ATS 대신 **발전기 병렬반(동기화반) + ACB 인터록**으로 절체하기도 한다.

### 1.4 UPS 상세

| 항목 | 내용 |
|---|---|
| 방식 | **온라인 이중변환(Double Conversion)**: AC→DC(정류기)→AC(인버터). 상시 인버터 급전이므로 정전 시 절체시간 0 |
| 내부 경로 | 정상(정류기→인버터) / 배터리(배터리→인버터) / **정적 바이패스**(UPS 고장·과부하 시 입력 직결, 내부 STS) / 유지보수 바이패스(MBP, 수동) |
| 구성 | 단독형, 병렬(N+1), 모듈형(랙형 모듈 추가로 증설) |
| 효율 | 이중변환 94~97%, ECO/Eco-mode 98~99% (단 절체 위험) |
| 부하율 vs 효율 | 저부하(≤30~40%)에서 효율 급락. 최적 구간 대략 40~80% **[확인필요: 기종별 상이]** |

### 1.5 축전지 (배터리실)

| 구분 | VRLA (밀폐형 연축전지) | Li-ion (LFP / NMC) |
|---|---|---|
| 수명 | 설계 10년 표기, 실사용 3~6년 교체 흔함 | 10~15년 |
| 무게/면적 | 무겁고 큼 (Li-ion 대비 2~3배) | 약 1/2~1/3 |
| 온도 | 25°C 기준, 고온 시 수명 급감 | 고온 내성 상대적 우수, BMS 필수 |
| 위험 | 수소 발생(환기 필요), 누액 | **열폭주(Thermal Runaway)**, 재발화, 진압 어려움 |
| 모니터링 | 셀 전압·내부저항·온도 | BMS(셀 전압/온도/SOC/SOH) |

> **국내 사고 사례(교육 콘텐츠 가치 높음)**
> - 2022.10 SK C&C 판교 데이터센터: UPS용 리튬이온 배터리실 화재 → 카카오 서비스 장애.
> - 2025.09.26 국가정보자원관리원 대전 본원: 5층 전산실 UPS 리튬이온 배터리를 지하로 이전하던 중 화재 → 정부 업무시스템 647개 중단. 경찰은 전원 미차단·절연 미조치 과실을 원인으로 발표(사용연한 10년 경과 배터리).
> - 시사점: 배터리실은 **전산실과 방화구획 분리**, 전용 감지/소화, 이설·교체 작업 절차(방전·절연)가 중요. 시뮬레이터의 "배터리실 화재 시나리오" 소재로 적합.

### 1.6 비상발전기

| 항목 | 대표값 / 설명 |
|---|---|
| 연료 | 디젤(경유) 대부분 — 데이터센터 비상전원 시장의 약 81%가 디젤(2025 시장자료). 가스/HVO 대안 증가 |
| 기동시간 | 정전 감지 → 기동 → **10초 이내 정격 전압·주파수 확립** 목표 (NFPA 110 Type 10 개념, Tier III/IV 설계에서 통용) |
| 운전 순서 | 정전 → UPS 배터리 운전 → 발전기 기동(~10s) → ATS 절체 → 순차 부하 투입(step load) → 냉동기 재기동 |
| 연료 저장 | Uptime Tier 기준 현장 연료 **최소 12시간** 보유가 흔히 인용됨, 실무는 24~72h 또는 그 이상(사례: 5일) **[확인필요: Tier Standard 원문]** |
| 용량 | 대당 1~3MW, N+1 또는 2N로 배치 |
| 표시 스펙 | 정격 kW/kVA, 연료잔량(%), 운전시간(h), 냉각수온도, 배터리(시동용) 전압 |

### 1.7 이중화(Redundancy) 및 Tier

| 용어 | 의미 | 예 (부하 1,000kW, 모듈 500kW) |
|---|---|---|
| N | 부하를 겨우 감당하는 수량 | UPS 2대 |
| N+1 | N + 예비 1대 | UPS 3대 (1대 고장/점검해도 OK) |
| 2N | 독립된 완전 동일 계통 2개 (A/B) | A계통 2대 + B계통 2대 |
| 2(N+1) | 각 계통이 N+1 | A 3대 + B 3대 |
| A/B Feed | 서버 PSU 2개가 서로 다른 계통(A/B)에서 급전 | rPDU A(좌측), rPDU B(우측) — 색 구분 흔함 |

| Tier (Uptime Institute) | 명칭 | 핵심 요건 | 흔히 인용되는 가용성 |
|---|---|---|---|
| Tier I | Basic Capacity | 전용 인프라, UPS·발전기 있음, 이중화 없음 | 99.671% |
| Tier II | Redundant Capacity Components | 핵심 구성품(UPS, 발전기, 냉동기, 펌프) 이중화, 경로는 단일 | 99.741% |
| Tier III | **Concurrently Maintainable** | 어떤 구성품/경로도 IT 중단 없이 계획 정비 가능 (N+1, 복수 경로 중 1개 활성 가능) | 99.982% |
| Tier IV | **Fault Tolerant** | 단일 고장(및 그 파급)에도 IT 무중단 (사실상 2N 수준, 계통 물리 분리·구획) | 99.995% |

> 주의: Uptime 공식 정의는 "N+1/2N" 같은 비율이 아니라 **성능 목표(동시 정비성, 내고장성)** 이다. 가용성 %는 업계 벤치마크 참조치이지 보증값이 아니다(Uptime Journal). Tier III=N+1, Tier IV=2N은 단순화된 통념.

---

## 2. 방재 / 보안 (Fire & Security)

### 2.1 화재 감지

| 감지기 | 원리 | 데이터센터 사용 |
|---|---|---|
| 광전식 스포트형 연기감지기 | 챔버 내 연기 입자의 빛 산란 감지 | 전산실 천장·이중마루 하부 기본 |
| 이온화식 연기감지기 | 방사선원 이온 전류 변화 | 구형. 신규 설치 감소 **[확인필요]** |
| 열감지기 (차동식/정온식/보상식) | 온도 상승률 / 일정 온도 | 배터리실, 발전기실, 전기실 보조 |
| 불꽃감지기 (UV/IR) | 화염 복사 감지 | 발전기실·연료탱크실 |
| **공기흡입형 (ASD, 예: VESDA)** | 배관 샘플링 홀로 공기를 흡입해 중앙 검출기(레이저)로 극미량 연기 측정 | 고풍량 전산실에서 연기 희석 문제 보완. EN 54-20 Class A/B(고감도) 등급, 다단계 경보(Alert→Action→Fire1→Fire2), 섹터(배관별) 위치 식별 |

- **교차회로 방식(국내 가스계 소화의 일반 기동 로직)**: 감지기 회로 A, B 두 개가 **모두** 동작해야 자동 기동 → 오방출 방지.
- 시뮬레이터 시나리오: `VESDA Alert(조기) → 연기감지기 A 동작(1차 경보) → B 동작(2차) → 사이렌 + 방출지연 타이머 → 방출 → 압력스위치 → 방출표시등 점등`.

### 2.2 가스계 소화설비 (청정소화약제)

하론(Halon 1301)은 오존층 파괴로 생산 중단 → 국내 기준명 **「할로겐화합물 및 불활성기체 소화설비」(NFPC/NFTC 107A)**. 현장에서는 지금도 관습적으로 "하론", "하론 방출 표시등"이라 부른다.

| 약제 | 계열 | 상품명 | 최소설계농도(대표) | GWP | 저장 / 특징 |
|---|---|---|---|---|---|
| HFC-23 | 할로겐화합물(HFC) | FE-13 | 약 16~18% **[확인필요]** | 매우 높음(≈12,000~14,800) **[확인필요]** | 증기압 높아 자체 압력 방출, 장거리 배관·저온 유리. 국내 적용 많음 |
| HFC-227ea | 할로겐화합물(HFC) | FM-200 | A급 6.7%, C급 7.0% (NFPA 2001), 실무 7~9% | ≈3,220 | 질소 가압 액체 저장. 키갈리 개정에 따른 HFC 감축 대상 |
| FK-5-1-12 | 할로겐화합물(FK) | Novec 1230 | A급 4.5%, C급 4.7%, 실무 4~6% | ≈1 | 상온 액체, 대기수명 수일. 3M의 PFAS 사업 철수(2025 말) 이슈, 타사 FK-5-1-12 공급 **[확인필요]** |
| IG-541 | 불활성기체 | Inergen | A급 34.2%, C급 38.5% | 0 | N₂ 52% + Ar 40% + CO₂ 8%. 산소를 12~15%로 낮춰 진화(인명 호흡 가능 범위). 고압 실린더 다수 → 저장실 면적 큼 |

- 방출시간(국내 NFTC 107A 취지): 할로겐화합물 **10초 이내**, 불활성기체 A·C급 **2분 이내**에 최소설계농도 95% 방출 **[확인필요: 원문 조항]**.
- CO₂ 소화설비는 인명 위험이 커서 유인 전산실에는 부적합(국내 인명사고 연구 다수).

### 2.3 가스계 소화 구성품

| 구성품 | 역할 | 위치 |
|---|---|---|
| 소화약제 저장용기 (실린더) | 약제 저장, 용기밸브 + 기동용기(솔레노이드) | **소화약제 저장용기실** (방호구역 밖, 출입 용이, 온도 관리) |
| 기동용기 / 솔레노이드 밸브 | 제어반 신호로 기동가스 방출 → 저장용기 밸브 개방 | 저장용기실 |
| 선택밸브 | 다수 방호구역 공유 시 해당 구역 배관 선택 | 저장용기실 |
| 분사헤드 | 방호구역 천장/이중마루 하부로 약제 분사 | 전산실 등 방호구역 |
| **압력스위치** | 방출 배관 압력으로 "실제 방출" 확인 → 방출표시등·제어반 신호 | 저장용기실 배관 |
| **방출표시등** (소화약제 방출표시등, 통칭 "하론 방출 표시등") | 약제 방출 시 점등, "가스 방출중 입실금지" | 방호구역 **출입문 상부(외부)** |
| **수동조작함** (수동식 기동장치) | 사람이 직접 기동하는 푸시버튼/레버, 보호커버 | 방호구역 출입구 부근(외부) |
| **방출지연스위치** (비상정지/Abort) | 방출 카운트다운 중 누르고 있으면 방출 지연 | 수동조작함 부근 |
| 사이렌 / 음향경보장치 | 방출 전 대피 경보 | 방호구역 내부 |
| 가스계 수신반 / 제어반 | 교차회로 감지, 지연 타이머, 기동 출력 | 방재실 또는 저장용기실 |
| 피압배출구 / 과압배출구 | 방출 시 실내 과압 방지 (특히 불활성기체) | 방호구역 벽체 |
| 자동폐쇄장치 (댐퍼, 도어클로저) | 방출 전 개구부 차단해 농도 유지 | 방호구역 경계 |

- 방출지연 타이머: 실무상 **20~30초** 카운트다운 **[확인필요: NFTC 기준 수치]**.

### 2.4 누수 감지 (Leak Detection)

| 항목 | 내용 |
|---|---|
| 감지선(케이블형) | 이중마루 하부, 항온항습기(CRAC/CRAH) 주변, 냉수 배관 하부에 띠처럼 포설. 컨트롤러가 **누수 위치(m)** 를 표시 |
| 스포트형 | 특정 지점(드레인팬, 배관 밸브) 점 감지 |
| 연동 | BMS/DCIM 경보, 일부 솔레노이드 밸브 자동 차단 |
| 시뮬레이터 표시 | 감지선 경로(라인), 누수 지점 마커, "Zone/거리 23.5m" 표기 |

### 2.5 물리 보안

| 계층 | 설비 | 설명 |
|---|---|---|
| 외곽 | 펜스, 차량 차단기, CCTV, 경비실 | 부지 경계 |
| 건물 출입 | 출입카드(RFID), 방문자 등록, 스피드게이트(테일게이팅 방지) | 로비 |
| 전산실 진입 | **맨트랩(Mantrap/인터록 이중문)**, 생체인증(지문·안면·정맥), 2단계 인증(카드+생체) | 전산실 입구 |
| 전산실 내부 | CCTV(랙열·출입구), 케이지(코로케이션 고객 구역), 랙 도어 잠금(기계식/전자식 손잡이 락) | 화이트스페이스 |
| 기록 | 출입 로그, 영상 보관 (실무 30~90일) **[확인필요]** | 보안 관제실 |

---

## 3. 운영 지표 / 개념

### 3.1 PUE (Power Usage Effectiveness)

```
PUE  = 총 시설 전력(Total Facility Power) / IT 장비 전력(IT Equipment Power)
DCiE = 1 / PUE × 100 (%)            예) PUE 1.5 → DCiE 66.7%
비IT 오버헤드 = IT전력 × (PUE − 1)  예) IT 1,000kW, PUE 1.5 → 냉각·손실 500kW
```

- 정의 주체: The Green Grid(2007), ISO/IEC 30134-2로 표준화. 이론적 최솟값 1.0.
- 측정 위치: 총 시설 = 수전점(한전 계량), IT = UPS 출력 또는 PDU/rPDU 출력(측정 위치에 따라 레벨 1/2/3).
- 연간 에너지(kWh) 기준이 정석이며, 순간값(kW)은 계절·부하에 따라 변동.

| 구분 | 값 | 비고 |
|---|---|---|
| 전 세계 평균 (Uptime 2024 조사) | **1.56** | 5년째 정체 |
| 국내 평균 (구 추정) | 2.3 / 1.91 / 1.8 | 지식경제부 추정 2.3, 한국IT서비스산업협회 1.91 등 — 출처·연도 상이 **[확인필요]** |
| 국내 우수: 네이버 각 춘천 | 1.09~1.12 | 외기냉각 |
| 국내 우수: 카카오 데이터센터 안산 | ≤1.3 | ESG 보고서 |
| NHN (2020~) | 1.32 | 평균 |
| 하이퍼스케일 (Google 등) | ≈1.1 | |

시뮬레이터 등급 예시(참고용, 업계에서 흔히 쓰는 구분 — 공식 표준 아님): `≤1.2 매우 우수 · 1.2~1.5 우수 · 1.5~2.0 보통 · >2.0 비효율`.

### 3.2 냉각 용량

| 개념 | 식 / 값 |
|---|---|
| 발열 ≈ 소비전력 | IT 1kW 소비 ≈ 1kW 발열 (거의 전부 열로 변환) |
| 냉동톤 | **1 USRT = 12,000 BTU/h = 3,024 kcal/h ≈ 3.517 kW** |
| 일본식 냉동톤 | 1 JRT = 3,320 kcal/h ≈ 3.86 kW — 국내 자료에서 혼용되므로 기준 명시 필요 |
| 필요 냉각 RT | `RT = 열부하(kW) / 3.517` 예) 500kW → 약 142 RT |
| 냉각 여유율 | `여유율(%) = (설치 냉각용량 − 열부하) / 설치 냉각용량 × 100` |
| 냉각 이중화 | 항온항습기/CRAH N+1 (예: 6대 필요 → 7대 설치), 냉동기 N+1 |
| 권장 흡기온도 | ASHRAE 권장 범위 **18~27°C** (서버 흡기 기준) |

랙당 밀도(kW/rack):

| 구분 | 대표값 |
|---|---|
| 업계 평균 (Uptime 2024) | 8kW 미만 (가장 흔한 대역 7~9kW, 과거 ~5kW에서 상승) |
| 일반 공랭 실용 한계 | ~15~20kW (컨테인먼트 적용 시) **[확인필요]** |
| 고밀도 | 30kW 이상 — 대부분 시설에는 거의 없음 |
| AI/GPU 랙 | 40~130kW+, 수랭(DLC)/액침 필요 **[확인필요: 제품별]** |

시뮬레이터 기본 공식:
```
냉각 부하율(%) = 실제 열부하(kW) / 가용 냉각용량(kW, 이중화 예비 제외) × 100
경보 기준 예: ≥80% 주의, ≥90% 경고
```

### 3.3 공간 용량

| 항목 | 값 |
|---|---|
| 1U | **1.75 in = 44.45 mm** (EIA-310) |
| 19인치 랙 레일 | 장비 폭 19in(482.6mm) 기준 |
| 42U 랙 | 외형 높이 약 2,000mm |
| 47U 랙 | 외형 높이 약 2,200mm |
| 랙 외형 | W 600(서버) / 800(네트워크) × D 1,000~1,200 mm |
| 랙 1대 점유(통로 포함) | 약 2.5~3.0 ㎡/rack (화이트스페이스 기준) **[확인필요: 레이아웃별]** |
| 배치 | Hot aisle / Cold aisle, 이중마루 600×600mm 타일 |

```
랙 공간 사용률(%) = 사용 U / 전체 U × 100
전산실 랙 사용률(%) = 설치(사용) 랙 수 / 수용 가능 랙 수 × 100
```

### 3.4 3대 용량 균형과 Stranded Capacity

- **전력 · 냉각 · 공간**(+ 네트워크 포트)을 동시에 관리해야 한다. 셋 중 하나가 먼저 소진되면 나머지는 남아도 쓸 수 없다.
- **Stranded Capacity(좌초 용량)**: 설치는 되어 있지만 설계/배치 불균형 때문에 IT 부하에 쓸 수 없는 용량.
  - 예1: 랙 공간은 남았는데 해당 열의 PDU 전력이 소진 → 공간 stranded.
  - 예2: 고밀도 랙 몇 개로 전력은 다 썼는데 랙은 절반이 빈 상태 → 공간·냉각 stranded.
  - 예3: 냉각용량은 충분한데 핫스팟 때문에 특정 랙에 더 못 넣음 → 냉각 stranded.
- 시뮬레이터 계산 예:
```
가용 용량 = min(전력 잔여, 냉각 잔여, 공간 잔여를 같은 단위로 환산)
Stranded(자원 X) = X 잔여 − 병목 자원 기준으로 실제 사용 가능한 X
```

### 3.5 전력 용량 관리

| 지표 | 식 / 권장값 |
|---|---|
| UPS 부하율 | `부하율(%) = UPS 출력(kW) / UPS 정격(kW) × 100` |
| kVA ↔ kW | `kW = kVA × PF`, 최신 UPS 출력 PF 0.9~1.0 |
| 단독/N+1 권장 최대 | 통상 **≤80%** (증설·돌입 여유). N+1은 "예비 1대 빼고" 계산: `부하 ≤ N대 용량` |
| **2N 권장 최대** | 각 계통 **≤50%** (한쪽이 죽으면 다른 쪽이 100%를 받아야 함). 실무 목표 40~45% |
| 2N 실제 운영 | 조사상 2N 시설은 평균 20~40% 부하로 운영 → 저효율 구간 |
| 차단기·분기회로 | 연속부하 **80% 디레이팅** 관례(NEC 기준; 국내 KEC 적용 여부 **[확인필요]**) |
| rPDU 용량 | 1상 220V 32A → 220×32 ≈ 7.0kVA, 80% 적용 ≈ 5.6kVA |
| 3상 rPDU 용량 | `√3 × 380V × 32A ≈ 21.1kVA`, 80% ≈ 16.9kVA |
| A/B 부하 | 듀얼코드 서버는 A/B에 반씩 나눠 걸리므로, 한쪽 rPDU 부하가 **≤50%(디레이팅 감안 40%)** 여야 한쪽 장애 시 전량 수용 |

시뮬레이터용 대표 파라미터 세트(예시):
```
IT 부하 1,000 kW, 랙 125대 × 평균 8 kW
UPS: 2N, 계통당 2 × 600 kVA(PF 1.0) → 계통당 1,200 kW, 정상 시 각 41.7%
발전기: 3 × 2,000 kW (N+1)
냉각: CRAH 10대 × 120 kW (N+1 → 가용 1,080 kW, 여유율 7%)
PUE 1.45 → 총 시설 1,450 kW
```

---

## 4. 시뮬레이터 적용 메모

- 전력 흐름 애니메이션은 **ATS → UPS → (STS) → PDU** 순서를 지키고, STS는 "싱글코드 부하가 있는 경우" 옵션 노드로 둔다.
- 정전 시나리오 타임라인: `t=0 정전 / 0s UPS 배터리 / ~10s 발전기 전압확립 / ~10~15s ATS 절체 / 이후 순차 부하투입 / 배터리 재충전`.
- 방재 시나리오: 교차회로 → 지연 타이머 → 방출 → 압력스위치 → 방출표시등. 수동조작함·방출지연스위치를 상호작용 오브젝트로.
- 공간 배치: 전기실(특고압반·TR·저압반), 발전기실, UPS실, 배터리실(분리 구획), 소화약제 저장용기실, 전산실(랙·PDU·CRAH), 방재/관제실.

---

## 5. 출처 (Sources)

전력 계통 / STS
- GE Zenith STS-3 / STS-1 발표: https://www.ge.com/news/press-releases/ge-introduces-new-ge-zenith-sts-3-and-sts-1-series-static-transfer-switches-critical
- Vertiv Liebert STS2: https://vertiv.com/en-ca/products-catalog/critical-power/static-transfer-switches/liebert-sts2-statictransfer-switch
- Vertiv Liebert STS2-PDU: https://vertiv.com/en-ca/products-catalog/critical-power/static-transfer-switches/liebert-sts2-pdu-static-transfer-switch-power-distribution-unit
- ABB 대형 STS 기술자료: https://library.e.abb.com/public/78252e61f93fe934c1257c5a0041002d/34-39%204m331_EN_72dpi.pdf
- Google 특허 "Data center topology with low STS use": https://patents.google.com/patent/US20120242151A1/en
- 랙형 STS(TRG): https://www.trgdatacenters.com/?p=72456
- Eaton 바닥형 PDU FAQ: https://ssl-uk.eaton.com/us/en-us/products/backup-power-ups-surge-it-power-distribution/power-distribution-for-it-equipment/power-distribution-unit-faq/cabinet---floor-standing-pdu-solutions.html
- 2N UPS 이중 버스 분석 논문: https://www.atlantis-press.com/article/55911415.pdf
- 22.9kV 수배전 구성 실무 Q&A(코멘토): https://comento.kr/job-questions/%EB%AA%A8%EB%93%A0%ED%9A%8C%EC%82%AC/%EC%A0%84%EA%B8%B0%EC%A0%9C%EC%96%B4/%EA%B3%A0%EC%95%95_%ED%8C%90%EB%84%AC-634219
- 22.9kV 수배전반 구획 특허 KR200434542Y1: https://patents.google.com/patent/KR200434542Y1/ko
- Hubbell/Acme 변압기 PDU: https://www.hubbell.com/hubbell/en/products/power-distribution-unit-transformer-150-1250-kva/p/14621915
- 발전기/백업 전원 전략(Introl): https://introl.com/ko/blog/backup-power-strategy-ai-ups-generator-battery-2025
- MTU 데이터센터 발전기 사례(연료 5일): https://mtu-solutions.com/na/en/casestudies/powergen/mtu_provides_emergency_backup_solution_for_the_largest_data_centre_in_south_australia.html
- 데이터센터 발전기 시장(디젤 비중): https://giikorea.co.kr/report/mama2076873-data-center-generators-market-by-type-diesel.html

Tier / 이중화
- Uptime Institute Journal, Tier Classification 설명: https://journal.uptimeinstitute.com/?p=3737
- Uptime(IEA 발표자료): https://nex75.iea-ebc.org/Data/Sites/4/media/events/2020-10/presentations/1.4b--traver--uptime-institute.pdf
- DCD, Tier 분류 이해: https://datacenterdynamics.com/en/analysis/understanding-data-center-tier-classifications

UPS 부하율
- TechTarget, UPS 사이징: https://www.techtarget.com/searchdatacenter/answer/What-to-do-when-UPS-sizing-goes-wrong
- FMLink, 대형 UPS 운영비: https://www.fmlink.com/strategies-for-reducing-operating-costs-through-large-ups-systems/
- PFM, Power Curve: https://www.pfmonthenet.net/article/16021/Power-Curve.aspx

배터리 화재 사례
- 국정자원 화재(다음/노컷 등): https://v.daum.net/v/20250927135958509 , https://v.daum.net/v/20250929185846621?f=p
- 디지털데일리, 3년 만에 또 데이터센터 화재: https://www.ddaily.co.kr/page/view/2025093016054555607

방재
- VESDA / ASD 등급(Eurofyre): https://eurofyre.co.uk/news/vesda-the-right-choice-for-data-centers-and-communication-infrastructure/
- Honeywell VESDA-E VES: https://securityandfire.honeywell.com:443/notifier/en-us/browseallcategories/aspirating-smoke-detection/vesda-e/conventional-vesda-e-ves
- 청정소화약제 비교(PDH, NFPA 2001 설계농도): https://pdhonline.com/courses/m463/Clean%20Agents%20in%20Total%20Flooding%20Applications%20-%20Robin.pdf
- CSE, 청정소화약제 선정: https://www.csemag.com/articles/selecting-the-correct-clean-agent-suppression-system/
- FM-200 단계적 감축: https://firesystems.net/2025/02/18/the-fm-200-phase-out-what-it-means-for-your-fire-suppression-system/amp/
- Fike 가스계 설계 자료: https://ewh.ieee.org/soc/pes/newyork/Archive%20Docs/Fire%20Protection%20Design%20-%20Fike%20Corp.pdf
- EN 12094-10 (압력계/압력스위치): https://knowledge.bsigroup.com/products/fixed-firefighting-systems-components-for-gas-extinguishing-systems-requirements-and-test-methods-for-pressure-gauges-and-pressure-switches
- Viking, 수동기동 시 방출확인 압력스위치(NFPA 2001): https://www.vikinggroupinc.com/sites/default/files/documents/F_010919.pdf
- 한국소방산업기술원 질의응답 자료: https://kfpa.or.kr/mem/pdf_file/H/129/H129_16.pdf
- 가스계 소화설비 인명안전 연구: https://koreascience.kr/article/JAKO200772065686974.pdf
- 원문 확인 권장: 국가법령정보센터 NFTC 106(이산화탄소), NFTC 107A(할로겐화합물 및 불활성기체)

운영 지표
- Uptime Global Data Center Survey 2024 보고서: https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2024.GlobalDataCenterSurvey.Report.pdf
- Uptime 2024 설문 보도(PUE 1.56, 랙 밀도 <8kW): https://www.businesswire.com/news/home/20240730874079/en
- Upsite, 랙 밀도·PUE 추세: https://www.upsite.com/blog/data-center-trends-rack-density-rises-while-pue-and-outage-frequency-remain-flat/
- Uptime Journal, Rack density is rising: https://journal.uptimeinstitute.com/rack-density-is-rising/
- Vertiv, PUE란: https://www.vertiv.com/ko-asia/about/news-and-insights/articles/educational-articles/what-is-pue-power-usage-effectiveness-and-what-does-it-measure/
- 국내 평균 PUE 2.3 보도(지디넷): https://zdnet.co.kr/view/?no=20230303112906
- 국내 PUE 1.8 (데일리안, LG CNS): https://www.dailian.co.kr/news/view/475789/
- 네이버 각: https://navercorp.com/tech/datacenterGak
- 네이버 각 춘천 PUE 1.1(파이낸셜뉴스): https://www.fnnews.com/news/202306191903058461
- 카카오 데이터센터 안산 친환경 설계: https://www.kakaocorp.com/page/detail/10861
- 냉동톤 환산(히타치): https://www.hitachi.co.jp/New/cnews/month/2007/03/0328.html
- Stranded capacity(AKCP): https://www.akcp.com/blog/understanding-stranded-capacity/
- Stranded capacity(DCK): https://www.datacenterknowledge.com/industry-perspectives/dont-leave-me-stranded-risk-unused-data-center-assets
- Upsite, Cooling Capacity Factor: https://www.upsite.com/?p=9131
