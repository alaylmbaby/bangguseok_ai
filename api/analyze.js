export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { images, hasDesktop } = req.body;
    // hasDesktop: 클라이언트가 바탕화면 사진 포함 여부를 명시적으로 전달

    if (!images || images.length < 3) {
      return res.status(400).json({ error: '최소 3장의 사진이 필요해요' });
    }

    // 클라이언트가 알려준 사진 수로 제한 (없으면 실제 images 수)
    const photoCount = images.length;
    const desktopIncluded = hasDesktop === true;

    const prompt = `당신은 생활공간 사진 분석 전문가입니다.
지금 제공된 사진은 총 ${photoCount}장입니다.
${desktopIncluded ? '바탕화면 사진이 포함되어 있습니다.' : '바탕화면 사진은 포함되지 않았습니다. digital 점수는 반드시 null로 하세요.'}

=== 절대 규칙 ===
1. 제공된 사진에 보이는 것만 분석하세요
2. 사진에 없는 공간(냉장고, 차량, 바탕화면 등)은 절대 언급하지 마세요
3. ${desktopIncluded ? 'digital 점수를 분석하세요' : 'digital은 반드시 null. 디지털 관련 인사이트 절대 금지'}
4. insights와 consulting은 실제 사진에서 관찰한 내용만 작성

=== 점수 기준 (0-100 정수) ===
visual_order: 시각적 정돈 상태
hygiene: 위생적 청결 상태  
consumption: 소비 패턴 (100=계획적 비축, 0=충동구매)
planning: 체계화·라벨링 정도
space_division: 용도별 공간 구분
digital: ${desktopIncluded ? '디지털 정돈 상태' : 'null (바탕화면 사진 없음)'}

<<<<<<< HEAD
=== 페르소나 선택 ===
- 체계적 비축가: planning 높음 + visual_order 높음
- 느긋한 적층형: 전반적으로 낮음
- 미니멀 즉흥파: 물건 적고 계획성 낮음
- 위생 우선형: hygiene만 높음
- 디지털 체계파: digital 높음 (digital이 null이면 선택 불가)
- 쇼룸형: visual_order 높고 hygiene 낮음

=== 출력 형식 ===
다른 텍스트 없이 아래 JSON만 출력:
{
  "scores": {
    "visual_order": 숫자,
    "hygiene": 숫자,
    "consumption": 숫자,
    "planning": 숫자,
    "space_division": 숫자,
    "digital": ${desktopIncluded ? '숫자' : 'null'}
  },
  "bottom3": ["null 제외 점수 낮은 축 3개"],
  "persona": "페르소나 전체이름",
  "persona_main": "앞단어",
  "persona_sub": "뒷단어",
  "tagline": "사진 기반 20자 이내 한줄설명",
  "insights": {
    "strength1": "사진에서 관찰한 강점",
    "strength2": "사진에서 관찰한 강점",
    "weakness": "사진에서 관찰한 주의점",
    "note": "사진에서 관찰한 참고사항"
  },
  "consulting": ["제안1", "제안2", "제안3"],
  "confidence": 숫자
}`;
=======
반드시 JSON만 출력. 마크다운 없이:
{"scores":{"visual_order":75,"hygiene":60,"consumption":70,"planning":80,"space_division":65,"digital":null},"bottom3":["hygiene","space_division","consumption"],"persona":"체계적 비축가","persona_main":"체계적","persona_sub":"비축가","tagline":"한줄설명","insights":{"strength1":"강점1","strength2":"강점2","weakness":"주의점","note":"참고"},"consulting":["제안1","제안2","제안3"],"confidence":80}

위 구조 그대로, 값만 실제 분석 결과로 채워 출력하세요.`;
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: {
          mime_type: img.mediaType || 'image/jpeg',
          data: img.data
        }
      }))
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
<<<<<<< HEAD
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
=======
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,  // thinking 토큰 포함해서 넉넉하게
        }
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API 오류', detail: data?.error?.message });
    }

<<<<<<< HEAD
    // 모든 parts 합치기 (thinking + text)
    const allParts = data.candidates?.[0]?.content?.parts || [];
    const fullText = allParts.map(p => p.text || '').join('');
=======
    // gemini-2.5-flash는 parts가 여러 개일 수 있음 (thinking + text)
    // 모든 parts의 text를 합쳐서 JSON을 찾음
    const allParts = data.candidates?.[0]?.content?.parts || [];
    const fullText = allParts.map(p => p.text || '').join('');
    console.log('Full text length:', fullText.length);
    console.log('Full text preview:', fullText.slice(0, 200));
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d

    if (!fullText) {
      return res.status(502).json({ error: '응답이 비어있어요' });
    }

<<<<<<< HEAD
    // JSON 파싱 3단계
=======
    // JSON 블록 추출 — { 로 시작하는 부분부터 끝까지
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d
    let result;

    // 1단계: 마크다운 제거 후 파싱
    try {
      const clean = fullText.replace(/```json|```/g, '').trim();
      result = JSON.parse(clean);
    } catch(_) {}

<<<<<<< HEAD
    // 2단계: lastIndexOf로 마지막 JSON 블록 추출 (thinking 이후)
    if (!result) {
      try {
        const jsonStart = fullText.lastIndexOf('{');
        const jsonEnd = fullText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          result = JSON.parse(fullText.slice(jsonStart, jsonEnd + 1));
=======
    // 2단계: { } 블록 추출 (thinking 텍스트 앞부분 제거)
    if (!result) {
      try {
        // 마지막 { ... } 블록 찾기 (thinking 이후 실제 JSON)
        const jsonStart = fullText.lastIndexOf('{');
        const jsonEnd = fullText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const jsonStr = fullText.slice(jsonStart, jsonEnd + 1);
          result = JSON.parse(jsonStr);
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d
        }
      } catch(_) {}
    }

<<<<<<< HEAD
    // 3단계: scores + persona 포함한 블록 찾기
    if (!result) {
      try {
        const matches = [...fullText.matchAll(/\{[\s\S]+?\}/g)];
        for (const m of [...matches].reverse()) {
          try {
            const p = JSON.parse(m[0]);
            if (p.scores && p.persona) { result = p; break; }
=======
    // 3단계: 정규식으로 JSON 블록 찾기
    if (!result) {
      try {
        const matches = [...fullText.matchAll(/\{[\s\S]*?\}/g)];
        for (const m of matches.reverse()) {
          try {
            const parsed = JSON.parse(m[0]);
            if (parsed.scores && parsed.persona) {
              result = parsed;
              break;
            }
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d
          } catch(_) {}
        }
      } catch(_) {}
    }

    if (!result) {
<<<<<<< HEAD
      console.error('Parse failed:', fullText.slice(0, 1000));
      return res.status(502).json({ error: 'AI 응답 파싱 실패', raw: fullText.slice(0, 500) });
    }

    // ── 서버에서 결과 보정 ──

    // persona_main / persona_sub 없으면 persona에서 분리
    if (result.persona && (!result.persona_main || !result.persona_sub)) {
      const parts_persona = result.persona.split(' ');
      if (parts_persona.length >= 2) {
        result.persona_main = parts_persona[0];
        result.persona_sub  = parts_persona.slice(1).join(' ');
      } else {
        result.persona_main = result.persona;
        result.persona_sub  = '';
      }
    }

    // persona 없으면 기본값
    if (!result.persona) {
      result.persona      = '느긋한 적층형';
      result.persona_main = '느긋한';
      result.persona_sub  = '적층형';
    }

    // 바탕화면 안 올렸으면 digital 강제 null
    if (!desktopIncluded) {
      if (result.scores) result.scores.digital = null;
=======
      console.error('Parse failed. Full text:', fullText.slice(0, 1000));
      return res.status(502).json({
        error: 'AI 응답 파싱 실패',
        raw: fullText.slice(0, 500)
      });
>>>>>>> 8245526323e891fe4ce7c81a7f895b8e04e5888d
    }

    // null 축은 bottom3에서 제거
    if (result.scores && result.bottom3) {
      result.bottom3 = result.bottom3.filter(
        k => result.scores[k] !== null && result.scores[k] !== undefined
      );
    }

    // bottom3 부족하면 점수 낮은 순으로 채우기
    if (result.scores && result.bottom3.length < 3) {
      const sortable = Object.entries(result.scores)
        .filter(([k, v]) => v !== null && !result.bottom3.includes(k))
        .sort((a, b) => a[1] - b[1]);
      while (result.bottom3.length < 3 && sortable.length > 0) {
        result.bottom3.push(sortable.shift()[0]);
      }
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
