import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateFix(
  code: string,
  language: string,
  issues: any[]
) {
  const response = await client.responses.create({
    model: "gpt-5-mini",

    input: [
      {
        role: "system",
        content: `
You are an expert software engineer.

Your task is to fix the provided code.

Programming language:
${language}

Fix the issues identified by the code reviewer.

Rules:
- Fix the identified bugs and problems.
- Preserve the original functionality wherever possible.
- Do not unnecessarily rewrite working code.
- Keep the code clean and readable.
- Return only the corrected code.
- Do not include markdown code fences.
        `,
      },
      {
        role: "user",
        content: `
CODE:

${code}

ISSUES:

${JSON.stringify(issues, null, 2)}
        `,
      },
    ],
  });

  return response.output_text;
}