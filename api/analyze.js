export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key exists:', !!apiKey);
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { images, hasDesktop } = req.body;
    if (!images || images.length < 3) {
      return res.status(400).json({ error: '최소 3장의 사진이 필요해요' });
    }

    const prompt = `생활공간 사진 ${images.length}장을 분석해서 생활습관 유형을 진단하세요.

${hasDesktop ? '바탕화면 사진 포함.' : '바탕화면 사진 없음 — digital은 반드시 null, 디지털 관련 언급 금지.'}

절대 규칙:
- 제공된 사진에 보이는 것만 분석
- 없는 공간은 절대 언급하지 말 것
- JSON만 출력, 마크다운 없이

점수 0-100 정수:
visual_order(시각정돈), hygiene(위생청결), consumption(소비계획성), planning(체계화), space_division(공간분리), digital(${hasDesktop ? '디지털정돈' : 'null 고정'})

페르소나: 체계적 비축가 / 느긋한 적층형 / 미니멀 즉흥파 / 위생 우선형 / 디지털 체계파 / 쇼룸형

출력:
{"scores":{"visual_order":75,"hygiene":60,"consumption":70,"planning":80,"space_division":65,"digital":${hasDesktop ? '55' : 'null'}},"bottom3":["hygiene","space_division","consumption"],"persona":"체계적 비축가","persona_main":"체계적","persona_sub":"비축가","tagline":"20자이내설명","insights":{"strength1":"강점1","strength2":"강점2","weakness":"주의점","note":"참고"},"consulting":["제안1","제안2","제안3"],"confidence":80}`;

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: { mime_type: img.mediaType || 'image/jpeg', data: img.data }
      }))
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    console.log('Calling Gemini...');

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API 오류', detail: data?.error?.message });
    }

    const allParts = data.candidates?.[0]?.content?.parts || [];
    const fullText = allParts.map(p => p.text || '').join('');
    console.log('Full text preview:', fullText.slice(0, 300));

    if (!fullText) return res.status(502).json({ error: '응답이 비어있어요' });

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
    if (!hasDesktop && result.scores) result.scores.digital = null;
    if (result.scores && result.bottom3) {
      result.bottom3 = result.bottom3.filter(k => result.scores[k] !== null && result.scores[k] !== undefined);
    }
    if (result.scores && result.bottom3 && result.bottom3.length < 3) {
      const sorted = Object.entries(result.scores)
        .filter(([k, v]) => v !== null && !result.bottom3.includes(k))
        .sort((a, b) => a[1] - b[1]);
      while (result.bottom3.length < 3 && sorted.length > 0) result.bottom3.push(sorted.shift()[0]);
    }

    console.log('Success! Persona:', result.persona);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
