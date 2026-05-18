// Vercel 서버리스 함수 — Gemini Vision API
// 위치: /api/analyze.js

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

    // 이미지 크기 체크 (Gemini 제한: 이미지당 4MB)
    for (let i = 0; i < images.length; i++) {
      const sizeBytes = (images[i].data.length * 3) / 4;
      if (sizeBytes > 4 * 1024 * 1024) {
        return res.status(400).json({ error: `사진 ${i+1}번이 너무 커요. 4MB 이하로 올려주세요.` });
      }
    }

    const prompt = `생활공간 사진 ${images.length}장을 분석해서 생활습관 유형을 진단하세요.

규칙:
1. 사진에 보이는 것만 판단하고 없는 것은 추측하지 마세요
2. 바탕화면 사진이 없으면 digital은 반드시 null로 하세요
3. 인사이트는 실제 사진에서 관찰한 내용만 쓰세요

점수 기준 0-100 정수 (해당 사진 없으면 null):
visual_order: 시각적 정돈
hygiene: 위생 청결
consumption: 소비 계획성(100=계획구매)
planning: 체계화 정도
space_division: 공간 분리
digital: 디지털 정돈 (바탕화면 사진 없으면 null)

페르소나: 체계적 비축가 / 느긋한 적층형 / 미니멀 즉흥파 / 위생 우선형 / 디지털 체계파 / 쇼룸형

아래 JSON을 그대로 채워서 출력하세요. 다른 텍스트 없이:
{"scores":{"visual_order":0,"hygiene":0,"consumption":0,"planning":0,"space_division":0,"digital":null},"bottom3":["key1","key2","key3"],"persona":"체계적 비축가","persona_main":"체계적","persona_sub":"비축가","tagline":"한줄설명","insights":{"strength1":"강점1","strength2":"강점2","weakness":"주의점","note":"참고"},"consulting":["제안1","제안2","제안3"],"confidence":80}`;

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: {
          mime_type: img.mediaType || 'image/jpeg',
          data: img.data
        }
      }))
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

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

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API 오류', detail: data?.error?.message || data });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Raw:', rawText?.slice(0, 200));

    if (!rawText) {
      const reason = data.candidates?.[0]?.finishReason;
      console.error('Empty response, reason:', reason, JSON.stringify(data));
      return res.status(502).json({ error: '응답이 비어있어요', reason });
    }

    // JSON 파싱 3단계 방어
    let result;
    const attempts = [
      // 1차: 그대로 파싱
      () => JSON.parse(rawText.trim()),
      // 2차: 마크다운 제거 후 파싱
      () => JSON.parse(rawText.replace(/```json|```/g, '').trim()),
      // 3차: {} 블록 추출
      () => {
        const m = rawText.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('No JSON found');
        return JSON.parse(m[0]);
      }
    ];

    for (const attempt of attempts) {
      try { result = attempt(); break; } catch(e) { continue; }
    }

    if (!result) {
      console.error('All parse attempts failed. Raw:', rawText);
      return res.status(502).json({
        error: 'AI 응답 파싱 실패',
        raw: rawText.slice(0, 300)
      });
    }

    // null인 축은 bottom3에서 제거
    if (result.scores && result.bottom3) {
      result.bottom3 = result.bottom3.filter(
        k => result.scores[k] !== null && result.scores[k] !== undefined
      );
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: '서버 오류', detail: error.message });
  }
}
