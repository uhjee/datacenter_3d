# 02. 공조(냉각) 리서치 및 참고 서비스·UX 조사

> 목적: 교육용 3D 데이터센터 시뮬레이터(three.js + React + TypeScript)의 **공조 레이어** 모델링 근거와 참고 UX 수집.
> 작성일: 2026-10-31. 표기 규칙: **[확인]** = 1차 자료(표준·공식 문서)로 확인, **[일반]** = 업계 통상값(복수 2차 자료), **[불확실]** = 출처 간 편차 크거나 1차 자료 미확인.

---

## 1. 공조(Cooling / HVAC)

### 1.1 열이 버려지는 전체 경로 (큰 그림)

```
서버(IT) ──열──▶ 실내 공기 ──▶ CRAH 코일 ──▶ 냉수(Chilled Water) 루프
      ──▶ 냉동기(Chiller) 증발기 → 압축기 → 응축기 ──▶ 냉각수(Condenser Water) 루프
      ──▶ 냉각탑(Cooling Tower) ──▶ 대기
```

- 냉수 루프가 서버실 열을 받아 냉동기로 보내고, 냉동기는 이를 냉각수 루프로 넘겨 냉각탑에서 대기로 방출하는 **2개 물 루프 구조**가 일반적이다 [일반] (MathWorks Data Center Cooling 예제, Uptime Institute).
- DX(직팽식) CRAC는 물 루프 없이 **냉매 배관 → 실외기(응축기)** 로 바로 열을 버린다.
- 시뮬레이터에서는 이 체인을 "열의 릴레이"로 시각화하면 초보자 이해가 쉽다(§3 참고).

### 1.2 주요 장비 정리

| 장비 | 한국 현장 용어 | 냉각 매체 | 핵심 동작 | 시뮬레이터 표현 포인트 |
|---|---|---|---|---|
| **CRAC** (Computer Room Air Conditioner) | 항온항습기 (공냉식/DX, 냉매형) | 냉매 | 유닛 **내부에 압축기**. 냉매 배관으로 **실외기(응축기)** 에 연결되어 열 방출 | 실내기 ↔ 실외기 냉매 배관(2가닥) |
| **CRAH** (Computer Room Air Handler) | 항온항습기 (수냉식/냉수형) | 냉수 | 압축기 없음. **팬 + 냉수 코일**. 중앙 냉동기 플랜트에서 냉수 공급 | 냉수 공급/환수 배관(파랑/빨강) |
| **냉동기 (Chiller)** | 냉동기, 터보냉동기 | 냉매↔물 | 냉수를 만들어(예: 공급 7℃ 내외) 열을 냉각수로 넘김 | 기계실 대형 장비 |
| **냉각탑 (Cooling Tower)** | 냉각탑 | 물(증발) | 냉각수를 증발 냉각해 대기로 열 방출. 동절기 동결 방지로 글리콜 사용 경우 있음 | 옥상 장비, 수증기 파티클 |
| **냉수/냉각수 펌프** | 1차/2차 펌프 | 물 | 1차(정유량, 냉동기측) – 2차(변유량, 부하측) 구성이 대규모에서 흔함 | 배관 위 흐름 화살표 |
| **판형 열교환기 (Free cooling HX)** | 프리쿨링 열교환기 | 물↔물 | 외기가 충분히 차가우면 냉각탑 물로 냉수를 직접 냉각, **냉동기 우회** | 계절 토글 시 배관 경로 변경 |
| **인로우 쿨러 (In-row)** | 인로우 냉방기 | 냉수 또는 냉매 | 랙 열 사이에 랙 폭(300/600mm)으로 설치, 열복도 공기를 바로 흡입·냉각 | 랙 사이 슬림 유닛 |
| **리어도어 열교환기 (RDHx)** | 후면 도어 쿨러 | 냉수 | 랙 후면 문에 코일. 배기열을 랙에서 바로 제거 (패시브/액티브 팬형) | 랙 뒷문 색상 변화 |
| **D2C (Direct-to-Chip)** | 칩 직접 액체냉각 | 냉각액 | CPU/GPU 콜드플레이트로 열 직접 회수, CDU 경유 | 랙 내부 호스 |
| **액침 냉각 (Immersion)** | 액침 냉각 | 절연유 등 | 서버를 절연 액체에 담금 (단상/2상) | 탱크형 랙 |

- CRAC vs CRAH 핵심 차이는 **냉매(압축기 내장) vs 냉수(외부 플랜트)**. DX는 중앙 플랜트가 필요 없어 소규모에 유리, CRAH는 대규모에서 효율적이지만 배관·펌프·플랜트 CAPEX가 크다 [일반] (TechTarget, Dataspan). 냉수 코일을 보조로 갖는 하이브리드 CRAC도 있다.
- 한국 현장에서는 CRAC/CRAH를 구분 없이 **"항온항습기"** 로 부르는 경우가 많다(온도+습도 동시 제어 기능 때문). 교육용 UI에서는 "항온항습기(CRAH, 냉수형)"처럼 병기 권장.

#### 랙 밀도별 적용 범위 (대략)

| 방식 | 랙당 처리 가능 열부하(대략) | 비고 |
|---|---|---|
| 이중마루 하부급기 + 봉쇄 없음 | ~5–10 kW [불확실] | 전통적 레이아웃 |
| 인로우 + 봉쇄(Containment) | ~15–25 kW [불확실] | 2차 자료 |
| 리어도어(RDHx) | 패시브 ~20 kW, 액티브/냉수 40–55 kW 내외 [불확실] | 냉수 입구온도에 따라 크게 달라짐 (Schroff, Vertiv 제품 사양 인용) |
| D2C 액체냉각 | ~50–130+ kW (예: NVIDIA GB200 NVL72 ≈ 120–132 kW/rack) [불확실] | 열의 약 70–90%를 액체로 회수, 나머지는 공기 |
| 액침 | ~100–200 kW 이상 [불확실] | 벤더 수치 위주 |

> 위 수치는 대부분 벤더 자료. 시뮬레이터에서는 "공랭 한계 ≈ 20–30 kW/rack 이상이면 액체냉각 필요" 정도의 **정성적 메시지**로만 사용 권장.

### 1.3 프리쿨링 (Free Cooling / Economizer)

- **수측 이코노마이저(Water-side)**: 외기 습구온도가 낮을 때 냉각탑 냉각수로 판형 열교환기를 통해 냉수를 직접 생성, 냉동기를 끄거나(Full) 보조(Partial/Series)로 운전 [일반] (ENERGY STAR, Alfa Laval).
  - 직렬 배치로 부분 프리쿨링 시간을 늘린 사례: 연 2,800h → 약 5,000h (EI Associates 사례, 벤더 수치).
  - 국내 연구: 냉동기–열교환기 직렬 구성으로 Full/Partial 프리쿨링 시 에너지 13.7% 절감 (경상국립대 논문).
- **공기측 이코노마이저(Air-side)**: 외기를 필터링해 직접/간접 도입. (본 조사 범위에서 간략히만 언급)
- ASHRAE 액체냉각 등급 W17/W27은 "냉동기+냉각탑 + 선택적 수측 이코노마이저", W32 이상은 "대부분 냉동기 없이 운전"으로 정의 [확인] (ASHRAE TC9.9 5th Ed. Reference Card, Table 3.1).
- 시뮬레이터 아이디어: **외기온도 슬라이더** → 일정 온도 이하에서 냉동기 아이콘이 꺼지고 열교환기 경로가 활성화, PUE 하락.

### 1.4 냉수 배관 루프 (통상 설계값)

| 항목 | 통상값 | 신뢰도 |
|---|---|---|
| 냉수 공급/환수 (전통 설계) | 7℃ / 12℃ (ΔT ≈ 5℃) | [일반] 국내 HVAC 관행. 1차 자료 미확인 |
| 냉수 ΔT (미국 자료) | 10–12°F (≈ 5.5–6.7℃) | [불확실] 2차 자료 |
| 최신 고온 냉수 설계 | 공급 10–18℃ 이상으로 상향 추세 (프리쿨링 시간 증가) | [일반] |
| 냉각수 (냉각탑) | 32℃ 입수 / 37℃ 출수 (국내 표준 설계 관행) | [불확실] |

### 1.5 이중마루 (Raised / Access Floor)

| 항목 | 값 | 신뢰도/출처 |
|---|---|---|
| 패널 규격 | 600 × 600 mm (2ft × 2ft) | [일반] |
| 높이 (일반 서버실) | 국내 400–600 mm가 흔함, 해외 권고는 최소 18in(≈450mm), 선호 24–30in(≈600–750mm) | [일반] TechTarget 전문가 답변 |
| 높이 (고밀도 UFAD) | 24–48in (≈600–1,200mm) | [불확실] Urbanek 학회 논문 |
| 타공판 개구율 | **25%** (표준 타공판), **56%** 내외 (그레이팅/고개구율) | [일반] Chatsworth, Accu-Tech. 저밀도 25%, 고밀도 56% 권장 경향 |
| 타공판 1장 풍량 | 하부 정압에 따라 수백 CFM 수준 (25% 타공판 ≈ 200–500 CFM) | [불확실] 정압 의존, 시뮬레이터 파라미터로만 사용 |

- 하부 공간은 **급기 플레넘** + 케이블/배관 통로. 케이블이 과밀하면 풍량을 막음 → 최근엔 케이블을 상부 트레이로 올리는 추세.
- 최근 하이퍼스케일은 **이중마루 없이(slab floor)** 상부/측면 급기 + 열복도 봉쇄를 쓰는 경우도 많음 [일반]. 교육용으로는 이중마루 모델이 흐름 설명에 가장 직관적.

### 1.6 급기/환기 방식

| 방식 | 설명 |
|---|---|
| **하부 급기 (Underfloor supply)** | CRAH가 이중마루 하부로 냉기 토출 → 냉복도 타공판으로 상승 |
| **상부 리턴 (Room return)** | 뜨거운 공기가 실내 상부로 올라가 CRAH 상단 흡입구로 복귀 (열복도 봉쇄 없을 때 혼합 많음) |
| **천장 리턴 플레넘 (Ceiling plenum return)** | 열복도 상부 천장에 리턴 그릴 → 천장 공간(플레넘) → CRAH 상부 덕트로 복귀. HAC와 결합 시 효과 최대 |

- "냉기는 바닥으로 공급, 열기는 상부로 배출"이 국내 IDC의 일반 구조로 기술됨 (KR20180117853A 특허 배경기술).

### 1.7 Hot Aisle / Cold Aisle 배치와 봉쇄(Containment)

- 랙은 **전면 흡기 → 후면 배기**. 랙 열을 마주보게(front-to-front) 배치해 **냉복도(Cold aisle)** 와 **열복도(Hot aisle)** 를 교대로 만든다.
- 타공판은 **냉복도에만** 깐다(열복도에 두면 바이패스 발생).

| 구분 | CAC (Cold Aisle Containment) | HAC (Hot Aisle Containment) |
|---|---|---|
| 봉쇄 대상 | 냉복도 (지붕+양끝 도어) | 열복도 (지붕/굴뚝+도어) |
| 나머지 실내 온도 | **뜨거움** (실내 전체가 리턴 공간) | **시원함** (실내가 급기 공간) |
| 리턴 경로 | 실내 상부 → CRAH | 천장 플레넘/덕트 또는 인로우로 직결 |
| 장점 | 기존 이중마루 시설에 **개조(retrofit) 용이** | 이코노마이저 시간↑, 작업자 쾌적, Schneider는 냉각 에너지 43% 절감·PUE 15%↓ 주장 |
| 단점 | 비봉쇄 장비(테이프, 벽 장비)가 고온 노출 | 천장 플레넘/덕트 필요, 열복도 작업 환경 고온 |
| 논쟁 | Emerson(현 Vertiv) 백서는 CAC 우위 주장 | Schneider WP135는 신규 시설 HAC 권장 |

> HAC/CAC 우열은 **벤더 간 논쟁**(Schneider vs Emerson). 교육 콘텐츠에선 "둘 다 목적은 냉·온기 혼합 차단"으로 중립적으로 설명하는 것이 안전.

#### 블랭킹 패널, 바이패스, 재순환

| 문제 | 정의 | 원인 | 대책 |
|---|---|---|---|
| **바이패스 (Bypass airflow)** | 냉기가 서버를 거치지 않고 CRAH로 바로 복귀 | 열복도 타공판, 케이블 컷아웃 미밀봉, 과잉 급기 | 컷아웃 그로밋, 타공판 재배치, 봉쇄 |
| **재순환 (Recirculation)** | 서버 배기(열기)가 다시 서버 흡기로 유입 | 랙 내부 빈 U 공간, 랙 사이 틈, 열 끝단(row end) 우회, 급기 부족 | **블랭킹 패널**, 랙 간 틈 밀봉, 봉쇄 도어 |

- Upsite(블랭킹 패널 제조사) CFD 연구: 블랭킹 패널 없음 대비 틈 있는 패널은 재순환 19%(53% 개선), 틈 없는 패널은 0% [불확실: 벤더 연구].
- 시뮬레이터 핵심 교보재: **블랭킹 패널 on/off 토글 → 랙 상단 서버 흡기온도 상승 + 빨간 파티클이 랙 앞면으로 새어 나옴**.

### 1.8 Air Flow 경로 (단계별) — 애니메이션 시나리오

| 단계 | 위치 | 공기 상태(예시) | 시각화 제안 |
|---|---|---|---|
| ① | **CRAH 급기** (하부 토출) | 약 18–22℃ | 파란 파티클 생성, 팬 회전 |
| ② | **이중마루 하부 플레넘** | 정압 형성, 수평 이동 | 바닥 반투명(X-ray) 처리, 파티클 수평 흐름 |
| ③ | **타공판** | 상향 분출 | 타공판 위 파란 "분수" 효과 |
| ④ | **냉복도** | 18–27℃ (ASHRAE 권장 흡기) | 냉복도 바닥/공기 파란 톤 |
| ⑤ | **서버 흡기** (랙 전면) | 측정 기준점 | 랙 전면에 온도 라벨/센서 아이콘 |
| ⑥ | **서버 내부 → 배기** (랙 후면) | +10~20℃ 상승 (서버 ΔT) | 파티클 색이 파랑→빨강으로 보간 |
| ⑦ | **열복도** | 약 30–45℃ | 열복도 붉은 톤 |
| ⑧ | **천장 리턴 그릴 / 플레넘** | 상승 | 천장 반투명, 파티클 상승 |
| ⑨ | **CRAH 리턴(흡입)** | 리턴 온도 | CRAH 상단 흡입 |
| ⑩ | **CRAH 코일** → 열이 냉수로 전달 → ①로 반복 | | 냉수 배관으로 "열 패킷" 전달 (§1.1 체인) |

> 수치 ①, ⑦은 운영 정책·봉쇄 여부에 따라 크게 달라지는 [일반] 예시값. 화면에는 "예시"로 표기 권장.

### 1.9 온습도 기준 — ASHRAE TC 9.9 (5th Edition, 2021/2024) [확인]

**권장(Recommended) 범위 — Class A1~A4 공통** (측정 위치: **IT 장비 흡기 공기**)

| 항목 | 권장값 |
|---|---|
| 건구온도 | **18–27℃** |
| 습도 | 이슬점 **−9℃ ~ 15℃**, 그리고 상대습도 **70%** 이하 (오염가스로 부식 위험 시 **50%** 이하) |

**허용(Allowable) 범위 — 운전 중**

| Class | 건구온도 | 습도 범위 | 최대 이슬점 | 대표 환경 |
|---|---|---|---|---|
| A1 | 15–32℃ | −12℃DP & 8%RH ~ 17℃DP & 80%RH | 17℃ | 엔터프라이즈 서버/스토리지, 엄격 관리 DC |
| A2 | 10–35℃ | −12℃DP & 8%RH ~ 21℃DP & 80%RH | 21℃ | 볼륨 서버, 일반 IT 공간 |
| A3 | 5–40℃ | ~ 24℃DP & 85%RH | 24℃ | |
| A4 | 5–45℃ | ~ 24℃DP & 90%RH | 24℃ | |
| **H1** (고밀도 공랭, 신설) | 권장 **18–22℃**, 허용 15–25℃ | 권장 습도는 A1–A4와 동일 | 17℃ | 고밀도 공랭 장비 구역 |

- 온도 변화 한계: IT 장비는 **1시간 20℃, 15분 5℃ 이내** (테이프는 1시간 5℃).
- 고도 보정: A1/A2는 900m 초과 시 300m당 최대 허용온도 1℃ 하향.
- **권장 = 시설 설계·운영 목표**, **허용 = 제조사가 동작을 시험한 범위**(신뢰성 보장 아님). 법적 강제 기준 아님.
- 액체냉각 등급: W17 / W27 / W32 / W40 / W45 / W+ (시설 공급수 온도 ℃ 기준).

### 1.10 센서 위치

| 센서 | 위치 | 근거 |
|---|---|---|
| 랙 흡기 온도 | 랙 **전면 상·중·하 3높이** | [일반] ASHRAE 권고로 다수 벤더가 인용 (흡기 온도는 랙 상단이 하단보다 높은 경우 많음) |
| 랙 배기 온도 | 랙 후면 상·중·하 (흡·배기 합쳐 랙당 6개 권고라는 인용 있음) | [불확실] Raritan 블로그 |
| 냉복도 일반 감시 | 냉복도 중앙, 바닥 위 약 1.5m(5ft), **3~4랙마다** | [불확실] 출처 간 "3랙/4랙" 상이 (Upsite vs AKCP) |
| CRAH 급기/리턴 | 유닛 토출구 및 흡입구 | [일반] |
| 이중마루 하부 | 정압(차압) 센서, 누수 감지 로프(배관 하부) | [일반] |
| 습도 | 실내 대표점 + CRAH 리턴 | [일반] |

- Upsite 지적: 냉복도 중앙 온도는 실제 서버 흡기의 **부정확한 대리지표**가 될 수 있음 → 시뮬레이터는 **랙 전면 상단 센서**를 핵심 지표로 보여주는 것이 교육적으로 정확.

### 1.11 ΔT (온도차) 종류

| ΔT | 정의 | 통상값 |
|---|---|---|
| 서버 ΔT | 서버 배기 − 흡기 | 약 20–35°F(≈ 11–19℃), 2U 서버 ≈ 20°F(11℃), 블레이드는 더 높음 [일반] (Upsite) |
| 냉각기 ΔT | CRAH 리턴 − 급기 | 운전 방식에 따라 0 ~ 20°F 이상. 바이패스 많으면 작아짐(=비효율) [일반] |
| 냉수 ΔT | 냉수 환수 − 공급 | ≈ 5–6℃ [일반] |
| 코일 접근온도(approach) | 급기 공기 − 코일 입수 온도 | (참고용) |

- 교육 메시지: **서버 ΔT ≈ 냉각기 ΔT** 이면 공기 관리가 잘 된 것. 냉각기 ΔT가 훨씬 작으면 → 바이패스, 서버 흡기가 급기보다 훨씬 높으면 → 재순환.

### 1.12 냉각 계산식

| 식 | 내용 |
|---|---|
| **CFM ≈ 3.16 × W / ΔT(°F)** | 필요 풍량 (해수면 공기 기준 경험식). 상수 3.1~3.17로 문헌마다 약간 다름 |
| **CFM ≈ 1.76 × W / ΔT(℃)** | 같은 식의 섭씨 버전 |
| **m³/h ≈ 3.0 × W / ΔT(℃)** | SI 유도: Q = ρ·cp·V̇·ΔT, ρ≈1.2 kg/m³, cp≈1.005 kJ/kg·K → V̇[m³/s] = W / (1206·ΔT) |
| 1 CFM = 1.699 m³/h | 단위 환산 |
| **1 RT(USRT) = 12,000 Btu/h ≈ 3.517 kW** | 미국 냉동톤 (ASHRAE·해외 장비) |
| 1 JRT ≈ 3.86 kW (3,320 kcal/h) | 일본 냉동톤. **국내 자료에 혼용되므로 단위 확인 필수** |
| **PUE = 시설 총전력 / IT 전력** | 1.0이 이상값 |
| 냉각 전력 ≈ 열부하 / COP | 시뮬레이터 간이 모델 (예: 냉동기 COP 5~6, 프리쿨링 시 상승) [일반] |

**예시**: 5 kW 랙, 서버 ΔT 20°F(≈11℃)
- 3.16 × 5000 / 20 = **790 CFM** ≈ 1,340 m³/h (Upsite 예시와 일치)
- 같은 랙, ΔT 35°F → 451 CFM (ΔT가 클수록 필요 풍량 감소)
- 열부하 5 kW = 5 / 3.517 ≈ **1.42 USRT**

> 시뮬레이터 내부 계산은 SI(kW, ℃, m³/h)로 하고, 툴팁에 CFM/°F/RT 병기 권장.

---

## 2. 참고 웹 서비스 / 제품 / 오픈소스

| # | 이름 | URL | 무엇을 보여주나 | 차용할 UX 아이디어 |
|---|---|---|---|---|
| 1 | **Microsoft Datacenter Virtual Tour** | https://datacenters.microsoft.com/tour | 브라우저 3D 자기주도 투어. Lobby → Network → Server Room → Mechanical Area → Innovation → Operations → Circular Center → Quantum → AI Server Room. 품질(SD/MD/HD) 선택, HTML 대체 버전, Azure OpenAI 기반 Q&A 어시스턴트 | **방(챕터) 단위 순차 투어 + "Next Room"**, 전체 지도로 복귀, 저사양 품질 옵션, 접근성용 HTML 버전, AI 질문 기능 |
| 2 | **Google Data Center 360° Tour / Street View** | https://www.google.com/about/datacenters/ (2016 The Dalles 360° 영상, 2012 Lenoir Street View) | 실사 360° 영상/파노라마. 냉각 배관(색상 코딩 파이프), 보안, 규모 | **색상 코딩된 배관**(냉수/온수 구분)을 그대로 3D에 차용, 내레이션형 가이드. [불확실] Street View 투어 현재 접속 여부 미확인 |
| 3 | **Schneider Electric EcoStruxure IT Advisor / IT Design CFD** | https://www.se.com/ww/en/work/campaign/it-advisor-cfd | 평면 레이아웃 + **3D 온도맵**(계산값/실측값 전환), 플레넘 압력·속도 오버레이, Capture Index, 드래그 배치 후 CFD 결과 | **계산 vs 실측 토글**, 바닥 플레넘 압력 히트맵, 랙별 Capture Index 배지, 장비 드래그 시 즉시 열 재계산 |
| 4 | **Schneider Sketchfab 3D 모델** | https://sketchfab.com/SchneiderElectric | InRow 냉방기, 냉동기, EcoStruxure Pod 등 장비 3D 모델 | 장비 형상 참고(라이선스 확인 필요), 장비 클릭 시 회전 뷰어 |
| 5 | **Schneider WP135 (HAC vs CAC 백서)** | https://it-resource.schneider-electric.com/white-papers/wp-135-impact-of-hot-and-cold-aisle-containment-on-data-center-temperature-and-efficiency-2 | 봉쇄 방식 비교 도식 | HAC/CAC **전환 토글** 시나리오 근거 |
| 6 | **Sunbird dcTrack 3D Visualizer** | https://www.sunbirddcim.com/product/visualization | 브라우저 3D 플로어 궤도 뷰 ↔ 캐비닛 줌인, 3D 랙 엘리베이션에 전력·환경 데이터 오버레이, 전력/냉각/용량 **색상 코딩 플로어맵** | **Bird's-eye → 랙 줌인 2단 내비게이션**, 랙 색칠(용량/온도/전력) 모드 전환, 클릭 드릴다운 |
| 7 | **Nlyte (Floor Planner / Predict)** | https://www.nlyte.com | CAD 스타일 평면, 3D 랙/플로어 뷰, 전원 체인 매핑, 미래 용량 예측 | **전원 체인(power chain) 하이라이트**: 장비 선택 시 상위 UPS/PDU 경로 강조 |
| 8 | **Vertiv Virtual Showroom / XR 앱** | https://www.vertiv.com (iOS: apps.apple.com/app/id1662466967) | 가상 DC에 DCIM·랙·냉각·전력 통합 전시, 제품 360° 3D, AR 배치 | 장비별 **분해(explode) 뷰**, 제품 카드 |
| 9 | **Cadence Reality DC (구 Future Facilities 6SigmaDCX)** | https://www.cadence.com/en_US/home/resources/datasheets/datacenter-design-software-ds.html | CFD 기반 디지털 트윈, 이중마루·실내 **기류 경로 렌더링**, 등온면(isosurface) | **기류 스트림라인**, 등온면(예: 27℃ 경계면) 표시 → 핫스팟 직관화 |
| 10 | **NVIDIA Omniverse DC Digital Twin** | https://docs.omniverse.nvidia.com/digital-twins/latest/data-center.html | 6SigmaDCX CFD 결과를 고품질 3D 트윈에 오버레이 | 시뮬레이션 결과를 **볼류메트릭 오버레이**로 겹치기 |
| 11 | **Hightopo HT for Web** | https://www.hightopo.com/demos/en-index.html | WebGL 2D/3D 디지털 트윈 SDK(상용). 지하 배전실, 지하철역 등 데모, 중국 시장의 "智慧机房" 사례 다수 | 경량(2.5D) 스타일, 대시보드 패널 + 3D 씬 결합, 알람 시 장비 깜빡임. [불확실] 공식 DC 전용 데모 URL 미확인 |
| 12 | **ThingJS** | https://www.thingjs.com (GitHub topic: https://github.com/topics/thingjs) | three.js 기반 디지털 트윈 엔진(중국). Marker(3D 위 아이콘/캔버스), WebView(3D 내 웹페이지 임베드) | 장비 위 **상태 마커(빌보드)**, 3D 공간 내 미니 패널 |
| 13 | **thingraph/server-room (3D DC Insight)** | https://github.com/thingraph/server-room (데모: room3d.thingraph.site) | Three.js 오픈소스. 3D 개요, 랙 뷰, 문/랙 애니메이션, 드래그앤드롭 빌더, 실시간 모니터링, 알림, 자산 편집 | **랙 문 열림 애니메이션**, 드래그 빌더 구조 참고. 라이선스 미확인 → 코드 차용 전 확인 필요 |
| 14 | **vinvuk/datacentermap** | https://github.com/vinvuk/datacentermap | R3F + Next.js, OSM 데이터 기반 전 세계 DC 3D 지구본 | 인트로 화면(지구본 → 특정 DC 줌인) 연출 |
| 15 | **R3F 기반 DC 디지털 트윈 글** | https://javascript.plainenglish.io/building-a-digital-twin-for-ai-infrastructure-with-three-js-and-react-three-fiber-90d504c330e2 | Rack ⊃ Server 컴포넌트 트리를 React로 표현 | 컴포넌트 구조 설계 참고 |
| 16 | **Equinix IBX 영상 투어** | https://www.equinix.com/resources/videos/sao-paulo-sp3-ibx-tour | 코로케이션 IBX 영상 투어 (인터랙티브 360° 투어는 미확인) | 보안 구역 단계(맨트랩→케이지) 설명 흐름 |

**three.js 기술 참고 예제 (공식 examples)**
- 다수 서버/랙: `InstancedMesh` — https://threejs.org/examples/#webgl_instancing_performance
- 선택 강조: Outline pass — https://threejs.org/examples/#webgl_postprocessing_outline
- 단면/투시: Clipping planes — https://threejs.org/examples/#webgl_clipping
- 대량 파티클(기류): GPGPU — https://threejs.org/examples/#webgl_gpgpu_birds (GPU 기반 파티클 업데이트 패턴 참고)

> 조사 결과 **"공조 원리를 초보자에게 가르치는" 웹 3D 교육 콘텐츠는 거의 없음**. 상용 DCIM은 운영자용(데이터 밀도 높음), 하이퍼스케일러 투어는 홍보용(원리 설명 약함). → 이 프로젝트의 차별점 포인트.

---

## 3. UX 추천 (초보자 이해 중심)

### 3.1 레이어 토글 (Layer System)
- 상단 툴바: **건축 | 전력 | 공조 | 방재 | 보안 | 네트워크** 레이어 on/off. 공조 레이어 on 시 다른 레이어는 30% 투명 회색화(고스팅).
- 공조 레이어 하위 토글: 기류 파티클 / 온도 히트맵 / 배관(냉수·냉각수·냉매) / 센서.

### 3.2 투시(X-ray) 및 단면
- **바닥 X-ray**: 이중마루 패널 반투명 → 하부 플레넘 기류·케이블·배관 노출.
- **천장 X-ray**: 리턴 플레넘 노출.
- **단면 슬라이더**(clipping plane): 랙 열을 수직으로 잘라 냉복도→서버→열복도 단면 표시. 단면에 온도 컬러맵.

### 3.3 기류 파티클 애니메이션
- 파티클 색 = 온도(파랑 18℃ → 노랑 → 빨강 40℃+). §1.8의 10단계 경로를 스플라인으로 미리 정의하고 파티클을 흘리는 **"가이드 기류"** 방식 권장(실시간 CFD는 과함).
- 이상 시나리오용 분기 경로: 바이패스(타공판→바로 CRAH), 재순환(랙 상단/끝단에서 열기가 앞으로 넘어옴).

### 3.4 가이드 투어 (Microsoft 투어 방식 차용)
1. 서버실 전경 — "데이터센터는 거대한 열 제거 기계"
2. 랙 전면/후면 — 흡기·배기, 블랭킹 패널
3. 냉복도/열복도 — 배치 원리
4. 이중마루 X-ray — 하부 급기, 타공판
5. 항온항습기(CRAH) — 코일, 팬, 급기/리턴
6. 기계실 — 냉동기, 펌프, 냉수 루프
7. 옥상 — 냉각탑, 프리쿨링
8. 봉쇄(HAC/CAC) — 전후 비교
- 각 단계: 카메라 자동 이동 + 하이라이트 + 설명카드 + "직접 해보기" 미션(예: 블랭킹 패널 빼보기).

### 3.5 툴팁 / 설명 카드
- 장비 hover → 이름(한/영), 한 줄 설명. click → 카드: 역할, 실제 사진/모식도, 현재 값(온도, 풍량, 부하), "더 알아보기".
- 용어 병기: 항온항습기(CRAH), 이중마루(Raised floor), 타공판(Perforated tile).

### 3.6 What-if 슬라이더 (인과관계 학습의 핵심)
| 입력 | 출력 변화 |
|---|---|
| IT 부하(kW/랙) | 필요 풍량(CFM·m³/h), 서버 배기온도, 냉각 전력, **PUE**, 필요 RT |
| 급기 설정온도 | 냉동기 COP, 프리쿨링 가능 시간, 흡기 ASHRAE 범위 이탈 경고 |
| 외기온도 | 프리쿨링 on/off, 냉각탑 부하 |
| 블랭킹 패널 / 봉쇄 on·off | 재순환·바이패스 파티클, 핫스팟 |
| CRAH 1대 고장(N+1) | 인접 랙 온도 상승 → 이중화 개념 학습 |
- 결과 패널: 게이지(흡기 온도 vs 18–27℃ 녹색 밴드), PUE 숫자, 경고 배지.

### 3.7 기타
- **열 체인 다이어그램**(§1.1)을 화면 하단 미니맵처럼 상시 표시, 현재 보는 장비가 체인 어디인지 하이라이트.
- **센서 아이콘** 클릭 → 미니 시계열 차트(가상 데이터).
- **성능**: 랙/서버는 InstancedMesh, 파티클은 GPU(Points + 셰이더), 저사양 품질 옵션 제공.
- **정확성 고지**: "교육용 단순화 모델이며 실제 설계값과 다를 수 있음" 문구.

---

## 4. 불확실/추가 확인 필요 항목

1. 국내 이중마루 높이(400–600mm), 냉수 7/12℃, 냉각수 32/37℃는 업계 관행이며 1차 자료(국내 설계기준)로 미확인.
2. 랙당 kW 한계(공랭/인로우/RDHx/D2C/액침)는 벤더 수치 중심. 정성적 사용 권장.
3. 센서 간격(3랙 vs 4랙마다)과 "랙당 6개" 권고는 ASHRAE 원문 미확인(2차 인용).
4. HAC 43% 절감은 Schneider 주장, Emerson은 CAC 우위 주장 → 중립 서술.
5. Google Street View DC 투어, Hightopo DC 전용 데모, Equinix 인터랙티브 투어는 현재 접속 가능 여부 미확인.
6. thingraph/server-room 라이선스 미확인.

---

## 5. Sources

**표준·기준**
- ASHRAE TC9.9 Reference Card, Thermal Guidelines 5th Ed. (2021/2024): https://www.ashrae.org/file%20library/technical%20resources/bookstore/supplemental%20files/therm-gdlns-5th-r-e-refcard.pdf
- Sunbird – ASHRAE TC9.9 요약: https://sunbirddcim.com/blog/does-your-data-center-follow-ashrae-tc-99-thermal-guidelines-data-processing-environments
- Upsite – ASHRAE Recommended vs Allowable: https://www.upsite.com/?p=208786

**냉각 장비·원리**
- TechTarget – CRAC: https://www.techtarget.com/searchdatacenter/definition/computer-room-air-conditioning-unit
- TechTarget – CRAH: https://www.techtarget.com/searchdatacenter/definition/computer-room-air-handler-CRAH
- Dataspan – CRAC vs CRAH: https://dataspan.com/blog/crac-vs-crah-cooling-units-whats-the-difference/
- MathWorks – Data Center Cooling (냉수/냉각수 루프 모델): https://www.mathworks.com/help/hydro/ug/data-center-cooling.html
- High Performance HVAC – 냉각수 펌프/냉각탑: https://highperformancehvac.com/large-condenser-pump-chilled-water-system/
- EVstudio – CRAH Systems: https://evstudio.com/crah-systems-in-data-centers/
- ENERGY STAR – Water-side economizers: https://www.energystar.gov/products/consider_water_side_economizers
- Alfa Laval – Waterside economizers: https://www.alfalaval.com/industries/energy-and-utilities/data-centers/data-center-cooling/waterside-economizers/
- EI Associates – Free cooling HX 사례: https://www.eiassoc.com/?p=401
- 경상국립대 – Water-Side Economizer 프리쿨링 에너지 효율: https://scholarworks.gnu.ac.kr/item/38f08273-e29f-42ea-8794-1aeb9196b123
- Trane – DC 백서: https://elibrary.tranetechnologies.com/public/commercial-hvac/Literature/White%20Paper/DC-WPR006A-EN_06302026.pdf
- Data Center Knowledge – RDHx/D2C/Immersion: https://www.datacenterknowledge.com/cooling/liquid-cooling-options-rdhx-direct-to-chip-immersion
- Data center cooling thresholds cheat sheet: https://cheatsheets.davidveksler.com/datacenter-cooling-thresholds.html

**이중마루·타공판·기류관리**
- TechTarget – Raised floor 높이: https://www.techtarget.com/searchdatacenter/answer/Data-center-raised-floors-and-ceiling-height
- Urbanek – UFAD 논문: https://www.brikbase.org/sites/default/files/best3_urbanek.pdf
- Chatsworth – 타공판: https://chatsworth.com/en-us/news-events/blogs/june-2009/perforated-floor-tile-pattern-not-a-factor-in-data
- Accu-Tech – 타공판 종류: https://www.accu-tech.com/accu-insider/does-the-type-of-perforated-tile-in-your-raised-floor-data-center-matter
- KR20180117853A (하부급기·상부배기 구조): https://patents.google.com/patent/KR20180117853A/ko
- Schneider WP135: https://it-resource.schneider-electric.com/white-papers/wp-135-impact-of-hot-and-cold-aisle-containment-on-data-center-temperature-and-efficiency-2
- Schneider 블로그 – HAC vs CAC: https://blog.se.com/datacenter/2011/09/15/for-data-center-energy-efficiency-hot-aisle-beats-cold-aisle-containment/
- InformationWeek – 봉쇄 논쟁: https://informationweek.com/data-management/the-data-center-hot-cold-aisle-containment-debate
- Upsite – 블랭킹 패널 CFD: https://www.upsite.com/wp-content/uploads/2017/08/Two-Dimensional-Computational-Fluid-Dynamics-Analysis-of-Blanking-Panel-Solutions.pdf
- TechTarget – Airflow management: https://www.techtarget.com/searchdatacenter/tip/Air-flow-management-strategies-for-efficient-data-center-cooling
- Upsite – 센서 위치: https://www.upsite.com/blog/data-center-temperature-sensor-location/
- AKCP – 센서 수량: https://www.akcp.com/2026/08/04/how-many-temperature-sensors/
- Raritan – 환경 모니터링: https://raritan.com/blog/detail/data-center-environmental-monitoring-best-practices

**계산**
- Upsite – IT Equipment ΔT & Flow Rate: https://www.upsite.com/blog/equipment-delta-t-flow-rate-impact-data-center/
- Upsite – Commonly Known ΔTs: https://www.upsite.com/blog/the-more-commonly-known-delta-ts-in-data-center-cooling/
- Upsite – Rack density & ΔT: https://www.upsite.com/blog/rack-density-delta-t-impact-airflow-management-strategy/
- Trane Japan – 냉동톤/COP: https://jp.trane.com/ja/wp/hvac/ton_cop_iplv.html

**참고 서비스**
- Microsoft Datacenter Tour: https://datacenters.microsoft.com/tour , 소개: https://news.microsoft.com/source/features/innovation/microsofts-virtual-datacenter-grounds-the-cloud-in-reality
- Google DC 360° Tour: https://www.datacenterknowledge.com/hyperscalers/go-on-a-virtual-360-degree-google-data-center-tour , https://9to5google.com/guides/google-data-center-vr-tour/
- Schneider EcoStruxure IT CFD: https://www.se.com/ww/en/work/campaign/it-advisor-cfd , 3D 온도맵 커뮤니티: https://community.se.com/t5/Configuring-cooling/Configuring-cooling/ta-p/447318
- Schneider Sketchfab: https://sketchfab.com/SchneiderElectric
- Sunbird dcTrack: https://www.sunbirddcim.com/product/visualization , https://www.sunbirddcim.com/blog/introducing-dctrack®-51
- Nlyte 프로필: https://www.datacenterknowledge.com/management/vendor-profile-nlyte-software-s-7-suite
- Vertiv Virtual Showroom: https://apps.apple.com/app/id1662466967
- Cadence Reality DC: https://www.cadence.com/en_US/home/resources/datasheets/datacenter-design-software-ds.html
- NVIDIA Omniverse DC Digital Twin: https://docs.omniverse.nvidia.com/digital-twins/latest/data-center.html
- Hightopo: https://www.hightopo.com/demos/en-index.html , https://dev.to/hightopo
- ThingJS: https://github.com/topics/thingjs , https://segmentfault.com/a/1190000023937106
- thingraph/server-room: https://github.com/thingraph/server-room
- vinvuk/datacentermap: https://github.com/vinvuk/datacentermap
- Equinix IBX 영상 투어: https://equinix.com/resources/videos/sao-paulo-sp3-ibx-tour
- R3F DC 디지털 트윈 글: https://javascript.plainenglish.io/building-a-digital-twin-for-ai-infrastructure-with-three-js-and-react-three-fiber-90d504c330e2
