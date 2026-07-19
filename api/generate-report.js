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
                "당신은 과학학원 선생님을 돕는 학부모 안내문 작성 도우미입니다. " +
                "한국어로 따뜻하고 구체적으로 쓰되, 과장하지 말고 선생님이 바로 수정해 보낼 수 있는 초안을 만드세요. " +
                "개인정보는 새로 추측하지 말고 입력된 정보만 사용하세요.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "아래 정보를 바탕으로 학부모용 과학 학습보고서를 작성해 주세요.\n" +
                "양식별 지침:\n" +
                "- 성장 스토리: 지난달 -> 이번 달 -> 다음 목표 흐름\n" +
                "- 주간 체크: 출결, 쪽지시험결과, 이번 주 학습 변화 중심\n" +
                "- 클래식 리포트: 점수 변화, 학습 내용, 선생님 코멘트 중심\n\n" +
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
