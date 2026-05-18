// Vercel 서버리스 함수 — Gemini Vision API
// 위치: /api/analyze.js

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { images } = req.body;

    if (!images || images.length < 3) {
      return res.status(400).json({ error: '최소 3장의 사진이 필요해요' });
    }

    const prompt = `당신은 생활공간 사진을 분석해서 사람의 생활습관 성격을 진단하는 전문가입니다.
첨부된 ${images.length}장의 사진만을 보고 판단하세요.

=== 중요 규칙 ===
- 사진에 보이는 것만 근거로 사용하세요.
- 사진에 없는 공간(예: 바탕화면 사진이 없으면 digital은 null)은 추측하지 마세요.
- 인사이트와 컨설팅은 실제 사진에서 관찰한 내용만 언급하세요.

=== 6축 점수 (0~100 정수, 해당 사진 없으면 null) ===
- visual_order: 물건 정렬·분류·표면 정돈 정도
- hygiene: 먼지·얼룩·오염 등 위생 청결 상태
- consumption: 0=충동구매, 100=계획적 비축형 소비
- planning: 라벨링·수납 시스템·체계화 정도
- space_division: 용도별 공간 구분, 물건의 정해진 자리
- digital: 바탕화면·파일관리·알림 (바탕화면 사진 없으면 반드시 null)

=== 페르소나 선택 (점수 기반으로 가장 잘 맞는 것 하나) ===
- 체계적 비축가: planning 70↑ + visual_order 70↑
- 느긋한 적층형: 전반적으로 50 이하, 물건 많음
- 미니멀 즉흥파: visual_order 70↑ 이지만 물건 자체가 적음
- 위생 우선형: hygiene 80↑, 나머지는 보통 이하
- 디지털 체계파: digital 70↑ (digital이 null이면 선택 불가)
- 쇼룸형: visual_order 80↑, hygiene 50 이하

=== 출력 형식 ===
아래 JSON 구조만 출력하세요. 마크다운, 설명, 코드블록 없이 순수 JSON만:

{
  "scores": {
    "visual_order": 정수 또는 null,
    "hygiene": 정수 또는 null,
    "consumption": 정수 또는 null,
    "planning": 정수 또는 null,
    "space_division": 정수 또는 null,
    "digital": 정수 또는 null
  },
  "bottom3": ["null이 아닌 축 중 점수 낮은 3개의 키 이름"],
  "persona": "페르소나 전체 이름",
  "persona_main": "앞 단어",
  "persona_sub": "뒷 단어",
  "tagline": "이 사람을 한 줄로 표현 (20자 이내, 사진에서 관찰한 내용 기반)",
  "insights": {
    "strength1": "사진에서 관찰된 강점 문장",
    "strength2": "사진에서 관찰된 강점 문장",
    "weakness": "사진에서 관찰된 주의할 점",
    "note": "사진에서 관찰된 참고 사항"
  },
  "consulting": [
    "사진 관찰 기반 개선 제안 1",
    "사진 관찰 기반 개선 제안 2",
    "사진 관찰 기반 개선 제안 3"
  ],
  "confidence": 0에서 100 사이 정수
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Gemini API error:', JSON.stringify(err));
      return res.status(502).json({ error: 'Gemini API 오류', detail: err });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Gemini raw response:', rawText);

    if (!rawText) {
      return res.status(502).json({ error: 'AI 응답이 비어 있어요', detail: data });
    }

    // JSON 파싱 — 2단계 방어
    let result;
    try {
      const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      result = JSON.parse(clean);
    } catch (e) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(502).json({ error: 'AI 응답 파싱 실패', raw: rawText.slice(0, 300) });
      }
      result = JSON.parse(match[0]);
    }

    // null인 축은 bottom3에서 제거 (혹시 AI가 실수로 포함했을 경우 대비)
    if (result.scores && result.bottom3) {
      result.bottom3 = result.bottom3.filter(
        key => result.scores[key] !== null && result.scores[key] !== undefined
      );
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
