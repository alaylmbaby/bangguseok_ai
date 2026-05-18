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

    const prompt = `생활공간 사진 ${images.length}장을 분석해서 생활습관 유형을 진단하세요.

규칙:
- 사진에 보이는 것만 판단하세요
- 바탕화면 사진 없으면 digital은 null
- 인사이트는 실제 관찰 내용만 작성

점수 (0-100 정수, 해당 사진 없으면 null):
visual_order(시각정돈), hygiene(위생청결), consumption(소비계획성100=계획), planning(체계화), space_division(공간분리), digital(디지털정돈)

페르소나: 체계적 비축가 / 느긋한 적층형 / 미니멀 즉흥파 / 위생 우선형 / 디지털 체계파 / 쇼룸형

반드시 JSON만 출력. 마크다운 없이:
{"scores":{"visual_order":75,"hygiene":60,"consumption":70,"planning":80,"space_division":65,"digital":null},"bottom3":["hygiene","space_division","consumption"],"persona":"체계적 비축가","persona_main":"체계적","persona_sub":"비축가","tagline":"한줄설명","insights":{"strength1":"강점1","strength2":"강점2","weakness":"주의점","note":"참고"},"consulting":["제안1","제안2","제안3"],"confidence":80}

위 구조 그대로, 값만 실제 분석 결과로 채워 출력하세요.`;

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
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API 오류', detail: data?.error?.message });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Raw:', rawText);

    if (!rawText) return res.status(502).json({ error: '응답이 비어있어요' });

    let result;
    try { result = JSON.parse(rawText.trim()); } catch(_) {}
    if (!result) {
      try { result = JSON.parse(rawText.replace(/```json|```/g, '').trim()); } catch(_) {}
    }
    if (!result) {
      try { const m = rawText.match(/\{[\s\S]*\}/); if (m) result = JSON.parse(m[0]); } catch(_) {}
    }

    if (!result) {
      console.error('Parse failed:', rawText);
      return res.status(502).json({ error: 'AI 응답 파싱 실패', raw: rawText.slice(0, 500) });
    }

    if (result.scores && result.bottom3) {
      result.bottom3 = result.bottom3.filter(k => result.scores[k] !== null && result.scores[k] !== undefined);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
