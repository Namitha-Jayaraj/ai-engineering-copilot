import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function reviewCode(
  code: string,
  language: string,
  reviewMode: string,
  selectedReview: string
) {
  const response = await client.responses.create({
    model: "gpt-5-mini",

    input: [
      {
        role: "system",
        content: `
You are an expert software engineer and code reviewer.

The programming language is: ${language}

The requested review mode is: ${reviewMode}

Review instructions:
${selectedReview}

Analyze the provided code according to the selected review mode.

For a full review, check:
1. Bugs
2. Security vulnerabilities
3. Performance problems
4. Code quality issues
5. Missing or useful test cases (provide strictly 3 to 4 high-value test cases)

For focused review modes, prioritize the requested area.

Give a code quality score from 0 to 100.

For every issue:
- Identify its type
- Give its severity
- Estimate the line number
- Explain the problem
- Give a practical suggestion to fix it

Return only the structured response.
        `,
      },
      {
        role: "user",
        content: code,
      },
    ],

    text: {
      format: {
        type: "json_schema",
        name: "code_review",
        strict: true,
        schema: {
          type: "object",

          properties: {
            score: {
              type: "number",
            },

            summary: {
              type: "string",
            },

            issues: {
              type: "array",
              items: {
                type: "object",

                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "BUG",
                      "SECURITY",
                      "PERFORMANCE",
                      "QUALITY",
                    ],
                  },

                  severity: {
                    type: "string",
                    enum: [
                      "LOW",
                      "MEDIUM",
                      "HIGH",
                      "CRITICAL",
                    ],
                  },

                  line: {
                    type: "number",
                  },

                  description: {
                    type: "string",
                  },

                  suggestion: {
                    type: "string",
                  },
                },

                required: [
                  "type",
                  "severity",
                  "line",
                  "description",
                  "suggestion",
                ],

                additionalProperties: false,
              },
            },

            securityIssues: {
              type: "array",
              items: {
                type: "string",
              },
            },

            performanceIssues: {
              type: "array",
              items: {
                type: "string",
              },
            },

            tests: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },

          required: [
            "score",
            "summary",
            "issues",
            "securityIssues",
            "performanceIssues",
            "tests",
          ],

          additionalProperties: false,
        },
      },
    },
  });

  return JSON.parse(response.output_text);
}