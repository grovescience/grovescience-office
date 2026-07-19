const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "POST 요청만 사용할 수 있습니다." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, { error: "Vercel 환경변수 OPENAI_API_KEY가 없습니다." });
    return;
  }

  const { template, student, attendanceSummary, learningNotes, teacherComment } = request.body || {};
  if (!student?.name) {
    sendJson(response, 400, { error: "학생을 선택해 주세요." });
    return;
  }

  const prompt = {
    academy: "과수원과학",
    subject: "과학",
    template,
    student,
    attendanceSummary,
    learningNotes,
    teacherComment,
  };

  const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "당신은 과학학원 선생님을 돕는 학부모용 성장 리포트 작성 도우미입니다. " +
                "한국어로 따뜻하고 신뢰감 있게 쓰되, 과장하지 말고 입력된 사실만 사용하세요. " +
                "점수, 출결, 과제, 성취도는 입력값이 있을 때만 쓰고, 없는 값은 '기록 없음' 또는 '추가 입력 필요'로 표시하세요. " +
                "전화번호 같은 개인정보는 쓰지 말고, 다른 학생과 비교하지 마세요.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "아래 정보를 바탕으로 PDF 예시처럼 한눈에 읽히는 카드형 학부모 성장 리포트 문안을 작성해 주세요.\n\n" +
                "출력 형식은 반드시 아래 순서를 지키세요.\n" +
                "1. 제목: [학생 이름] 학생 [보고 기간] 과학 성장 리포트\n" +
                "2. 성장 흐름\n" +
                "   - 지난 기간: 어려웠던 점 또는 자주 놓친 부분 1문장\n" +
                "   - 이번 기간 변화: 좋아진 점 1문장\n" +
                "   - 다음 목표: 다음에 집중할 목표 1문장\n" +
                "3. 성취 확인\n" +
                "   - 지난 평가 -> 이번 평가 형식으로 쓰기. 점수가 없으면 기록 없음으로 쓰기\n" +
                "4. 이번 기간 학습\n" +
                "   - 배운 단원, 교재, 숙제 중 확인 가능한 내용만 짧게 나열\n" +
                "5. 현재 수준\n" +
                "   - 개념 이해 / 문제 적용 / 오답 관리 / 수업 참여 / 과제 수행을 매우 좋음, 좋음, 보완 중, 기록 없음 중 하나로 표시\n" +
                "6. 선생님 코멘트\n" +
                "   - 학부모에게 보낼 수 있는 따뜻한 코멘트 2~3문장\n" +
                "7. 출결과 과제\n" +
                "   - 출결 요약과 과제 수행 상태를 짧게 표시\n\n" +
                "문장 규칙:\n" +
                "- 초등학생 학부모도 이해할 수 있게 쉽게 쓰기\n" +
                "- 낮은 점수나 부족한 부분도 낙인찍지 말고 다음 행동으로 연결하기\n" +
                "- 입력되지 않은 점수, 성향, 행동은 만들지 않기\n" +
                "- 전체 분량은 700자 안팎으로 작성하기\n\n" +
                JSON.stringify(prompt, null, 2),
            },
          ],
        },
      ],
      max_output_tokens: 900,
    }),
  });

  const data = await openaiResponse.json().catch(() => ({}));
  if (!openaiResponse.ok) {
    sendJson(response, openaiResponse.status, {
      error: data?.error?.message || "OpenAI API 호출에 실패했습니다.",
    });
    return;
  }

  sendJson(response, 200, { report: extractOutputText(data) });
};
