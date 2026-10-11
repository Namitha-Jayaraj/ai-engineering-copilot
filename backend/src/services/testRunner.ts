
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { parseTestResult } from "./testResultParser.js";

const execAsync = promisify(exec);

export async function runTests(
  code: string,
  tests: string,
  language: string,
  testingFramework: string
) {
  const tempDir = path.join(process.cwd(), "temp-tests");
  fs.mkdirSync(tempDir, { recursive: true });

  // Jest
  if (
    language === "javascript" &&
    testingFramework === "jest"
  ) {
    const codePath = path.join(tempDir, "source.js");
    const testPath = path.join(tempDir, "source.test.js");

    fs.writeFileSync(codePath, code);
    fs.writeFileSync(testPath, tests);

    try {
      const { stdout, stderr } = await execAsync(
        `npx jest "${testPath}" --runInBand`,
        { cwd: tempDir }
      );

      return parseTestResult(`${stdout}\n${stderr}`);
    } catch (error: any) {
      const output = [
        error.stdout,
        error.stderr,
        error.message,
      ]
        .filter(Boolean)
        .join("\n");

      return parseTestResult(output);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // Vitest
  if (
    language === "javascript" &&
    testingFramework === "vitest"
  ) {
    const codePath = path.join(tempDir, "source.js");
    const testPath = path.join(tempDir, "source.test.js");

    fs.writeFileSync(codePath, code);
    fs.writeFileSync(testPath, tests);

    try {
      const { stdout, stderr } = await execAsync(
        `npx vitest run "${testPath}"`,
        { cwd: tempDir }
      );

      return parseTestResult(`${stdout}\n${stderr}`);
    } catch (error: any) {
      const output = [
        error.stdout,
        error.stderr,
        error.message,
      ]
        .filter(Boolean)
        .join("\n");

      return parseTestResult(output);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // Python + Pytest
  if (
    language === "python" &&
    testingFramework === "pytest"
  ) {
    const sourcePath = path.join(tempDir, "source.py");
    const testPath = path.join(tempDir, "test_source.py");

    fs.writeFileSync(sourcePath, code);
    fs.writeFileSync(testPath, tests);

    try {
      const { stdout, stderr } = await execAsync(
        `python -m pytest "${testPath}" -v --tb=short`,
        {
          cwd: tempDir,
          timeout: 30000,
        }
      );

      const output = `${stdout}\n${stderr}`;
      console.log("PYTEST OUTPUT:\n", output);

      return parseTestResult(output);
    } catch (error: any) {
      const output = [
        error.stdout,
        error.stderr,
        error.message,
      ]
        .filter(Boolean)
        .join("\n");

      console.log("PYTEST ERROR OUTPUT:\n", output);

      return parseTestResult(output);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  throw new Error(
    `Test execution for ${language} + ${testingFramework} is not implemented yet.`
  );
}
