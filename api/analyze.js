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

    const prompt = `당신은 생활공간 사진을 분석해서 생활습관 성격 유형을 진단하는 전문가입니다.
지금 ${images.length}장의 사진이 제공됩니다.

=== 핵심 원칙 ===
각 점수 축은 반드시 해당 사진이 실제로 있을 때만 분석하세요.
사진에서 확인할 수 없는 항목은 추측하지 말고 반드시 null로 처리하세요.

=== 6가지 분석 축 ===

1. visual_order (시각정돈)
   - 분석 가능: 방, 책상, 거실, 주방, 선반 등 물건이 보이는 사진
   - null 처리: 위 공간이 없는 경우
   - 기준: 물건 정렬·카테고리 분류·표면 정돈 (0=매우 어수선, 100=완벽히 정돈)

2. hygiene (위생청결)
   - 분석 가능: 욕실, 주방, 바닥, 침구, 냉장고 등 위생 상태가 보이는 사진
   - null 처리: 위 공간이 없는 경우
   - 기준: 먼지·얼룩·오염·곰팡이 등 (0=매우 불결, 100=매우 청결)

3. consumption (소비성향)
   - 분석 가능: 물건 수량·종류·포장 상태·재고가 보이는 사진
   - null 처리: 물건 수량을 가늠할 수 없는 경우
   - 기준: 0=충동구매형(다양한 물건 많음), 100=계획구매형(필요한 것만 비축)

4. planning (계획성)
   - 분석 가능: 라벨링, 수납함, 정리 시스템, 달력, 메모가 보이는 사진
   - null 처리: 체계화 여부를 판단할 수 없는 경우
   - 기준: 0=즉흥적, 100=매우 체계적

5. space_division (공간분리)
   - 분석 가능: 넓은 공간이나 여러 구역이 보이는 사진
   - null 처리: 공간 구분을 확인할 수 없는 경우
   - 기준: 0=물건이 뒤섞임, 100=용도별 완벽 분리

6. digital (디지털정돈)
   - 분석 가능: 컴퓨터 바탕화면, 스마트폰 화면, 앱 목록이 직접 보이는 사진만
   - null 처리: 디지털 화면이 사진에 없으면 반드시 null (방 사진, 침실 사진 등은 null)
   - 기준: 0=매우 어수선, 100=완벽히 정돈

=== 판단 기준 엄수 ===
- 방 사진 3장 → digital은 null
- 욕실 없음 → hygiene null 가능
- 각 축마다 사진에서 직접 관찰 가능한지 독립적으로 판단

=== 페르소나 선택 ===
null이 아닌 점수들만 기준으로 가장 잘 맞는 하나를 선택:
- 체계적 비축가: planning↑ + visual_order↑
- 느긋한 적층형: 전반적으로 낮은 점수
- 미니멀 즉흥파: 물건 적고 계획성 낮음
- 위생 우선형: hygiene만 높음
- 디지털 체계파: digital↑ (digital이 null이면 선택 불가)
- 쇼룸형: visual_order 매우 높고 hygiene 낮음

=== 출력 형식 ===
마크다운 없이 순수 JSON만 출력:
{
  "scores": {
    "visual_order": 숫자 또는 null,
    "hygiene": 숫자 또는 null,
    "consumption": 숫자 또는 null,
    "planning": 숫자 또는 null,
    "space_division": 숫자 또는 null,
    "digital": 숫자 또는 null
  },
  "bottom3": ["null 제외하고 점수 낮은 순 최대 3개 키"],
  "persona": "페르소나 전체 이름",
  "persona_main": "앞 단어",
  "persona_sub": "뒷 단어",
  "tagline": "사진에서 관찰한 내용 기반 20자 이내",
  "insights": {
    "strength1": "실제 관찰된 강점",
    "strength2": "실제 관찰된 강점",
    "weakness": "실제 관찰된 주의점",
    "note": "실제 관찰된 참고사항"
  },
  "consulting": ["실제 관찰 기반 제안1", "제안2", "제안3"],
  "confidence": 0~100
}`;

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: {
          mime_type: img.mediaType || 'image/jpeg',
          data: img.data
        }
      }))
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    // 503/429 자동 재시도 (최대 3회)
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
        const wait = attempt * 1500;
        console.log(`Retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        console.error('Gemini error:', JSON.stringify(data));
        return res.status(502).json({ error: 'Gemini API 오류', detail: data?.error?.message });
      }
    }

    const allParts = data.candidates?.[0]?.content?.parts || [];
    const fullText = allParts.map(p => p.text || '').join('');
    console.log('Full text preview:', fullText.slice(0, 300));

    if (!fullText) return res.status(502).json({ error: '응답이 비어있어요' });

    // JSON 파싱 3단계
    let result;
    try { result = JSON.parse(fullText.replace(/```json|```/g, '').trim()); } catch(_) {}
    if (!result) {
      try {
        const start = fullText.lastIndexOf('{');
        const end = fullText.lastIndexOf('}');
        if (start !== -1 && end > start) result = JSON.parse(fullText.slice(start, end + 1));
      } catch(_) {}
    }

    if (!result) {
      console.error('Parse failed:', fullText.slice(0, 500));
      return res.status(502).json({ error: 'AI 응답 파싱 실패', raw: fullText.slice(0, 500) });
    }

    // 보정: persona_main/sub 분리
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
    if (result.scores && result.bottom3 && result.bottom3.length < 3) {
      const sorted = Object.entries(result.scores)
        .filter(([k, v]) => v !== null && v !== undefined && !result.bottom3.includes(k))
        .sort((a, b) => a[1] - b[1]);
      while (result.bottom3.length < 3 && sorted.length > 0) {
        result.bottom3.push(sorted.shift()[0]);
      }
    }

    console.log('Success! Persona:', result.persona, '/ digital:', result.scores?.digital);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
