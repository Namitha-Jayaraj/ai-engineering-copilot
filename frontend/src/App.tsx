
import { useState, useEffect, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import "./App.css";
import QualityDashboard from "./components/QualityDashboard";
import GitHubPrReviewer from "./components/GitHubPrReviewer";
import { Code2, BarChart3, Clock, GitPullRequest } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Issue = {
  type: string;
  severity: string;
  line: number;
  description: string;
  suggestion: string;
};

type ReviewResult = {
  score: number;
  summary: string;
  issues: Issue[];
  securityIssues: string[];
  performanceIssues: string[];
  tests: string[];
};

type TestResult = {
  status: string;
  passed?: number;
  failed?: number;
  total?: number;
  duration?: string;
  output?: string;
};

type TestAnalysis = {
  classification?: string;
  explanation?: string;
  suggestedAction?: string;
};

type SessionSummary = {
  id: string;
  created_at: string;
  language: string;
  review_mode: string;
  code_snippet: string;
  score: number | null;
  issue_count: number;
  security_count: number;
  performance_count: number;
  test_status: string | null;
};

type SessionDetail = {
  id: string;
  created_at: string;
  language: string;
  review_mode: string;
  code_snippet: string;
  score: number | null;
  summary: string | null;
  issue_count: number;
  issues: Issue[];
  securityIssues: string[];
  performanceIssues: string[];
  suggestedTests: string[];
  fixed_code: string | null;
  test_status: string | null;
  tests_passed: number | null;
  tests_failed: number | null;
  tests_total: number | null;
  duration: string | null;
};

// ─────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:5001";

async function postJson(
  endpoint: string,
  body: Record<string, unknown>
): Promise<any> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed with status ${response.status}`
    );
  }

  return data;
}

async function getJson(endpoint: string): Promise<any> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

async function deleteRequest(endpoint: string): Promise<void> {
  await fetch(`${API_BASE}${endpoint}`, { method: "DELETE" });
}

// ─────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────

function CompactFinding({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <details
      className="compact-finding"
      open={expanded}
      onToggle={(e) =>
        setExpanded(e.currentTarget.open)
      }
    >
      <summary>
        <span className="compact-finding-text">{text}</span>
        <span className="compact-finding-toggle">
          {expanded ? "Less ↑" : "More ↓"}
        </span>
      </summary>
    </details>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 80 ? "var(--green)" : score >= 55 ? "var(--yellow)" : "var(--red)";
  return (
    <span className="history-score-badge" style={{ color }}>
      {score}
    </span>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const label =
    mins < 1
      ? "just now"
      : mins < 60
      ? `${mins}m ago`
      : hrs < 24
      ? `${hrs}h ago`
      : `${days}d ago`;
  return <span className="history-time">{label}</span>;
}

// ─────────────────────────────────────────────────────────────
// History Sidebar
// ─────────────────────────────────────────────────────────────

interface HistorySidebarProps {
  open: boolean;
  onClose: () => void;
  onLoadSession: (session: SessionDetail) => void;
}

function HistorySidebar({ open, onClose, onLoadSession }: HistorySidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson("/api/history");
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      const data = await getJson(`/api/history/${id}`);
      onLoadSession(data.session);
      onClose();
    } catch {
      //
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteRequest(`/api/history/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  function testStatusClass(status: string | null) {
    if (!status) return "";
    return `history-test-${status.toLowerCase()}`;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`history-backdrop ${open ? "history-backdrop--open" : ""}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className={`history-drawer ${open ? "history-drawer--open" : ""}`}>
        <div className="history-drawer-header">
          <div>
            <span className="eyebrow">SESSION HISTORY</span>
            <h2>Past reviews</h2>
          </div>
          <div className="history-header-actions">
            <button
              className="icon-button"
              onClick={fetchSessions}
              title="Refresh"
              aria-label="Refresh history"
            >
              ↺
            </button>
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="Close history panel"
            >
              ×
            </button>
          </div>
        </div>

        <div className="history-drawer-body">
          {loading && (
            <div className="history-empty">
              <span className="spinner" />
              <p>Loading sessions…</p>
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <div className="history-empty">
              <div className="history-empty-icon">📋</div>
              <p>No sessions yet.</p>
              <p className="history-empty-sub">
                Run a review to save your first session.
              </p>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <ul className="history-list">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="history-item"
                  onClick={() => handleLoad(s.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleLoad(s.id)}
                >
                  <div className="history-item-top">
                    <div className="history-item-meta">
                      <span className="history-lang-chip">{s.language}</span>
                      <span className="history-mode-chip">{s.review_mode}</span>
                    </div>
                    <div className="history-item-actions">
                      <ScoreBadge score={s.score} />
                      <button
                        className="icon-button icon-button-danger"
                        onClick={(e) => handleDelete(s.id, e)}
                        disabled={deletingId === s.id}
                        title="Delete session"
                        aria-label="Delete session"
                      >
                        {deletingId === s.id ? "…" : "×"}
                      </button>
                    </div>
                  </div>

                  <pre className="history-snippet">{s.code_snippet}</pre>

                  <div className="history-item-bottom">
                    <div className="history-stats">
                      <span title="Issues">{s.issue_count} issues</span>
                      {s.security_count > 0 && (
                        <span className="history-stat-warn" title="Security">
                          {s.security_count} security
                        </span>
                      )}
                      {s.test_status && (
                        <span className={testStatusClass(s.test_status)}>
                          Tests: {s.test_status}
                        </span>
                      )}
                    </div>
                    <div className="history-item-right">
                      <RelativeTime iso={s.created_at} />
                      {loadingId === s.id && <span className="spinner" />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────

function App() {
  const [code, setCode] = useState(
    `function calculateTotal(items) {\n  let total = 0;\n\n  for (let i = 0; i <= items.length; i++) {\n    total += items[i].price;\n  }\n\n  return total;\n}`
  );

  const [language, setLanguage] = useState("javascript");
  const [reviewMode, setReviewMode] = useState("full");
  const [testingFramework, setTestingFramework] = useState("jest");

  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fixLoading, setFixLoading] = useState(false);
  const [fixedCode, setFixedCode] = useState("");

  const [testLoading, setTestLoading] = useState(false);
  const [generatedTests, setGeneratedTests] = useState("");
  const [runTestLoading, setRunTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [testAnalysis, setTestAnalysis] = useState<TestAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowStep, setWorkflowStep] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"workspace" | "dashboard" | "pullrequests">("workspace");

  const busy =
    loading ||
    fixLoading ||
    testLoading ||
    runTestLoading ||
    analysisLoading ||
    workflowLoading;

  // Fetch count badge on mount
  useEffect(() => {
    getJson("/api/history")
      .then((d) => setHistoryCount(d.sessions?.length ?? 0))
      .catch(() => {});
  }, []);

  // ── Load a past session back into the editor ──────────────

  function handleLoadSession(session: SessionDetail) {
    setCode(session.code_snippet);
    setLanguage(session.language);
    setReviewMode(session.review_mode);
    setFixedCode(session.fixed_code || "");
    setGeneratedTests("");
    setTestResult(
      session.test_status
        ? {
            status: session.test_status,
            passed: session.tests_passed ?? undefined,
            failed: session.tests_failed ?? undefined,
            total: session.tests_total ?? undefined,
            duration: session.duration ?? undefined,
          }
        : null
    );
    setTestAnalysis(null);
    setError("");
    setWorkflowStep("");

    if (session.score !== null) {
      setResult({
        score: session.score,
        summary: session.summary || "",
        issues: session.issues || [],
        securityIssues: session.securityIssues || [],
        performanceIssues: session.performanceIssues || [],
        tests: session.suggestedTests || [],
      });
    } else {
      setResult(null);
    }

    setActiveTab("workspace");
  }

  // ── Save full workflow session ────────────────────────────

  async function saveWorkflowSession(opts: {
    reviewResult: ReviewResult;
    fixedCode: string;
    testStatus?: string;
    testsPassed?: number;
    testsFailed?: number;
    testsTotal?: number;
    duration?: string;
  }) {
    try {
      await postJson("/api/sessions", {
        language,
        reviewMode,
        code,
        score: opts.reviewResult.score,
        summary: opts.reviewResult.summary,
        issues: opts.reviewResult.issues,
        securityIssues: opts.reviewResult.securityIssues,
        performanceIssues: opts.reviewResult.performanceIssues,
        suggestedTests: opts.reviewResult.tests,
        fixedCode: opts.fixedCode || null,
        testStatus: opts.testStatus ?? null,
        testsPassed: opts.testsPassed ?? null,
        testsFailed: opts.testsFailed ?? null,
        testsTotal: opts.testsTotal ?? null,
        duration: opts.duration ?? null,
      });
      setSessionSaved(true);
      setHistoryCount((prev) => (prev !== null ? prev + 1 : 1));
      setTimeout(() => setSessionSaved(false), 3000);
    } catch {
      // non-fatal
    }
  }

  // ── analyzeCode (review only) ─────────────────────────────

  async function analyzeCode() {
    if (!code.trim()) {
      setError("Please enter some code first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setFixedCode("");

    try {
      const data = await postJson("/api/review", {
        code,
        language,
        reviewMode,
      });

      setResult(data.result);
      // /api/review now auto-saves a session
      setHistoryCount((prev) => (prev !== null ? prev + 1 : 1));
      setSessionSaved(true);
      setTimeout(() => setSessionSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to analyze code. Check that the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  // ── handleGenerateFix ─────────────────────────────────────

  async function handleGenerateFix() {
    if (!result) return;

    setFixLoading(true);
    setError("");

    try {
      const data = await postJson("/api/fix", {
        code,
        language,
        issues: result.issues || [],
      });

      if (typeof data.fixedCode !== "string" || !data.fixedCode.trim()) {
        throw new Error("The AI did not return any fixed code.");
      }

      setFixedCode(data.fixedCode);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to generate a fix."
      );
    } finally {
      setFixLoading(false);
    }
  }

  // ── handleGenerateTests ───────────────────────────────────

  async function handleGenerateTests() {
    setTestLoading(true);
    setError("");

    try {
      const data = await postJson("/api/tests", {
        code,
        language,
        testingFramework,
      });

      if (typeof data.tests !== "string" || !data.tests.trim()) {
        throw new Error("The AI did not generate any tests.");
      }

      setGeneratedTests(data.tests);
      setTestResult(null);
      setTestAnalysis(null);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to generate tests."
      );
    } finally {
      setTestLoading(false);
    }
  }

  // ── analyzeTestFailure ────────────────────────────────────

  async function analyzeTestFailure(
    output: string,
    sourceCode: string,
    tests: string
  ) {
    setAnalysisLoading(true);

    try {
      const data = await postJson("/api/tests/analyze", {
        code: sourceCode,
        tests,
        testOutput: output,
        language,
      });

      setTestAnalysis(data.analysis || null);
      return data.analysis as TestAnalysis | undefined;
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to analyze test failure."
      );
      return undefined;
    } finally {
      setAnalysisLoading(false);
    }
  }

  // ── handleRunTests ────────────────────────────────────────

  async function handleRunTests() {
    if (!generatedTests.trim()) {
      setError("Generate tests first.");
      return;
    }

    setRunTestLoading(true);
    setError("");
    setTestResult(null);
    setTestAnalysis(null);

    try {
      const data = await postJson("/api/tests/run", {
        code,
        language,
        testingFramework,
        tests: generatedTests,
      });

      const output = data.output as TestResult;
      setTestResult(output);

      if (output?.status === "FAIL") {
        await analyzeTestFailure(output.output || "", code, generatedTests);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to run tests. Check that the backend is running."
      );
    } finally {
      setRunTestLoading(false);
    }
  }

  // ── handleRunWorkflow (full pipeline) ────────────────────

  async function handleRunWorkflow() {
    if (!code.trim()) {
      setError("Please enter some code first.");
      return;
    }

    setWorkflowLoading(true);
    setWorkflowStep("Starting workflow...");
    setError("");
    setTestResult(null);
    setTestAnalysis(null);
    setFixedCode("");
    setGeneratedTests("");
    setSessionSaved(false);

    let reviewResult: ReviewResult | null = null;
    let latestFixedCode = "";
    let latestTestResult: TestResult | null = null;

    try {
      // Step 1: Review
      setWorkflowStep("Step 1 of 4 · Reviewing code");

      const reviewData = await postJson("/api/review", {
        code,
        language,
        reviewMode,
      });

      if (!reviewData.result) throw new Error("Code review returned no result.");

      reviewResult = reviewData.result as ReviewResult;
      setResult(reviewResult);

      let workingCode = code;
      const issues: Issue[] = Array.isArray(reviewResult.issues)
        ? reviewResult.issues
        : [];

      // Step 2: Fix (if needed)
      if (issues.length > 0) {
        setWorkflowStep("Step 2 of 4 · Generating a fix");

        const fixData = await postJson("/api/fix", {
          code: workingCode,
          language,
          issues,
        });

        if (
          typeof fixData.fixedCode === "string" &&
          fixData.fixedCode.trim()
        ) {
          workingCode = fixData.fixedCode;
          latestFixedCode = workingCode;
          setFixedCode(workingCode);
        }
      }

      // Step 3: Tests
      setWorkflowStep("Step 3 of 4 · Generating tests");

      const testsData = await postJson("/api/tests", {
        code: workingCode,
        language,
        testingFramework,
      });

      let tests: string = testsData.tests;
      if (typeof tests !== "string" || !tests.trim())
        throw new Error("The AI did not generate any tests.");

      setGeneratedTests(tests);

      // Step 4: Run tests
      setWorkflowStep("Step 4 of 4 · Running tests");

      let runData = await postJson("/api/tests/run", {
        code: workingCode,
        tests,
        language,
        testingFramework,
      });

      let finalResult: TestResult = runData.output;
      if (!finalResult) throw new Error("The test runner returned no results.");

      latestTestResult = finalResult;
      setTestResult(finalResult);

      // Handle failures with one retry
      if (finalResult.status === "FAIL") {
        setWorkflowStep("Analyzing test failure");

        const analysis = await analyzeTestFailure(
          finalResult.output || "",
          workingCode,
          tests
        );

        if (["CODE_BUG", "BOTH"].includes(analysis?.classification || "")) {
          setWorkflowStep("Generating one retry fix");

          const retryIssues: Issue[] = [
            ...issues,
            {
              type: "TEST_FAILURE",
              severity: "high",
              line: 0,
              description: analysis?.explanation || "The tests failed.",
              suggestion:
                analysis?.suggestedAction ||
                "Fix the code responsible for the test failure.",
            },
          ];

          const retryFix = await postJson("/api/fix", {
            code: workingCode,
            language,
            issues: retryIssues,
          });

          if (
            typeof retryFix.fixedCode === "string" &&
            retryFix.fixedCode.trim() &&
            retryFix.fixedCode !== workingCode
          ) {
            workingCode = retryFix.fixedCode;
            latestFixedCode = workingCode;
            setFixedCode(workingCode);

            setWorkflowStep("Regenerating tests after the fix");

            const retryTests = await postJson("/api/tests", {
              code: workingCode,
              language,
              testingFramework,
            });

            if (
              typeof retryTests.tests !== "string" ||
              !retryTests.tests.trim()
            ) {
              throw new Error("The retry did not generate any tests.");
            }

            tests = retryTests.tests;
            setGeneratedTests(tests);

            setWorkflowStep("Running tests again");

            runData = await postJson("/api/tests/run", {
              code: workingCode,
              tests,
              language,
              testingFramework,
            });

            finalResult = runData.output;
            if (!finalResult) throw new Error("The retry returned no test results.");

            latestTestResult = finalResult;
            setTestResult(finalResult);

            if (finalResult.status === "FAIL") {
              await analyzeTestFailure(
                finalResult.output || "",
                workingCode,
                tests
              );
            } else {
              setTestAnalysis(null);
            }
          }
        }
      }

      setWorkflowStep(
        finalResult.status === "PASS"
          ? "Completed · All tests passed"
          : finalResult.status === "FAIL"
          ? "Completed · Tests still fail; review the results"
          : `Completed · Test status: ${finalResult.status}`
      );
    } catch (err) {
      console.error("Workflow error:", err);
      setError(
        err instanceof Error ? err.message : "The workflow failed."
      );
      setWorkflowStep("Workflow stopped due to an error");
    } finally {
      setWorkflowLoading(false);

      // Persist the completed workflow session
      if (reviewResult) {
        await saveWorkflowSession({
          reviewResult,
          fixedCode: latestFixedCode,
          testStatus: latestTestResult?.status,
          testsPassed: latestTestResult?.passed,
          testsFailed: latestTestResult?.failed,
          testsTotal: latestTestResult?.total,
          duration: latestTestResult?.duration,
        });
      }
    }
  }

  // ── handleApplyFix ────────────────────────────────────────

  function handleApplyFix() {
    if (!fixedCode) return;

    setCode(fixedCode);
    setFixedCode("");
    setResult(null);
    setGeneratedTests("");
    setTestResult(null);
    setTestAnalysis(null);
    setError("");
  }

  // ─────────────────────────────────────────────────────────
  // Derived state
  // ─────────────────────────────────────────────────────────

  const issues = result?.issues || [];
  const securityIssues = result?.securityIssues || [];
  const performanceIssues = result?.performanceIssues || [];
  const suggestedTests = result?.tests || [];

  const fileExt =
    language === "javascript"
      ? "js"
      : language === "typescript"
      ? "ts"
      : language === "python"
      ? "py"
      : "java";

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* History Sidebar */}
      <HistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoadSession={handleLoadSession}
      />

      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <h1>Engineering Copilot</h1>
            <p>Code review · Fixes · Testing</p>
          </div>
        </div>

        <nav className="topbar-nav">
          <button
            className={`topbar-nav-btn ${activeTab === "workspace" ? "topbar-nav-btn--active" : ""}`}
            onClick={() => setActiveTab("workspace")}
            id="tab-workspace"
          >
            <Code2 size={15} />
            <span>Workspace</span>
          </button>
          <button
            className={`topbar-nav-btn ${activeTab === "pullrequests" ? "topbar-nav-btn--active" : ""}`}
            onClick={() => setActiveTab("pullrequests")}
            id="tab-pullrequests"
          >
            <GitPullRequest size={15} />
            <span>PR Reviewer</span>
          </button>
          <button
            className={`topbar-nav-btn ${activeTab === "dashboard" ? "topbar-nav-btn--active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
            id="tab-analytics"
          >
            <BarChart3 size={15} />
            <span>Quality Analytics</span>
          </button>
        </nav>

        <div className="topbar-right">
          {sessionSaved && (
            <span className="session-saved-toast">
              ✓ Session saved
            </span>
          )}
          <button
            className="history-trigger-btn"
            onClick={() => setHistoryOpen(true)}
            title="Open session history"
            id="history-trigger"
          >
            <Clock size={14} className="history-trigger-icon" />
            History
            {historyCount !== null && historyCount > 0 && (
              <span className="history-count-badge">{historyCount}</span>
            )}
          </button>
          <span className="connection-indicator">
            <span className="connection-dot" />
            API workspace
          </span>
          <span className="topbar-version">Developer tools</span>
        </div>
      </header>

      {activeTab === "pullrequests" ? (
        <GitHubPrReviewer
          onLoadIntoEditor={(newCode, newLang) => {
            setCode(newCode);
            setLanguage(newLang);
            setFixedCode("");
            setResult(null);
            setGeneratedTests("");
            setTestResult(null);
            setTestAnalysis(null);
            setError("");
          }}
          onSwitchToWorkspace={() => setActiveTab("workspace")}
          postJson={postJson}
          getJson={getJson}
        />
      ) : activeTab === "dashboard" ? (
        <QualityDashboard
          onLoadSession={handleLoadSession}
          onSwitchToWorkspace={() => setActiveTab("workspace")}
          getJson={getJson}
          deleteRequest={deleteRequest}
        />
      ) : (
        <main className="workspace">
        {/* ── Left: Editor panel ── */}
        <section className="editor-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">WORKSPACE</span>
              <h2>Code editor</h2>
            </div>
            <span className="file-chip">
              <span className="file-dot" />
              review.{fileExt}
            </span>
          </div>

          <div className="editor-controls">
            <label className="field">
              <span>Language</span>
              <select
                value={language}
                disabled={busy}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
              </select>
            </label>

            <label className="field">
              <span>Review mode</span>
              <select
                value={reviewMode}
                disabled={busy}
                onChange={(e) => setReviewMode(e.target.value)}
              >
                <option value="full">Full review</option>
                <option value="bugs">Bug detection</option>
                <option value="security">Security</option>
                <option value="performance">Performance</option>
                <option value="quality">Code quality</option>
                <option value="tests">Test generation</option>
              </select>
            </label>

            <label className="field">
              <span>Test framework</span>
              <select
                value={testingFramework}
                disabled={busy}
                onChange={(e) => setTestingFramework(e.target.value)}
              >
                <option value="jest">Jest</option>
                <option value="vitest">Vitest</option>
                <option value="pytest">Pytest</option>
                <option value="junit">JUnit</option>
              </select>
            </label>
          </div>

          <div className="editor-frame">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineHeight: 23,
                padding: { top: 18, bottom: 18 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                renderLineHighlight: "all",
                scrollbar: {
                  verticalScrollbarSize: 9,
                  horizontalScrollbarSize: 9,
                },
              }}
            />
          </div>

          <div className="editor-actions">
            <button
              className="button button-primary button-large"
              onClick={handleRunWorkflow}
              disabled={busy}
              id="run-workflow-btn"
            >
              {workflowLoading ? (
                <>
                  <span className="spinner" />
                  Workflow running
                </>
              ) : (
                <>
                  <span className="button-icon">▶</span>
                  Run full workflow
                </>
              )}
            </button>

            <button
              className="button button-secondary"
              onClick={analyzeCode}
              disabled={busy}
              id="review-only-btn"
            >
              {loading ? "Reviewing..." : "Review only"}
            </button>
          </div>

          <div className="workflow-box">
            <div className="workflow-box-heading">
              <span className="workflow-indicator" />
              <span>Workflow status</span>
              <span className="workflow-live">
                {workflowLoading
                  ? "IN PROGRESS"
                  : workflowStep
                  ? "UPDATED"
                  : "READY"}
              </span>
            </div>

            <p
              className={
                workflowStep ? "workflow-message" : "workflow-message muted"
              }
            >
              {workflowStep ||
                "Run the full workflow to review, fix, generate tests and execute them."}
            </p>

            {workflowLoading && (
              <div className="progress-track">
                <div className="progress-bar" />
              </div>
            )}
          </div>

          <p className="editor-footnote">
            AI-suggested changes are shown as a diff. Your editor code changes
            only when you apply a fix.
          </p>
        </section>

        {/* ── Right: Results panel ── */}
        <section className="results-panel panel">
          <div className="panel-heading results-heading">
            <div>
              <span className="eyebrow">AI ASSISTANT</span>
              <h2>Review &amp; test results</h2>
            </div>
            {result && (
              <span className="score-pill">
                Score <strong>{result.score ?? "—"}</strong>
                <span className="score-out-of">/100</span>
              </span>
            )}
          </div>

          <div className="results-scroll">
            {error && (
              <div className="error-banner">
                <span className="banner-icon">!</span>
                <div>
                  <strong>Something went wrong</strong>
                  <p>{error}</p>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}

            {!result && !loading && !workflowLoading && !error && (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="empty-illustration-inner">{"</>"}</div>
                </div>
                <h3>Your code, reviewed by AI</h3>
                <p>
                  Start a full workflow to inspect your code, generate a fix,
                  create tests and validate the result.
                </p>
                <div className="empty-features">
                  <span>01 · Review</span>
                  <span>02 · Fix</span>
                  <span>03 · Test</span>
                </div>
              </div>
            )}

            {(loading || workflowLoading) && !result && (
              <div className="loading-card">
                <span className="spinner spinner-large" />
                <h3>Preparing your review</h3>
                <p>{workflowStep || "Waiting for the AI response..."}</p>
              </div>
            )}

            {result && (
              <>
                <section className="result-section">
                  <div className="section-title-row">
                    <div>
                      <span className="section-kicker">OVERVIEW</span>
                      <h3>Review summary</h3>
                    </div>
                    <span className="subtle-count">
                      {issues.length}{" "}
                      {issues.length === 1 ? "issue" : "issues"}
                    </span>
                  </div>

                  <div className="summary-card">
                    <div className="summary-icon">✳</div>
                    <p>{result.summary || "No summary was returned."}</p>
                  </div>

                  <div className="metric-grid">
                    <div className="metric-card">
                      <span className="metric-label">Issues</span>
                      <strong>{issues.length}</strong>
                      <span className="metric-caption">Review findings</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Security</span>
                      <strong>{securityIssues.length}</strong>
                      <span className="metric-caption">Security findings</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Performance</span>
                      <strong>{performanceIssues.length}</strong>
                      <span className="metric-caption">Optimization hints</span>
                    </div>
                  </div>
                </section>

                <section className="result-section">
                  <div className="section-title-row">
                    <div>
                      <span className="section-kicker">FINDINGS</span>
                      <h3>Issues to review</h3>
                    </div>
                    <span className="subtle-count">{issues.length} total</span>
                  </div>

                  {issues.length === 0 ? (
                    <div className="success-note">
                      <span>✓</span>
                      No issues were reported by the review.
                    </div>
                  ) : (
                    <div className="issue-list">
                      {issues.map((issue, index) => (
                        <details
                          className="issue-card"
                          key={`${issue.type}-${index}`}
                        >
                          <summary className="issue-summary">
                            <span
                              className={`severity-dot severity-${(
                                issue.severity || ""
                              ).toLowerCase()}`}
                            />
                            <span className="issue-main">
                              <strong>{issue.type || "Issue"}</strong>
                              <span className="finding-preview">
                                {issue.description}
                              </span>
                            </span>
                            <span
                              className={`severity-label severity-label-${(
                                issue.severity || ""
                              ).toLowerCase()}`}
                            >
                              {issue.severity || "Info"}
                            </span>
                            <span className="chevron">⌄</span>
                          </summary>
                          <div className="issue-details">
                            <p className="issue-location">
                              Line {issue.line ?? "—"}
                            </p>
                            <div className="suggestion-box">
                              <strong>Suggested improvement</strong>
                              <CompactFinding
                                text={
                                  issue.suggestion || "No suggestion provided."
                                }
                              />
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </section>

                {securityIssues.length > 0 && (
                  <section className="result-section">
                    <div className="section-title-row">
                      <div>
                        <span className="section-kicker">SECURITY</span>
                        <h3>Security findings</h3>
                      </div>
                    </div>
                    <div className="compact-finding-list">
                      {securityIssues.map((item, index) => (
                        <CompactFinding key={index} text={item} />
                      ))}
                    </div>
                  </section>
                )}

                {performanceIssues.length > 0 && (
                  <section className="result-section">
                    <div className="section-title-row">
                      <div>
                        <span className="section-kicker">OPTIMIZATION</span>
                        <h3>Performance findings</h3>
                      </div>
                    </div>
                    <div className="compact-finding-list">
                      {performanceIssues.map((item, index) => (
                        <CompactFinding key={index} text={item} />
                      ))}
                    </div>
                  </section>
                )}

                {suggestedTests.length > 0 && (
                  <section className="result-section">
                    <div className="section-title-row">
                      <div>
                        <span className="section-kicker">COVERAGE IDEAS</span>
                        <h3>Suggested test cases</h3>
                      </div>
                    </div>
                    <div className="compact-finding-list">
                      {suggestedTests.map((item, index) => (
                        <CompactFinding key={index} text={item} />
                      ))}
                    </div>
                  </section>
                )}

                <section className="result-section">
                  <div className="section-title-row">
                    <div>
                      <span className="section-kicker">ACTIONS</span>
                      <h3>Next steps</h3>
                    </div>
                  </div>
                  <div className="action-grid">
                    <button
                      className="button button-secondary action-tile"
                      onClick={handleGenerateFix}
                      disabled={busy || issues.length === 0}
                      id="generate-fix-btn"
                    >
                      <span className="action-tile-icon">⌘</span>
                      <span>
                        <strong>
                          {fixLoading ? "Generating fix..." : "Generate fix"}
                        </strong>
                        <small>Review changes before applying</small>
                      </span>
                    </button>

                    <button
                      className="button button-secondary action-tile"
                      onClick={handleGenerateTests}
                      disabled={busy}
                      id="generate-tests-btn"
                    >
                      <span className="action-tile-icon">✓</span>
                      <span>
                        <strong>
                          {testLoading
                            ? "Generating tests..."
                            : "Generate tests"}
                        </strong>
                        <small>Create tests for your code</small>
                      </span>
                    </button>
                  </div>
                </section>

                {fixedCode && (
                  <section className="result-section">
                    <div className="section-title-row">
                      <div>
                        <span className="section-kicker">PROPOSED CHANGE</span>
                        <h3>AI suggested fix</h3>
                      </div>
                      <span className="review-tag">Not applied</span>
                    </div>

                    <div className="diff-frame">
                      <DiffEditor
                        height="320px"
                        language={language}
                        original={code}
                        modified={fixedCode}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          renderSideBySide: true,
                          automaticLayout: true,
                          fontSize: 12,
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>

                    <button
                      className="button button-primary apply-button"
                      onClick={handleApplyFix}
                      disabled={workflowLoading}
                      id="apply-fix-btn"
                    >
                      Apply fix to editor
                    </button>
                  </section>
                )}

                {generatedTests && (
                  <section className="result-section">
                    <div className="section-title-row">
                      <div>
                        <span className="section-kicker">TESTING</span>
                        <h3>Generated tests</h3>
                      </div>
                      <span className="framework-tag">{testingFramework}</span>
                    </div>

                    <div className="test-editor-frame">
                      <Editor
                        height="280px"
                        language={language}
                        value={generatedTests}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          automaticLayout: true,
                          fontSize: 12,
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>

                    <button
                      className="button button-primary run-tests-button"
                      onClick={handleRunTests}
                      disabled={busy}
                      id="run-tests-btn"
                    >
                      {runTestLoading ? (
                        <>
                          <span className="spinner" />
                          Running tests...
                        </>
                      ) : (
                        <>▶ Run tests</>
                      )}
                    </button>

                    {testResult && (
                      <div className="test-results">
                        <div className="test-result-heading">
                          <h4>Execution results</h4>
                          <span
                            className={`status-badge status-${(
                              testResult.status || "unknown"
                            ).toLowerCase()}`}
                          >
                            <span className="status-badge-dot" />
                            {testResult.status || "UNKNOWN"}
                          </span>
                        </div>

                        <div className="test-metrics">
                          <div className="test-metric">
                            <span>Passed</span>
                            <strong className="passed-text">
                              {testResult.passed ?? "—"}
                            </strong>
                          </div>
                          <div className="test-metric">
                            <span>Failed</span>
                            <strong className="failed-text">
                              {testResult.failed ?? "—"}
                            </strong>
                          </div>
                          <div className="test-metric">
                            <span>Total</span>
                            <strong>{testResult.total ?? "—"}</strong>
                          </div>
                        </div>

                        {testResult.duration && (
                          <p className="duration-line">
                            Duration{" "}
                            <strong>{testResult.duration}</strong>
                          </p>
                        )}

                        {testResult.output && (
                          <details className="output-details">
                            <summary>View detailed output</summary>
                            <pre>{testResult.output}</pre>
                          </details>
                        )}
                      </div>
                    )}

                    {analysisLoading && (
                      <div className="analysis-card">
                        <span className="spinner" />
                        <div>
                          <strong>Analyzing the failure</strong>
                          <p>AI is examining the test output.</p>
                        </div>
                      </div>
                    )}

                    {testAnalysis && (
                      <div className="analysis-card">
                        <div className="analysis-icon">✳</div>
                        <div className="analysis-content">
                          <div className="analysis-heading">
                            <h4>AI failure analysis</h4>
                            {testAnalysis.classification && (
                              <span className="classification-tag">
                                {testAnalysis.classification}
                              </span>
                            )}
                          </div>
                          <p>
                            {testAnalysis.explanation ||
                              "No explanation was returned."}
                          </p>
                          {testAnalysis.suggestedAction && (
                            <div className="analysis-action">
                              <strong>Suggested action</strong>
                              <p>{testAnalysis.suggestedAction}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      )}

      <footer className="app-footer">
        <span>AI Engineering Copilot</span>
        <span>Review carefully before applying AI-generated changes.</span>
      </footer>
    </div>
  );
}

export default App;
