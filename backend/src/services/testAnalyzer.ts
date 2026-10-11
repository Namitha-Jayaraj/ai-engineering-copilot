import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeTestFailure(
  code: string,
  tests: string,
  testOutput: string,
  language: string
) {
  const response = await client.responses.create({
    model: "gpt-5-mini",

    input: [
      {
        role: "system",
        content: `
You are an expert software engineer and test engineer.

A piece of code was tested and the test execution failed.

Your job is to analyze the failure and determine whether:

1. CODE_BUG
   The user's code is incorrect.

2. TEST_BUG
   The generated test has an incorrect expectation or assumption.

3. BOTH
   Both the code and test have problems.

4. UNKNOWN
   The failure cannot be confidently classified.

Analyze:
- The original code
- The generated tests
- The test execution output

Explain the root cause clearly.

Return:
- classification
- explanation
- suggestedAction

Do not modify the code yourself.
Focus on accurately identifying the cause.
        `,
      },
      {
        role: "user",
        content: `
LANGUAGE:
${language}

CODE:
${code}

GENERATED TESTS:
${tests}

TEST EXECUTION OUTPUT:
${testOutput}
        `,
      },
    ],

    text: {
      format: {
        type: "json_schema",
        name: "test_failure_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            classification: {
              type: "string",
              enum: [
                "CODE_BUG",
                "TEST_BUG",
                "BOTH",
                "UNKNOWN",
              ],
            },
            explanation: {
              type: "string",
            },
            suggestedAction: {
              type: "string",
            },
          },
          required: [
            "classification",
            "explanation",
            "suggestedAction",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  return JSON.parse(response.output_text);
}