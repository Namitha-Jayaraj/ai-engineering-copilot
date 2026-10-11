import React, { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  BarChart3,
  RefreshCw,
  ExternalLink,
  Trash2,
  Download,
  Search,
  Code2,
  Sparkles,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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

export interface SessionSummary {
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
}

export interface SessionDetail extends SessionSummary {
  summary: string | null;
  issues: any[];
  securityIssues: string[];
  performanceIssues: string[];
  suggestedTests: string[];
  fixed_code: string | null;
  tests_passed: number | null;
  tests_failed: number | null;
  tests_total: number | null;
  duration: string | null;
}

interface QualityDashboardProps {
  onLoadSession: (session: SessionDetail) => void;
  onSwitchToWorkspace: () => void;
  getJson: (endpoint: string) => Promise<any>;
  deleteRequest: (endpoint: string) => Promise<void>;
}

const PIE_COLORS = ["#8b9cff", "#ff7c88", "#f4c76b", "#50d5a0", "#a78bfa"];

// ─────────────────────────────────────────────────────────────
// Custom Tooltip for Charts
// ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{label || data.name || "Audit Point"}</p>
        <p className="chart-tooltip-value">
          <span style={{ color: payload[0].color || "var(--accent)" }}>● </span>
          {payload[0].name || "Score"}: <strong>{payload[0].value}</strong>
        </p>
        {data.language && (
          <p className="chart-tooltip-sub">
            Lang: <span className="capitalize">{data.language}</span> · Mode: {data.reviewMode}
          </p>
        )}
      </div>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const QualityDashboard: React.FC<QualityDashboardProps> = ({
  onLoadSession,
  onSwitchToWorkspace,
  getJson,
  deleteRequest,
}) => {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let fetchedSessions: SessionSummary[] = [];
      try {
        const historyData = await getJson("/api/history");
        fetchedSessions = historyData.sessions || [];
        setSessions(fetchedSessions);
      } catch {
        setSessions([]);
      }

      let fetchedStats: SessionStats | null = null;
      try {
        const statsData = await getJson("/api/history/stats");
        if (statsData?.stats) fetchedStats = statsData.stats;
      } catch {
        fetchedStats = null;
      }

      // If backend stats endpoint is not yet loaded, compute client-side
      if (!fetchedStats) {
        const total = fetchedSessions.length;
        let scoreSum = 0;
        let scoredCount = 0;
        let totalIssues = 0;
        let secIssues = 0;
        let perfIssues = 0;
        let testsTotal = 0;
        let testsPassed = 0;
        const langMap: Record<string, number> = {};
        const modeMap: Record<string, number> = {};

        for (const s of fetchedSessions) {
          if (s.score !== null && s.score !== undefined) {
            scoreSum += s.score;
            scoredCount++;
          }
          totalIssues += s.issue_count || 0;
          secIssues += s.security_count || 0;
          perfIssues += s.performance_count || 0;
          if (s.test_status === "PASS") testsPassed++;
          if (s.test_status) testsTotal++;
          langMap[s.language] = (langMap[s.language] || 0) + 1;
          modeMap[s.review_mode] = (modeMap[s.review_mode] || 0) + 1;
        }

        fetchedStats = {
          totalSessions: total,
          avgScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
          totalIssues,
          totalSecurityIssues: secIssues,
          totalPerformanceIssues: perfIssues,
          testPassRate: testsTotal > 0 ? Math.round((testsPassed / testsTotal) * 100) : 100,
          scoreTimeline: [...fetchedSessions]
            .filter((s) => s.score !== null)
            .reverse()
            .slice(-30)
            .map((s) => ({
              id: s.id,
              createdAt: s.created_at,
              score: s.score as number,
              language: s.language,
              reviewMode: s.review_mode,
            })),
          languageBreakdown: Object.entries(langMap).map(([language, count]) => ({ language, count })),
          modeBreakdown: Object.entries(modeMap).map(([mode, count]) => ({ mode, count })),
          issueBreakdown: [
            { name: "Code Quality & Bugs", value: Math.max(0, totalIssues - secIssues - perfIssues) },
            { name: "Security Vulnerabilities", value: secIssues },
            { name: "Performance Bottlenecks", value: perfIssues },
          ],
        };
      }

      setStats(fetchedStats);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered session list for the audit log table
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesLang =
        selectedLanguage === "all" ||
        s.language.toLowerCase() === selectedLanguage.toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        s.code_snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.review_mode.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesLang && matchesSearch;
    });
  }, [sessions, selectedLanguage, searchQuery]);

  // Chart-ready timeline data formatted nicely
  const timelineData = useMemo(() => {
    if (!stats?.scoreTimeline || stats.scoreTimeline.length === 0) return [];
    return stats.scoreTimeline.map((item, idx) => {
      const d = new Date(item.createdAt);
      const timeStr = `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      return {
        idx: `#${idx + 1}`,
        time: timeStr,
        score: item.score,
        language: item.language,
        reviewMode: item.reviewMode,
      };
    });
  }, [stats]);

  // Pie chart data for issues
  const issueDistribution = useMemo(() => {
    if (!stats?.issueBreakdown) return [];
    return stats.issueBreakdown.filter((item) => item.value > 0);
  }, [stats]);

  // Handler to inspect & open a session
  const handleOpenSession = async (id: string) => {
    setLoadingSessionId(id);
    try {
      const data = await getJson(`/api/history/${id}`);
      onLoadSession(data.session);
      onSwitchToWorkspace();
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setLoadingSessionId(null);
    }
  };

  // Handler to delete a session
  const handleDeleteSession = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRequest(`/api/history/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      fetchData(true);
    } catch (err) {
      console.error("Failed to delete session:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // Export Audit Report JSON
  const handleExportReport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      copilotVersion: "2.4.0",
      stats,
      sessions,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `copilot-quality-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format relative time helper
  const getRelativeTime = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return { grade: "A+", desc: "Optimal Code Health", color: "var(--green)" };
    if (score >= 80) return { grade: "A", desc: "Production Ready", color: "var(--green)" };
    if (score >= 65) return { grade: "B", desc: "Minor Improvements Needed", color: "var(--yellow)" };
    if (score >= 50) return { grade: "C", desc: "Refactoring Recommended", color: "var(--yellow)" };
    return { grade: "D", desc: "Critical Issues Present", color: "var(--red)" };
  };

  const scoreInfo = stats ? getScoreGrade(stats.avgScore) : null;

  return (
    <div className="dashboard-container">
      {/* ── Dashboard Header ────────────────────────────── */}
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <div className="dashboard-badge">
            <BarChart3 size={16} />
            <span>EXECUTIVE METRICS</span>
          </div>
          <h1>Code Quality & Reliability Dashboard</h1>
          <p>
            Real-time telemetry, vulnerability detection rates, and historical review performance
          </p>
        </div>

        <div className="dashboard-actions">
          <button
            className="secondary-btn"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Refresh analytics"
          >
            <RefreshCw size={15} className={refreshing ? "spin-animation" : ""} />
            <span>Refresh</span>
          </button>

          <button
            className="secondary-btn"
            onClick={handleExportReport}
            disabled={sessions.length === 0}
            title="Download audit report JSON"
          >
            <Download size={15} />
            <span>Export Audit</span>
          </button>

          <button className="primary-btn" onClick={onSwitchToWorkspace}>
            <Code2 size={16} />
            <span>Open Workspace</span>
          </button>
        </div>
      </header>

      {/* ── KPI Metric Cards ────────────────────────────── */}
      <div className="dashboard-kpi-grid">
        {/* KPI 1: Avg Score */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Average Quality Score</span>
            <div className="kpi-icon-wrap accent-tint">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span
              className="kpi-value"
              style={{ color: scoreInfo ? scoreInfo.color : "var(--accent)" }}
            >
              {stats?.totalSessions ? `${stats.avgScore}` : "—"}
            </span>
            <span className="kpi-denom">/100</span>
            {scoreInfo && (
              <span className="kpi-grade-pill" style={{ borderColor: scoreInfo.color, color: scoreInfo.color }}>
                {scoreInfo.grade}
              </span>
            )}
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {stats?.totalSessions ? scoreInfo?.desc : "No review sessions logged yet"}
            </span>
          </div>
        </div>

        {/* KPI 2: Total Reviews */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Audits Performed</span>
            <div className="kpi-icon-wrap blue-tint">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{stats?.totalSessions || 0}</span>
            <span className="kpi-denom">sessions</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {stats?.languageBreakdown?.length
                ? `${stats.languageBreakdown.length} languages evaluated`
                : "Awaiting workspace activity"}
            </span>
          </div>
        </div>

        {/* KPI 3: Vulnerabilities & Bottlenecks Caught */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Security & Perf Findings</span>
            <div className="kpi-icon-wrap red-tint">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: "var(--red)" }}>
              {(stats?.totalSecurityIssues || 0) + (stats?.totalPerformanceIssues || 0)}
            </span>
            <span className="kpi-denom">threats caught</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {stats?.totalSecurityIssues || 0} security · {stats?.totalPerformanceIssues || 0} performance
            </span>
          </div>
        </div>

        {/* KPI 4: Test Pass Rate */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Automated Test Pass Rate</span>
            <div className="kpi-icon-wrap green-tint">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: "var(--green)" }}>
              {stats?.testPassRate !== undefined ? `${stats.testPassRate}%` : "100%"}
            </span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">From Jest & PyTest runner executions</span>
          </div>
        </div>
      </div>

      {/* ── Empty State Prompt (if no reviews yet) ─────── */}
      {sessions.length === 0 && !loading && (
        <div className="dashboard-empty-banner">
          <div className="empty-banner-content">
            <h3>Start gathering reliability insights</h3>
            <p>
              Run your first code review in the workspace. Each review automatically captures code
              quality metrics, security flags, and test outcomes into SQLite.
            </p>
            <button className="primary-btn" onClick={onSwitchToWorkspace}>
              Launch Code Review
            </button>
          </div>
        </div>
      )}

      {/* ── Interactive Charts Section ─────────────────── */}
      {sessions.length > 0 && (
        <div className="dashboard-charts-grid">
          {/* Chart 1: Quality Score Timeline */}
          <div className="dashboard-chart-card wide-chart">
            <div className="chart-header">
              <div>
                <span className="chart-eyebrow">HISTORICAL TREND</span>
                <h3>Code Quality Score Velocity</h3>
              </div>
              <div className="chart-badge">
                <TrendingUp size={14} />
                <span>Last {timelineData.length} Reviews</span>
              </div>
            </div>

            <div className="chart-body" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b9cff" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#8b9cff" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#202838" />
                  <XAxis dataKey="idx" stroke="#68758a" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} stroke="#68758a" tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    name="Score"
                    stroke="#8b9cff"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#scoreGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Issue Type Breakdown */}
          <div className="dashboard-chart-card">
            <div className="chart-header">
              <div>
                <span className="chart-eyebrow">DISTRIBUTION</span>
                <h3>Finding Categories</h3>
              </div>
            </div>

            <div className="chart-body" style={{ height: 280 }}>
              {issueDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={issueDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="48%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                    >
                      {issueDistribution.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                      formatter={(val) => <span style={{ color: "var(--muted)" }}>{val}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty-state">
                  <span>No issue classifications recorded yet</span>
                </div>
              )}
            </div>
          </div>

          {/* Chart 3: Languages Evaluated */}
          <div className="dashboard-chart-card">
            <div className="chart-header">
              <div>
                <span className="chart-eyebrow">TECH STACK</span>
                <h3>Reviews by Language</h3>
              </div>
            </div>

            <div className="chart-body" style={{ height: 280 }}>
              {stats?.languageBreakdown && stats.languageBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.languageBreakdown}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#202838" />
                    <XAxis
                      dataKey="language"
                      stroke="#68758a"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
                    />
                    <YAxis stroke="#68758a" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="count"
                      name="Sessions"
                      fill="#50d5a0"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty-state">
                  <span>No language breakdown data</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Historical Audit Log Table ──────────────────── */}
      <section className="dashboard-table-section">
        <div className="table-section-header">
          <div>
            <span className="chart-eyebrow">AUDIT TRAIL</span>
            <h2>Session Quality Log</h2>
            <p className="table-subtext">
              Detailed inspection logs from previous reviews with one-click restore to editor
            </p>
          </div>

          <div className="table-filter-bar">
            {/* Search Input */}
            <div className="table-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Filter by code or mode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Language filter select */}
            <select
              className="table-lang-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              <option value="all">All Languages</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
            </select>
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="table-empty">
            <p>No review sessions match your filters</p>
          </div>
        ) : (
          <div className="dashboard-table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Language / Mode</th>
                  <th>Code Snippet</th>
                  <th>Score</th>
                  <th>Issues Detected</th>
                  <th>Test Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const scoreColor =
                    (session.score || 0) >= 80
                      ? "var(--green)"
                      : (session.score || 0) >= 55
                      ? "var(--yellow)"
                      : "var(--red)";

                  return (
                    <tr key={session.id}>
                      <td className="cell-time">
                        {getRelativeTime(session.created_at)}
                      </td>
                      <td>
                        <div className="cell-meta">
                          <span className="lang-pill">{session.language}</span>
                          <span className="mode-pill">{session.review_mode}</span>
                        </div>
                      </td>
                      <td className="cell-code">
                        <code>{session.code_snippet}</code>
                      </td>
                      <td>
                        {session.score !== null ? (
                          <span
                            className="score-badge-pill"
                            style={{ color: scoreColor, borderColor: scoreColor }}
                          >
                            {session.score}/100
                          </span>
                        ) : (
                          <span className="score-badge-pill null-score">—</span>
                        )}
                      </td>
                      <td>
                        <div className="findings-inline">
                          <span className="finding-count" title="Total Issues">
                            {session.issue_count} total
                          </span>
                          {session.security_count > 0 && (
                            <span className="finding-badge sec" title="Security Risks">
                              {session.security_count} sec
                            </span>
                          )}
                          {session.performance_count > 0 && (
                            <span className="finding-badge perf" title="Performance Bottlenecks">
                              {session.performance_count} perf
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {session.test_status === "PASS" ? (
                          <span className="test-badge pass">
                            <CheckCircle2 size={12} /> PASS
                          </span>
                        ) : session.test_status === "FAIL" ? (
                          <span className="test-badge fail">
                            <XCircle size={12} /> FAIL
                          </span>
                        ) : (
                          <span className="test-badge none">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="table-actions">
                          <button
                            className="table-btn load-btn"
                            onClick={() => handleOpenSession(session.id)}
                            disabled={loadingSessionId === session.id}
                            title="Load code & review in workspace editor"
                          >
                            <ExternalLink size={13} />
                            <span>{loadingSessionId === session.id ? "Loading..." : "Inspect"}</span>
                          </button>
                          <button
                            className="table-btn delete-btn"
                            onClick={() => handleDeleteSession(session.id)}
                            disabled={deletingId === session.id}
                            title="Delete session record"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default QualityDashboard;
