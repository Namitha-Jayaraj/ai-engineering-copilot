import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateTests(
  code: string,
  language: string,
  testingFramework: string
) {
  const response = await client.responses.create({
    model: "gpt-5-mini",

    input: [
      {
        role: "system",
        content: `
You are an expert software engineer and test engineer.

Generate useful automated tests for the provided code.

Programming language:
${language}

Testing framework:
${testingFramework}

Rules:
- Understand the code before generating tests.
- Test the normal/expected behavior.
- Test edge cases.
- Test invalid inputs where appropriate.
- Include multiple test cases.
- Generate tests compatible with the selected testing framework.
- Use the correct syntax and conventions for the selected framework.

For JavaScript with Jest:
- Assume the source code will be saved as "source.js".
- Import functions from "./source".
- Use Jest syntax such as describe(), test(), expect().
- Do not invent a different source filename.

For JavaScript with Vitest:
- Assume the source code will be saved as "source.js".
- Import functions from "./source".
- Use imports from "vitest", such as: import { describe, test, expect } from "vitest";
- Use Vitest syntax.
- Do not use Jest globals or require().
- Do not invent a different source filename.


For Python with Pytest:
- Assume the source code will be saved as "source.py".
- Import functions using "from source import function_name".
- Use standard pytest syntax with functions beginning with "test_".
- Do not use unittest.
- Do not import from "solution", "main", or any other module name.
- Do not invent a different source filename.


For Java with JUnit:
- Generate standard JUnit tests.

Return only the test code.
Do not include markdown code fences.
Do not explain the tests outside the code.
        `,
      },

      {
        role: "user",
        content: `
CODE:

${code}
        `,
      },
    ],
  });

  return response.output_text;
}