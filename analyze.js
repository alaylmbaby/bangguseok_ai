export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { images } = req.body;
    if (!images || images.length < 3) {
      return res.status(400).json({ error: '최소 3장의 사진이 필요해요' });
    }

    const prompt = `당신은 생활공간 사진 분석 전문가입니다. ${images.length}장의 사진을 분석합니다.

=== 핵심 원칙 ===
- 사진에서 직접 눈으로 확인할 수 있는 것만 점수를 매기세요
- 확인 불가능한 항목은 반드시 null입니다. 추측·추정·간접 판단 금지
- 각 축은 독립적으로 판단하세요

=== 6개 분석 축 ===

[visual_order] 시각정돈 (0=매우 어수선, 100=완벽히 정돈)
점수 가능 조건:
  - 방·책상·거실·선반·옷장·침대 위 등 물건 배치가 사진에 보일 때
null 조건:
  - 물건이 거의 안 보이거나 배치를 전혀 판단할 수 없을 때
판단 기준:
  - 물건이 제자리에 정렬되어 있는가
  - 표면(책상·바닥·침대)이 깔끔한가
  - 물건들이 카테고리별로 모여 있는가

[hygiene] 위생청결 (0=매우 불결, 100=매우 청결)
점수 가능 조건 (아래 중 하나라도 보이면 측정):
  - 욕실: 바닥·벽·변기·세면대·샤워기 주변
  - 주방: 싱크대·가스레인지·조리대
  - 냉장고 내부
  - 음식물·쓰레기·곰팡이·얼룩이 보이는 공간
  - 먼지 상태가 확인 가능한 표면 (선반·책상·창틀 등)
null 조건:
  - 위 공간이나 청결 상태를 전혀 확인할 수 없을 때
판단 기준:
  - 먼지·얼룩·오염·곰팡이가 없으면 높은 점수
  - 눈에 보이는 오염이 있으면 낮은 점수

[consumption] 소비성향 (0=충동구매형, 100=계획구매·비축형)
점수 가능 조건 (아래 중 하나라도 보이면 측정):
  - 냉장고 내부의 식품 재고량
  - 선반·수납공간의 물건 수량과 종류
  - 쇼핑백·포장재·영수증이 보일 때
  - 옷의 양과 방 규모가 함께 보일 때
null 조건:
  - 소비 패턴을 전혀 파악할 수 없을 때
판단 기준:
  - 방 규모 대비 옷이 터무니없이 많으면 과소비 (낮은 점수)
  - 동일한 컬러·스타일의 옷이 중복으로 많으면 과소비 확정 (낮은 점수)
  - 방 규모를 알 수 없고 단순히 어수선한 경우는 visual_order로만 판단하고 consumption은 null
  - 물건이 필요한 만큼만 있으면 높은 점수
  - 같은 종류가 과도하게 많으면 낮은 점수

[planning] 계획성 (0=즉흥적, 100=매우 체계적)
점수 가능 조건 (아래 중 하나라도 보이면 측정):
  - 물건 배치가 보이는 공간 (배치 자체로 기본 판단 가능)
  - 라벨링·수납함·정리함이 보일 때
  - 달력·메모·화이트보드·스케줄 도구가 보일 때
null 조건:
  - 배치나 체계화 여부를 전혀 판단할 수 없을 때
판단 기준:
  - 물건이 정돈된 배치 = 기본 점수 (50~70점대)
  - 라벨링·시스템·분류가 보이면 추가 가점 (70~90점대)
  - 달력·메모 등 시간 관리 도구가 보이면 최고점 가능
  - 어수선하게 섞여 있으면 낮은 점수

[space_division] 공간분리 (0=물건 뒤섞임, 100=용도별 완벽 분리)
점수 가능 조건:
  - 방 전체·거실·수납 공간이 넓게 찍혀 구역 구분이 보일 때
null 조건:
  - 공간 일부만 찍혀 구역 구분 여부를 판단할 수 없을 때
  - 사진이 특정 물건이나 좁은 영역만 보여줄 때
판단 기준:
  - 용도별로 구역이 명확히 나뉘어 있는가 (수면 공간·작업 공간·수납 공간 등)
  - 물건들이 용도에 맞는 장소에 있는가

[digital] 디지털정돈 (0=매우 어수선, 100=완벽히 정돈)
점수 가능 조건:
  - 컴퓨터 바탕화면이 직접 찍혀 아이콘·파일이 보일 때
  - 스마트폰 홈화면·앱 목록이 직접 찍혀 내용이 보일 때
null 조건 (반드시 null):
  - 디지털 화면이 사진에 없을 때
  - 화면이 있어도 내용이 안 보일 때
  - 방·침실·욕실·주방 등 생활공간만 찍힌 사진
판단 기준:
  - 바탕화면 파일·아이콘 수와 정리 상태
  - 폴더 분류 여부
  - 알림 배지 수

=== 출력 형식 ===
순수 JSON만. 마크다운·설명 없이:
{
  "scores": {
    "visual_order": 숫자 또는 null,
    "hygiene": 숫자 또는 null,
    "consumption": 숫자 또는 null,
    "planning": 숫자 또는 null,
    "space_division": 숫자 또는 null,
    "digital": 숫자 또는 null
  },
  "bottom3": ["null 제외 점수 낮은 순 최대 3개 키"],
  "persona": "페르소나 전체 이름",
  "persona_main": "앞 단어",
  "persona_sub": "뒷 단어",
  "tagline": "사진에서 관찰한 내용만 20자 이내",
  "insights": {
    "strength1": "사진에서 직접 관찰된 강점",
    "strength2": "사진에서 직접 관찰된 강점",
    "weakness": "사진에서 직접 관찰된 주의점",
    "note": "사진에서 직접 관찰된 참고사항"
  },
  "consulting": ["사진 기반 구체적 제안1", "제안2", "제안3"],
  "confidence": 0~100
}

페르소나 선택 (null이 아닌 점수만 기준):
- 체계적 비축가: planning↑ + visual_order↑
- 느긋한 적층형: 전반적으로 낮은 점수, 물건 많음
- 미니멀 즉흥파: 물건 적고 계획성 낮음
- 위생 우선형: hygiene만 높음
- 디지털 체계파: digital↑ (digital null이면 선택 불가)
- 쇼룸형: visual_order 매우 높고 hygiene 낮음`;

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: { mime_type: img.mediaType || 'image/jpeg', data: img.data }
      }))
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    // 자동 재시도 (최대 3회)
    let response, data;
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        })
      });
      data = await response.json();
      if (response.ok) break;
      const status = response.status;
      console.warn(`Attempt ${attempt} failed: ${status}`);
      if ((status === 503 || status === 429) && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 1500));
      } else {
        console.error('Gemini error:', JSON.stringify(data));
        return res.status(502).json({ error: 'Gemini API 오류', detail: data?.error?.message });
      }
    }

    const allParts = data.candidates?.[0]?.content?.parts || [];
    const fullText = allParts.map(p => p.text || '').join('');
    console.log('Preview:', fullText.slice(0, 300));
    if (!fullText) return res.status(502).json({ error: '응답이 비어있어요' });

    // JSON 파싱
    let result;
    try { result = JSON.parse(fullText.replace(/```json|```/g, '').trim()); } catch(_) {}
    if (!result) {
      try {
        const s = fullText.lastIndexOf('{'), e = fullText.lastIndexOf('}');
        if (s !== -1 && e > s) result = JSON.parse(fullText.slice(s, e + 1));
      } catch(_) {}
    }
    if (!result) {
      console.error('Parse failed:', fullText.slice(0, 500));
      return res.status(502).json({ error: 'AI 응답 파싱 실패', raw: fullText.slice(0, 500) });
    }

    // persona 보정
    if (result.persona && (!result.persona_main || !result.persona_sub)) {
      const p = result.persona.split(' ');
      result.persona_main = p[0] || result.persona;
      result.persona_sub = p.slice(1).join(' ') || '';
    }
    if (!result.persona) {
      result.persona = '느긋한 적층형';
      result.persona_main = '느긋한';
      result.persona_sub = '적층형';
    }

    // null 축은 bottom3에서 제거
    if (result.scores && result.bottom3) {
      result.bottom3 = result.bottom3.filter(
        k => result.scores[k] !== null && result.scores[k] !== undefined
      );
    }

    // bottom3 부족하면 점수 낮은 순으로 채우기
    if (result.scores) {
      if (!result.bottom3) result.bottom3 = [];
      const sorted = Object.entries(result.scores)
        .filter(([k, v]) => v !== null && v !== undefined && !result.bottom3.includes(k))
        .sort((a, b) => a[1] - b[1]);
      while (result.bottom3.length < 3 && sorted.length > 0) {
        result.bottom3.push(sorted.shift()[0]);
      }
    }

    console.log('Scores:', JSON.stringify(result.scores));
    console.log('Persona:', result.persona);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
