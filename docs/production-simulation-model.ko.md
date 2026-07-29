# 생산 시뮬레이션 모델

엔진 버전은 `phase9-simulation-1.0.0`입니다. modified logistic/Monod-inspired 성장항에 온도·pH·기질·질소·DO·기질 과잉 페널티를 곱합니다. 질소 제한 축적 단계에서는 lipid와 DHA를 biomass와 분리해 계산합니다.

DO는 OUR, 교반, 통기, 점도 기반 kLa 추정으로 갱신되며 목표 미만에서는 설정 범위 내 교반·통기를 높이는 event를 남깁니다. 동일한 profile, 입력 및 random seed는 동일한 시계열을 만듭니다.

출력은 biomass, total lipid, DHA g/L, DHA %, DO, pH, 잔존 glucose, 점도, 상대적 이상 위험지수, 에너지 지수입니다. 위험지수는 실제 오염 확률이 아닙니다.
