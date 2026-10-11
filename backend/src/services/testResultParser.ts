
export function parseTestResult(output: string) {
  const cleanOutput = output.replace(
    /\u001b\[[0-?]*[ -/]*[@-~]/g,
    ""
  );

  const result: {
    status: string;
    passed: number;
    failed: number;
    total: number;
    testFilesPassed: number;
    testFilesFailed: number;
    duration: string;
    output: string;
  } = {
    status: "UNKNOWN",
    passed: 0,
    failed: 0,
    total: 0,
    testFilesPassed: 0,
    testFilesFailed: 0,
    duration: "",
    output: cleanOutput,
  };

  // Jest
  const jestSummary = cleanOutput.match(/Tests:\s*(.*)/);

  if (jestSummary) {
    const summary = jestSummary[1];

    result.passed = Number(
      summary.match(/(\d+)\s+passed/)?.[1] ?? 0
    );
    result.failed = Number(
      summary.match(/(\d+)\s+failed/)?.[1] ?? 0
    );
    result.total = Number(
      summary.match(/(\d+)\s+total/)?.[1] ?? 0
    );

    const files = cleanOutput.match(/Test Suites:\s*(.*)/);

    if (files) {
      result.testFilesPassed = Number(
        files[1].match(/(\d+)\s+passed/)?.[1] ?? 0
      );
      result.testFilesFailed = Number(
        files[1].match(/(\d+)\s+failed/)?.[1] ?? 0
      );
    }

    result.duration =
      cleanOutput.match(/Time:\s*([\d.]+\s*(?:ms|s))/)?.[1] ?? "";
  }

  // Vitest
  const vitestSummary = cleanOutput.match(
    /^\s*Tests\s+(.+)$/m
  );

  if (!jestSummary && vitestSummary) {
    const summary = vitestSummary[1];

    result.passed = Number(
      summary.match(/(\d+)\s+passed/)?.[1] ?? 0
    );
    result.failed = Number(
      summary.match(/(\d+)\s+failed/)?.[1] ?? 0
    );

    result.total = Number(
      summary.match(/\((\d+)\)/)?.[1] ??
      result.passed + result.failed
    );

    const files = cleanOutput.match(/^\s*Test Files\s+(.+)$/m);

    if (files) {
      result.testFilesPassed = Number(
        files[1].match(/(\d+)\s+passed/)?.[1] ?? 0
      );
      result.testFilesFailed = Number(
        files[1].match(/(\d+)\s+failed/)?.[1] ?? 0
      );
    }

    result.duration =
      cleanOutput.match(/Duration\s+([\d.]+\s*(?:ms|s))/)?.[1] ?? "";
  }

  // Pytest: e.g. "18 passed in 0.12s"
  const pytestSummary = cleanOutput.match(
    /=+\s*((?:\d+\s+(?:passed|failed|error|errors|skipped|xfailed|xpassed)(?:,\s*|\s+))+(?:in\s+[\d.]+s))\s*=+/
  )?.[1];

  if (!jestSummary && !vitestSummary && pytestSummary) {
    const counts = [
      ...pytestSummary.matchAll(
        /(\d+)\s+(passed|failed|error|errors|skipped|xfailed|xpassed)/g
      ),
    ];

    for (const match of counts) {
      const count = Number(match[1]);
      const category = match[2];

      if (category === "passed") {
        result.passed += count;
      }

      if (
        category === "failed" ||
        category === "error" ||
        category === "errors"
      ) {
        result.failed += count;
      }

      result.total += count;
    }

    result.duration =
      pytestSummary.match(/in\s+([\d.]+s)/)?.[1] ?? "";
  }

  // Final status
  if (result.failed > 0 || result.testFilesFailed > 0) {
    result.status = "FAIL";
  } else if (result.total > 0 && result.passed === result.total) {
    result.status = "PASS";
  }
  return result;
}
