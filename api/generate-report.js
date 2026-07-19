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

  const { template, student, attendanceSummary, learningNotes, teacherComment, reportInputs = {} } = request.body || {};
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
    reportInputs,
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
                "당신은 과수원과학 원장님을 돕는 학부모용 과학 학습보고서 작성 도우미입니다. " +
                "과수원과학은 초3부터 고1까지 과학을 가르치며, 아이들이 자기주도성을 갖고 공부하도록 돕고 궁금한 부분을 편하게 질문할 수 있는 학원을 지향합니다. " +
                "보고서는 따뜻하지만 전문적으로, 입력된 사실만 바탕으로 작성하세요. " +
                "전화번호 같은 개인정보는 쓰지 말고, 다른 학생과 비교하지 말며, 낮은 점수나 부족한 부분도 낙인찍지 말고 다음 행동으로 연결하세요.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "아래 정보를 바탕으로 과수원과학 전용 학부모 보고서를 작성하세요.\n\n" +
                "양식 규칙:\n" +
                "- 초등부 월간 실험 보고서: 4주 수업 기준입니다. 성장 평가보다 이번 달에 어떤 실험과 수업을 했는지 학부모가 한눈에 이해하도록 씁니다. 실험 주제, 실험 내용, 수업 사진 설명, 실험참여도, 수업참여도, 개념이해를 중심으로 500~700자로 작성하세요. 문체는 따뜻하고 친근하되 실험 내용은 전문적으로 설명하세요.\n" +
                "- 중고등부 학기말 종합보고서: 6개월에 한 번 나가는 보고서입니다. 한 줄 요약, 지난 기간의 학습태도, 과제 수행, 학습내용, 지난 평가결과, 이번 평가결과, 출석률, 성적 변화 그래프에 넣기 좋은 점수 변화 문장을 포함해 800~1,200자로 작성하세요. 문체는 전문적이고 신뢰감 있게, 핵심 중심으로 간결하게 쓰세요.\n\n" +
                "출력 형식:\n" +
                "1. 보고서 제목\n" +
                "2. 한 줄 요약\n" +
                "3. 주요 수업 내용 또는 학습 내용\n" +
                "4. 평가항목별 관찰 내용: 실험참여도 / 수업참여도 / 개념이해\n" +
                "5. 잘한 점\n" +
                "6. 조금 더 연습할 점\n" +
                "7. 다음 목표\n" +
                "8. 선생님 코멘트\n" +
                "9. 카카오톡 발송용 짧은 마무리 문장\n\n" +
                "작성 금지사항:\n" +
                "- 입력되지 않은 성적이나 행동을 추측하지 않기\n" +
                "- 다른 학생과 비교하지 않기\n" +
                "- 아이를 질책하거나 낙인찍는 표현 사용하지 않기\n" +
                "- 어려운 전문용어는 피하거나 쉽게 풀어 쓰기\n" +
                "- 확인되지 않은 진단이나 성향을 단정하지 않기\n" +
                "- 학생 개인정보를 추가하지 않기\n" +
                "- 모든 학생에게 같은 문장을 반복하지 않기\n\n" +
                JSON.stringify(prompt, null, 2),
            },
          ],
        },
      ],
      max_output_tokens: 1600,
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
