import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// ────────────────────────────────────────────────────────────
// DB bootstrap
// ────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve("data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "sessions.db"));

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ────────────────────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    language      TEXT NOT NULL,
    review_mode   TEXT NOT NULL,
    code_snippet  TEXT NOT NULL,
    score         INTEGER,
    summary       TEXT,
    issue_count   INTEGER DEFAULT 0,
    security_count INTEGER DEFAULT 0,
    performance_count INTEGER DEFAULT 0,
    issues        TEXT,           -- JSON array
    security_issues TEXT,         -- JSON array
    performance_issues TEXT,      -- JSON array
    suggested_tests TEXT,         -- JSON array
    fixed_code    TEXT,
    test_status   TEXT,           -- PASS | FAIL | ERROR | null
    tests_passed  INTEGER,
    tests_failed  INTEGER,
    tests_total   INTEGER,
    duration      TEXT
  );
`);

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  created_at: string;
  language: string;
  review_mode: string;
  code_snippet: string;
  score: number | null;
  summary: string | null;
  issue_count: number;
  security_count: number;
  performance_count: number;
  issues: string | null;
  security_issues: string | null;
  performance_issues: string | null;
  suggested_tests: string | null;
  fixed_code: string | null;
  test_status: string | null;
  tests_passed: number | null;
  tests_failed: number | null;
  tests_total: number | null;
  duration: string | null;
}

export interface SessionSummary {
  id: string;
  created_at: string;
  language: string;
  review_mode: string;
  code_snippet: string; // first 120 chars
  score: number | null;
  issue_count: number;
  security_count: number;
  performance_count: number;
  test_status: string | null;
}

export interface CreateSessionInput {
  language: string;
  reviewMode: string;
  code: string;
  score?: number;
  summary?: string;
  issues?: object[];
  securityIssues?: string[];
  performanceIssues?: string[];
  suggestedTests?: string[];
  fixedCode?: string;
  testStatus?: string;
  testsPassed?: number;
  testsFailed?: number;
  testsTotal?: number;
  duration?: string;
}

// ────────────────────────────────────────────────────────────
// Prepared statements
// ────────────────────────────────────────────────────────────

const insertSession = db.prepare<SessionRow>(`
  INSERT INTO sessions (
    id, language, review_mode, code_snippet, score, summary,
    issue_count, security_count, performance_count,
    issues, security_issues, performance_issues, suggested_tests,
    fixed_code, test_status, tests_passed, tests_failed, tests_total, duration
  ) VALUES (
    @id, @language, @review_mode, @code_snippet, @score, @summary,
    @issue_count, @security_count, @performance_count,
    @issues, @security_issues, @performance_issues, @suggested_tests,
    @fixed_code, @test_status, @tests_passed, @tests_failed, @tests_total, @duration
  )
`);

const updateSessionTests = db.prepare(`
  UPDATE sessions SET
    test_status   = @test_status,
    tests_passed  = @tests_passed,
    tests_failed  = @tests_failed,
    tests_total   = @tests_total,
    duration      = @duration
  WHERE id = @id
`);

const selectAllSessions = db.prepare<[], SessionRow>(`
  SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100
`);

const selectSessionById = db.prepare<[string], SessionRow>(`
  SELECT * FROM sessions WHERE id = ?
`);

const deleteSessionById = db.prepare<[string], void>(`
  DELETE FROM sessions WHERE id = ?
`);

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function createSession(input: CreateSessionInput): string {
  const id = uuidv4();
  const issues = input.issues ?? [];
  const securityIssues = input.securityIssues ?? [];
  const performanceIssues = input.performanceIssues ?? [];
  const suggestedTests = input.suggestedTests ?? [];

  insertSession.run({
    id,
    language: input.language,
    review_mode: input.reviewMode,
    code_snippet: input.code.slice(0, 2000),
    score: input.score ?? null,
    summary: input.summary ?? null,
    issue_count: issues.length,
    security_count: securityIssues.length,
    performance_count: performanceIssues.length,
    issues: JSON.stringify(issues),
    security_issues: JSON.stringify(securityIssues),
    performance_issues: JSON.stringify(performanceIssues),
    suggested_tests: JSON.stringify(suggestedTests),
    fixed_code: input.fixedCode ?? null,
    test_status: input.testStatus ?? null,
    tests_passed: input.testsPassed ?? null,
    tests_failed: input.testsFailed ?? null,
    tests_total: input.testsTotal ?? null,
    duration: input.duration ?? null,
  } as unknown as SessionRow);

  return id;
}

export function patchSessionTests(
  id: string,
  testStatus: string,
  passed: number | null,
  failed: number | null,
  total: number | null,
  duration: string | null
): void {
  updateSessionTests.run({
    id,
    test_status: testStatus,
    tests_passed: passed,
    tests_failed: failed,
    tests_total: total,
    duration,
  });
}

export function getAllSessions(): SessionSummary[] {
  const rows = selectAllSessions.all();
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    language: r.language,
    review_mode: r.review_mode,
    code_snippet: r.code_snippet.slice(0, 120),
    score: r.score,
    issue_count: r.issue_count,
    security_count: r.security_count,
    performance_count: r.performance_count,
    test_status: r.test_status,
  }));
}

export function getSessionById(id: string): SessionRow | null {
  const row = selectSessionById.get(id);
  return row ?? null;
}

export function deleteSession(id: string): void {
  deleteSessionById.run(id);
}

export interface SessionStats {
  totalSessions: number;
  avgScore: number;
  totalIssues: number;
  totalSecurityIssues: number;
  totalPerformanceIssues: number;
  testPassRate: number;
  scoreTimeline: {
    id: string;
    createdAt: string;
    score: number;
    language: string;
    reviewMode: string;
  }[];
  languageBreakdown: { language: string; count: number }[];
  issueBreakdown: { name: string; value: number }[];
  modeBreakdown: { mode: string; count: number }[];
}

export function getSessionStats(): SessionStats {
  const allRows = selectAllSessions.all();
  const totalSessions = allRows.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      avgScore: 0,
      totalIssues: 0,
      totalSecurityIssues: 0,
      totalPerformanceIssues: 0,
      testPassRate: 0,
      scoreTimeline: [],
      languageBreakdown: [],
      issueBreakdown: [
        { name: "Code Quality / Bugs", value: 0 },
        { name: "Security Risks", value: 0 },
        { name: "Performance", value: 0 },
      ],
      modeBreakdown: [],
    };
  }

  let scoreSum = 0;
  let scoredCount = 0;
  let totalIssues = 0;
  let totalSecurityIssues = 0;
  let totalPerformanceIssues = 0;
  let testsTotal = 0;
  let testsPassed = 0;

  const langMap: Record<string, number> = {};
  const modeMap: Record<string, number> = {};

  for (const r of allRows) {
    if (r.score !== null && r.score !== undefined) {
      scoreSum += r.score;
      scoredCount++;
    }
    totalIssues += r.issue_count || 0;
    totalSecurityIssues += r.security_count || 0;
    totalPerformanceIssues += r.performance_count || 0;

    if (r.tests_total) testsTotal += r.tests_total;
    if (r.tests_passed) testsPassed += r.tests_passed;

    langMap[r.language] = (langMap[r.language] || 0) + 1;
    modeMap[r.review_mode] = (modeMap[r.review_mode] || 0) + 1;
  }

  // Sort chronologically for timeline
  const scoreTimeline = [...allRows]
    .filter((r) => r.score !== null && r.score !== undefined)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-30)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      score: r.score as number,
      language: r.language,
      reviewMode: r.review_mode,
    }));

  const languageBreakdown = Object.entries(langMap).map(([language, count]) => ({
    language,
    count,
  }));

  const modeBreakdown = Object.entries(modeMap).map(([mode, count]) => ({
    mode,
    count,
  }));

  const otherIssues = Math.max(0, totalIssues - totalSecurityIssues - totalPerformanceIssues);

  const issueBreakdown = [
    { name: "Code Quality & Bugs", value: otherIssues > 0 ? otherIssues : totalIssues },
    { name: "Security Vulnerabilities", value: totalSecurityIssues },
    { name: "Performance Bottlenecks", value: totalPerformanceIssues },
  ];

  const testPassRate = testsTotal > 0 ? Math.round((testsPassed / testsTotal) * 100) : 100;
  const avgScore = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0;

  return {
    totalSessions,
    avgScore,
    totalIssues,
    totalSecurityIssues,
    totalPerformanceIssues,
    testPassRate,
    scoreTimeline,
    languageBreakdown,
    issueBreakdown,
    modeBreakdown,
  };
}

export default db;

