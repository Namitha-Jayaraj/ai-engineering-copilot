import express from "express";
import cors from "cors";
import "dotenv/config";
import { reviewCode } from "./services/codeReviewer.js";
import { generateFix } from "./services/codeFixer.js";
import { generateTests } from "./services/testGenerator.js";
import { runTests } from "./services/testRunner.js";
import { analyzeTestFailure } from "./services/testAnalyzer.js";
import {
  createSession,
  getAllSessions,
  getSessionById,
  deleteSession,
  getSessionStats,
} from "./services/database.js";
import {
  fetchGitHubPr,
  reviewGitHubPr,
  postPrComment,
  parseGitHubPrUrl,
  SAMPLE_PULL_REQUESTS,
} from "./services/githubService.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─────────────────────────────────────────────────────────────
// POST /api/review  –  AI code review + persist session
// ─────────────────────────────────────────────────────────────

app.post("/api/review", async (req, res) => {
  console.log("🔥 /api/review endpoint was called");

  try {
    const { code, language, reviewMode } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }

    const reviewInstructions: Record<string, string> = {
      full: `
Perform a complete code review.
Check for: Bugs, Security issues, Performance problems, Code quality problems, Edge cases, Testing opportunities.
`,
      bugs: `
Focus primarily on finding bugs, logical errors, runtime errors, incorrect assumptions and edge cases.
`,
      security: `
Focus primarily on security vulnerabilities, unsafe input handling, injection risks, authentication issues, sensitive data exposure and other security concerns.
`,
      performance: `
Focus primarily on performance problems, unnecessary computation, inefficient algorithms, memory usage and scalability.
`,
      quality: `
Focus primarily on code quality, readability, maintainability, naming, structure, duplication and clean-code practices.
`,
      tests: `
Focus primarily on generating useful test cases. Identify edge cases and scenarios that should be tested.
`,
    };

    const selectedReview =
      reviewInstructions[reviewMode as keyof typeof reviewInstructions] ||
      reviewInstructions.full;

    console.log("Language:", language);
    console.log("Review Mode:", reviewMode);

    const result = await reviewCode(code, language, reviewMode, selectedReview);

    // Persist to DB
    const sessionId = createSession({
      language: language || "unknown",
      reviewMode: reviewMode || "full",
      code,
      score: result.score,
      summary: result.summary,
      issues: result.issues,
      securityIssues: result.securityIssues,
      performanceIssues: result.performanceIssues,
      suggestedTests: result.tests,
    });

    console.log("💾 Session saved:", sessionId);

    res.json({ result, sessionId });
  } catch (error) {
    console.error("❌ Review error:", error);
    res.status(500).json({ error: "Failed to review code" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/fix
// ─────────────────────────────────────────────────────────────

app.post("/api/fix", async (req, res) => {
  console.log("🔧 /api/fix endpoint was called");

  try {
    const { code, language, issues } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }

    if (!language) {
      return res.status(400).json({ error: "Language is required" });
    }

    const fixedCode = await generateFix(code, language, issues || []);

    res.json({ fixedCode });
  } catch (error) {
    console.error("❌ Fix error:", error);
    res.status(500).json({ error: "Failed to generate fix" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/tests  –  generate test code
// ─────────────────────────────────────────────────────────────

app.post("/api/tests", async (req, res) => {
  console.log("🧪 /api/tests endpoint was called");

  try {
    const { code, language, testingFramework } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }

    console.log("Language:", language);
    console.log("Testing Framework:", testingFramework);

    const tests = await generateTests(code, language, testingFramework);

    res.json({ tests });
  } catch (error) {
    console.error("❌ Test generation error:", error);
    res.status(500).json({ error: "Failed to generate tests" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/tests/run  –  execute tests
// ─────────────────────────────────────────────────────────────

app.post("/api/tests/run", async (req, res) => {
  console.log("▶ /api/tests/run endpoint was called");

  try {
    const { code, tests, language, testingFramework, sessionId } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }

    if (!tests || !tests.trim()) {
      return res.status(400).json({ error: "Tests are required" });
    }

    console.log("Language:", language);
    console.log("Testing Framework:", testingFramework);

    const output = await runTests(code, tests, language, testingFramework);

    res.json({ output });
  } catch (error: any) {
    console.error("❌ Test execution error:", error);
    res.status(500).json({
      error:
        error?.stdout ||
        error?.stderr ||
        error?.message ||
        "Failed to run tests",
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/tests/analyze
// ─────────────────────────────────────────────────────────────

app.post("/api/tests/analyze", async (req, res) => {
  console.log("🔍 /api/tests/analyze endpoint was called");

  try {
    const { code, tests, testOutput, language } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }

    if (!tests || !tests.trim()) {
      return res.status(400).json({ error: "Tests are required" });
    }

    if (!testOutput || !testOutput.trim()) {
      return res.status(400).json({ error: "Test output is required" });
    }

    const analysis = await analyzeTestFailure(code, tests, testOutput, language);

    res.json({ analysis });
  } catch (error) {
    console.error("❌ Test failure analysis error:", error);
    res.status(500).json({ error: "Failed to analyze test failure" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/sessions  –  save a complete workflow session
// ─────────────────────────────────────────────────────────────

app.post("/api/sessions", async (req, res) => {
  console.log("💾 /api/sessions endpoint was called");

  try {
    const {
      language,
      reviewMode,
      code,
      score,
      summary,
      issues,
      securityIssues,
      performanceIssues,
      suggestedTests,
      fixedCode,
      testStatus,
      testsPassed,
      testsFailed,
      testsTotal,
      duration,
    } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Code is required" });
    }

    const sessionId = createSession({
      language: language || "unknown",
      reviewMode: reviewMode || "full",
      code,
      score,
      summary,
      issues,
      securityIssues,
      performanceIssues,
      suggestedTests,
      fixedCode,
      testStatus,
      testsPassed,
      testsFailed,
      testsTotal,
      duration,
    });

    res.json({ sessionId });
  } catch (error) {
    console.error("❌ Save session error:", error);
    res.status(500).json({ error: "Failed to save session" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/history  –  list all sessions (summary)
// ─────────────────────────────────────────────────────────────

app.get("/api/history", (_req, res) => {
  console.log("📋 /api/history endpoint was called");

  try {
    const sessions = getAllSessions();
    res.json({ sessions });
  } catch (error) {
    console.error("❌ History list error:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/history/stats  –  aggregate analytics & metrics
// ─────────────────────────────────────────────────────────────

app.get("/api/history/stats", (_req, res) => {
  console.log("📊 /api/history/stats endpoint was called");

  try {
    const stats = getSessionStats();
    res.json({ stats });
  } catch (error) {
    console.error("❌ History stats error:", error);
    res.status(500).json({ error: "Failed to compute history stats" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/history/:id  –  full session detail
// ─────────────────────────────────────────────────────────────

app.get("/api/history/:id", (req, res) => {
  console.log("📄 /api/history/:id endpoint was called");

  try {
    const session = getSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Parse stored JSON strings back to arrays
    const parsed = {
      ...session,
      issues: JSON.parse(session.issues || "[]"),
      securityIssues: JSON.parse(session.security_issues || "[]"),
      performanceIssues: JSON.parse(session.performance_issues || "[]"),
      suggestedTests: JSON.parse(session.suggested_tests || "[]"),
    };

    res.json({ session: parsed });
  } catch (error) {
    console.error("❌ History detail error:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/history/:id
// ─────────────────────────────────────────────────────────────

app.delete("/api/history/:id", (req, res) => {
  console.log("🗑 /api/history/:id DELETE was called");

  try {
    const session = getSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    deleteSession(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("❌ Delete session error:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/github/samples  –  list sample PRs for instant demo
// ─────────────────────────────────────────────────────────────

app.get("/api/github/samples", (_req, res) => {
  res.json({
    samples: Object.entries(SAMPLE_PULL_REQUESTS).map(([id, pr]) => ({
      id,
      title: pr.title,
      owner: pr.owner,
      repo: pr.repo,
      pullNumber: pr.pullNumber,
      url: pr.htmlUrl,
      filesCount: pr.files.length,
      additions: pr.additions,
      deletions: pr.deletions,
      description: pr.body,
    })),
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/github/pr  –  fetch PR details by URL or sampleId
// ─────────────────────────────────────────────────────────────

app.post("/api/github/pr", async (req, res) => {
  console.log("🐙 /api/github/pr was called");
  try {
    const { prUrl, sampleId, token } = req.body;

    if (sampleId && SAMPLE_PULL_REQUESTS[sampleId]) {
      return res.json({ pr: SAMPLE_PULL_REQUESTS[sampleId] });
    }

    if (!prUrl || typeof prUrl !== "string") {
      return res.status(400).json({ error: "GitHub Pull Request URL or sampleId is required." });
    }

    const parsed = parseGitHubPrUrl(prUrl);
    if (!parsed) {
      return res.status(400).json({
        error: "Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123",
      });
    }

    const pr = await fetchGitHubPr(parsed.owner, parsed.repo, parsed.pullNumber, token);
    res.json({ pr });
  } catch (error: any) {
    console.error("❌ GitHub PR fetch error:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to fetch GitHub PR" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/github/review  –  AI review on GitHub PR diffs
// ─────────────────────────────────────────────────────────────

app.post("/api/github/review", async (req, res) => {
  console.log("🔍 /api/github/review was called");
  try {
    const { pr, reviewMode } = req.body;

    if (!pr || !pr.files || !Array.isArray(pr.files)) {
      return res.status(400).json({ error: "PR data with files diff is required" });
    }

    const review = await reviewGitHubPr(pr, reviewMode || "full");

    // Also persist this PR review session to SQLite
    try {
      const sessionId = createSession({
        language: "github-pr",
        reviewMode: `pr-${review.verdict.toLowerCase()}`,
        code: pr.files.map((f: any) => `// ${f.filename}\n${f.patch || ""}`).join("\n\n"),
        score: review.riskScore,
        summary: `[PR #${pr.pullNumber} (${pr.owner}/${pr.repo})]: ${review.summary}`,
        issues: review.findings.map((f: any) => ({
          type: f.type,
          severity: f.severity,
          line: f.line,
          description: `[${f.file}] ${f.title}: ${f.description}`,
          suggestion: f.suggestedPatch || "",
        })),
        securityIssues: review.findings
          .filter((f: any) => f.type === "SECURITY")
          .map((f: any) => `[${f.file}] ${f.description}`),
        performanceIssues: review.findings
          .filter((f: any) => f.type === "PERFORMANCE")
          .map((f: any) => `[${f.file}] ${f.description}`),
        suggestedTests: [
          `Regression test for PR #${pr.pullNumber}: ${pr.title}`,
        ],
        fixedCode: review.markdownComment,
      });
      console.log("💾 Saved PR review session:", sessionId);
    } catch (saveErr) {
      console.warn("Could not auto-save PR session:", saveErr);
    }

    res.json({ review });
  } catch (error: any) {
    console.error("❌ GitHub PR review error:", error);
    res.status(500).json({ error: error.message || "Failed to review GitHub PR" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/github/comment  –  post review comment to GitHub PR
// ─────────────────────────────────────────────────────────────

app.post("/api/github/comment", async (req, res) => {
  console.log("💬 /api/github/comment was called");
  try {
    const { owner, repo, pullNumber, comment, token } = req.body;

    if (!owner || !repo || !pullNumber || !comment) {
      return res.status(400).json({ error: "Missing required fields (owner, repo, pullNumber, comment)" });
    }

    const result = await postPrComment(owner, repo, Number(pullNumber), comment, token);
    res.json(result);
  } catch (error: any) {
    console.error("❌ Post comment error:", error);
    res.status(500).json({ error: error.message || "Failed to post comment to GitHub" });
  }
});

// ─────────────────────────────────────────────────────────────

app.listen(5001, () => {
  console.log("Backend running on http://localhost:5001");
});
