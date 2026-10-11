import { useState, useEffect } from "react";
import {
  GitPullRequest,
  GitCommit,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  ExternalLink,
  Copy,
  Check,
  Code2,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

export interface GitHubPrFile {
  sha: string;
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

export interface GitHubPrDetails {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  createdAt: string;
  user: {
    login: string;
    avatarUrl: string;
  };
  headBranch: string;
  baseBranch: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  commitsCount: number;
  files: GitHubPrFile[];
}

export interface PrReviewFinding {
  file: string;
  line: number;
  type: "BUG" | "SECURITY" | "PERFORMANCE" | "QUALITY";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  suggestedPatch?: string;
}

export interface PrReviewResult {
  verdict: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  riskScore: number;
  summary: string;
  keyPositives: string[];
  findings: PrReviewFinding[];
  markdownComment: string;
}

export interface SamplePrSummary {
  id: string;
  title: string;
  owner: string;
  repo: string;
  pullNumber: number;
  url: string;
  filesCount: number;
  additions: number;
  deletions: number;
  description: string;
}

interface GitHubPrReviewerProps {
  onLoadIntoEditor: (code: string, language: string) => void;
  onSwitchToWorkspace: () => void;
  postJson: (endpoint: string, body: Record<string, unknown>) => Promise<any>;
  getJson: (endpoint: string) => Promise<any>;
}

export default function GitHubPrReviewer({
  onLoadIntoEditor,
  onSwitchToWorkspace,
  postJson,
  getJson,
}: GitHubPrReviewerProps) {
  const [samples, setSamples] = useState<SamplePrSummary[]>([]);
  const [prUrl, setPrUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string>("");

  const [pr, setPr] = useState<GitHubPrDetails | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [reviewMode, setReviewMode] = useState<string>("full");

  const [loadingPr, setLoadingPr] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<PrReviewResult | null>(null);

  const [postingComment, setPostingComment] = useState(false);
  const [commentResult, setCommentResult] = useState<{ ok: boolean; commentUrl?: string } | null>(null);
  const [copiedComment, setCopiedComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDesc, setExpandedDesc] = useState(false);

  // Load sample PRs on mount
  useEffect(() => {
    getJson("/api/github/samples")
      .then((data) => {
        if (data.samples) {
          setSamples(data.samples);
          // Auto-load first sample as starting point
          if (data.samples.length > 0) {
            handleLoadSample(data.samples[0].id);
          }
        }
      })
      .catch((err) => console.error("Failed to load sample PRs:", err));
  }, []);

  async function handleLoadSample(sampleId: string) {
    setSelectedSampleId(sampleId);
    setError(null);
    setLoadingPr(true);
    setReviewResult(null);
    setCommentResult(null);
    setSelectedFileIndex(0);

    try {
      const data = await postJson("/api/github/pr", { sampleId });
      if (data.pr) {
        setPr(data.pr);
        setPrUrl(data.pr.htmlUrl);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load sample PR");
    } finally {
      setLoadingPr(false);
    }
  }

  async function handleFetchCustomPr() {
    if (!prUrl.trim()) {
      setError("Please enter a GitHub Pull Request URL or shorthand (e.g. owner/repo#123)");
      return;
    }

    setError(null);
    setLoadingPr(true);
    setReviewResult(null);
    setCommentResult(null);
    setSelectedSampleId("");
    setSelectedFileIndex(0);

    try {
      const data = await postJson("/api/github/pr", {
        prUrl: prUrl.trim(),
        token: githubToken.trim() || undefined,
      });
      if (data.pr) {
        setPr(data.pr);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch Pull Request from GitHub.");
    } finally {
      setLoadingPr(false);
    }
  }

  async function handleRunReview() {
    if (!pr) return;

    setError(null);
    setReviewing(true);
    setCommentResult(null);

    try {
      const data = await postJson("/api/github/review", {
        pr,
        reviewMode,
      });

      if (data.review) {
        setReviewResult(data.review);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate AI PR review.");
    } finally {
      setReviewing(false);
    }
  }

  async function handlePostComment() {
    if (!pr || !reviewResult) return;
    if (!githubToken.trim()) {
      setShowTokenInput(true);
      setError("A GitHub Personal Access Token is required to post review comments to GitHub.");
      return;
    }

    setError(null);
    setPostingComment(true);

    try {
      const data = await postJson("/api/github/comment", {
        owner: pr.owner,
        repo: pr.repo,
        pullNumber: pr.pullNumber,
        comment: reviewResult.markdownComment,
        token: githubToken.trim(),
      });

      setCommentResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to post comment to GitHub.");
    } finally {
      setPostingComment(false);
    }
  }

  function handleCopyComment() {
    if (!reviewResult) return;
    navigator.clipboard.writeText(reviewResult.markdownComment);
    setCopiedComment(true);
    setTimeout(() => setCopiedComment(false), 2500);
  }

  function handleSendToWorkspace(patchContent?: string, filename?: string) {
    if (!pr) return;
    const content =
      patchContent ||
      pr.files.map((f) => `// ================================\n// File: ${f.filename} (+${f.additions} / -${f.deletions})\n// ================================\n${f.patch || "(no diff content)"}\n`).join("\n");

    const ext = (filename || pr.files[0]?.filename || "").split(".").pop()?.toLowerCase();
    const lang =
      ext === "ts" || ext === "tsx"
        ? "typescript"
        : ext === "py"
        ? "python"
        : ext === "java"
        ? "java"
        : "javascript";

    onLoadIntoEditor(content, lang);
    onSwitchToWorkspace();
  }

  const selectedFile = pr?.files[selectedFileIndex];

  // Filter findings for currently selected file
  const fileFindings = reviewResult?.findings.filter((f) =>
    selectedFile ? f.file.toLowerCase().includes(selectedFile.filename.toLowerCase()) || selectedFile.filename.toLowerCase().includes(f.file.toLowerCase()) : false
  ) || [];

  return (
    <div className="pr-container">
      {/* ── Subheader Controls Bar ── */}
      <div className="pr-header-card">
        <div className="pr-header-top">
          <div className="pr-header-title-box">
            <div className="pr-icon-badge">
              <GitPullRequest size={20} className="text-accent" />
            </div>
            <div>
              <h2 className="pr-title">GitHub Pull Request Reviewer</h2>
              <p className="pr-subtitle">
                Inspect live GitHub PR changesets, detect security vulnerabilities, run AI regression audits & post comments back to GitHub.
              </p>
            </div>
          </div>

          {/* Quick Demo Samples */}
          <div className="pr-samples-group">
            <span className="pr-samples-label">Demo Samples:</span>
            {samples.map((s) => (
              <button
                key={s.id}
                className={`pr-sample-btn ${selectedSampleId === s.id ? "pr-sample-btn--active" : ""}`}
                onClick={() => handleLoadSample(s.id)}
                disabled={loadingPr || reviewing}
              >
                <span className="pr-sample-indicator" />
                <span className="pr-sample-name">
                  {s.id === "express-auth-security" ? "Auth & Security Flaw" : "React Grid Perf O(N²)"}
                </span>
                <span className="pr-sample-files">({s.filesCount} files)</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="pr-input-row">
          <div className="pr-input-group">
            <GitPullRequest size={16} className="pr-input-icon" />
            <input
              type="text"
              className="pr-url-input"
              placeholder="Paste GitHub PR URL (e.g. https://github.com/owner/repo/pull/142 or owner/repo#142)"
              value={prUrl}
              onChange={(e) => {
                setPrUrl(e.target.value);
                setSelectedSampleId("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleFetchCustomPr()}
              disabled={loadingPr || reviewing}
            />
          </div>

          <button
            className="button button-primary pr-fetch-btn"
            onClick={handleFetchCustomPr}
            disabled={loadingPr || reviewing || !prUrl.trim()}
          >
            {loadingPr ? (
              <>
                <span className="spinner" />
                Fetching PR...
              </>
            ) : (
              <>
                <GitCommit size={15} />
                Fetch Pull Request
              </>
            )}
          </button>

          <button
            className={`pr-token-toggle-btn ${showTokenInput ? "pr-token-toggle-btn--active" : ""}`}
            onClick={() => setShowTokenInput(!showTokenInput)}
            title="Configure GitHub Token for private repositories or posting review comments"
          >
            🔑 GitHub Token {githubToken.trim() ? "✓" : ""}
          </button>
        </div>

        {/* Optional GitHub Token Drawer */}
        {showTokenInput && (
          <div className="pr-token-box">
            <div className="pr-token-info">
              <span className="eyebrow">OPTIONAL GITHUB PERSONAL ACCESS TOKEN</span>
              <p className="pr-token-hint">
                Required only to audit <strong>private repos</strong> or post <strong>review comments</strong> back to GitHub. Public PR audits work instantly without any token!
              </p>
            </div>
            <input
              type="password"
              className="pr-token-input"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
          </div>
        )}

        {error && (
          <div className="pr-alert pr-alert--error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Main PR View ── */}
      {pr && (
        <div className="pr-content-grid">
          {/* ── Left Column: Metadata & PR Audit ── */}
          <div className="pr-meta-column">
            {/* PR Overview Card */}
            <div className="pr-meta-card">
              <div className="pr-meta-header">
                <div className="pr-repo-pill">
                  <span>{pr.owner}</span>
                  <span className="pr-repo-sep">/</span>
                  <strong>{pr.repo}</strong>
                  <span className="pr-num-pill">#{pr.pullNumber}</span>
                </div>
                <div className="pr-state-badge">
                  <span className="pr-state-dot" />
                  {pr.state.toUpperCase()}
                </div>
              </div>

              <h3 className="pr-meta-title">{pr.title}</h3>

              <div className="pr-author-bar">
                <img src={pr.user.avatarUrl} alt={pr.user.login} className="pr-author-avatar" />
                <div className="pr-author-info">
                  <span className="pr-author-login">@{pr.user.login}</span>
                  <span className="pr-branches-flow">
                    <span className="branch-pill">{pr.headBranch}</span>
                    <span className="branch-arrow">➔</span>
                    <span className="branch-pill">{pr.baseBranch}</span>
                  </span>
                </div>
                <a
                  href={pr.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pr-external-link"
                  title="Open in GitHub"
                >
                  <ExternalLink size={15} />
                </a>
              </div>

              {/* Stats badges */}
              <div className="pr-diff-stats">
                <span className="stat-chip stat-chip--files">
                  <Code2 size={13} />
                  {pr.changedFilesCount} files changed
                </span>
                <span className="stat-chip stat-chip--additions">+{pr.additions}</span>
                <span className="stat-chip stat-chip--deletions">-{pr.deletions}</span>
                <span className="stat-chip stat-chip--commits">
                  <GitCommit size={13} />
                  {pr.commitsCount} commits
                </span>
              </div>

              {/* Description preview */}
              {pr.body && (
                <div className="pr-desc-box">
                  <button
                    className="pr-desc-toggle"
                    onClick={() => setExpandedDesc(!expandedDesc)}
                  >
                    <span>PR Description</span>
                    {expandedDesc ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {expandedDesc && <div className="pr-desc-body">{pr.body}</div>}
                </div>
              )}

              {/* Review Launch Action */}
              <div className="pr-audit-action-box">
                <label className="field pr-mode-select">
                  <span>Review Mode</span>
                  <select
                    value={reviewMode}
                    onChange={(e) => setReviewMode(e.target.value)}
                    disabled={reviewing}
                  >
                    <option value="full">Comprehensive Senior Review</option>
                    <option value="security">Security & Vulnerability Audit</option>
                    <option value="performance">Performance & Scalability</option>
                    <option value="quality">Clean Code & Architecture</option>
                  </select>
                </label>

                <button
                  className="button button-primary button-large pr-run-review-btn"
                  onClick={handleRunReview}
                  disabled={reviewing || loadingPr}
                >
                  {reviewing ? (
                    <>
                      <span className="spinner" />
                      Auditing PR Changeset...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Run AI PR Review
                    </>
                  )}
                </button>

                <button
                  className="button button-secondary pr-open-workspace-btn"
                  onClick={() => handleSendToWorkspace()}
                  title="Load the diff patches into the Monaco Editor workspace"
                >
                  <Code2 size={15} />
                  Open in Workspace Editor
                </button>
              </div>
            </div>

            {/* AI Review Result Card */}
            {reviewResult && (
              <div className="pr-verdict-card">
                <div className="pr-verdict-header">
                  <div>
                    <span className="eyebrow">AI PULL REQUEST AUDIT</span>
                    <h3 className="pr-verdict-title">Executive Evaluation</h3>
                  </div>

                  <div className={`pr-verdict-tag pr-verdict-tag--${reviewResult.verdict.toLowerCase()}`}>
                    {reviewResult.verdict === "APPROVE" && <CheckCircle2 size={16} />}
                    {reviewResult.verdict === "REQUEST_CHANGES" && <XCircle size={16} />}
                    {reviewResult.verdict === "COMMENT" && <AlertTriangle size={16} />}
                    <span>{reviewResult.verdict.replace("_", " ")}</span>
                  </div>
                </div>

                {/* Score gauge bar */}
                <div className="pr-score-card">
                  <div className="pr-score-row">
                    <span className="pr-score-label">Quality & Safety Index</span>
                    <span
                      className={`pr-score-val ${
                        reviewResult.riskScore >= 75
                          ? "pr-score-good"
                          : reviewResult.riskScore >= 50
                          ? "pr-score-warn"
                          : "pr-score-bad"
                      }`}
                    >
                      {reviewResult.riskScore} / 100
                    </span>
                  </div>
                  <div className="pr-score-track">
                    <div
                      className={`pr-score-fill ${
                        reviewResult.riskScore >= 75
                          ? "pr-score-fill-good"
                          : reviewResult.riskScore >= 50
                          ? "pr-score-fill-warn"
                          : "pr-score-fill-bad"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, reviewResult.riskScore))}%` }}
                    />
                  </div>
                </div>

                <div className="pr-summary-text">
                  <p>{reviewResult.summary}</p>
                </div>

                {reviewResult.keyPositives && reviewResult.keyPositives.length > 0 && (
                  <div className="pr-positives-box">
                    <span className="pr-positives-title">
                      <CheckCircle2 size={14} className="text-green" /> Key Strengths:
                    </span>
                    <ul className="pr-positives-list">
                      {reviewResult.keyPositives.map((pos, idx) => (
                        <li key={idx}>{pos}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Export / GitHub Post section */}
                <div className="pr-export-box">
                  <div className="pr-export-header">
                    <span className="pr-export-title">Ready-to-Post Markdown Review</span>
                    <div className="pr-export-actions">
                      <button className="button button-small" onClick={handleCopyComment}>
                        {copiedComment ? <Check size={13} /> : <Copy size={13} />}
                        {copiedComment ? "Copied!" : "Copy Markdown"}
                      </button>
                      <button
                        className="button button-small button-primary"
                        onClick={handlePostComment}
                        disabled={postingComment}
                      >
                        {postingComment ? (
                          <span className="spinner" />
                        ) : (
                          <Send size={13} />
                        )}
                        Post to GitHub PR
                      </button>
                    </div>
                  </div>

                  {commentResult?.ok && (
                    <div className="pr-alert pr-alert--success">
                      <CheckCircle2 size={15} />
                      <span>Comment successfully posted to GitHub PR!</span>
                      {commentResult.commentUrl && (
                        <a
                          href={commentResult.commentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="pr-comment-link"
                        >
                          View comment on GitHub ➔
                        </a>
                      )}
                    </div>
                  )}

                  <pre className="pr-comment-preview">{reviewResult.markdownComment}</pre>
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column: Changed Files & Diff Inspector ── */}
          <div className="pr-diff-column">
            {/* Files list selector */}
            <div className="pr-files-bar">
              <span className="eyebrow">CHANGED FILES ({pr.files.length})</span>
              <div className="pr-files-tabs">
                {pr.files.map((file, idx) => {
                  const findingCount =
                    reviewResult?.findings.filter((f) =>
                      f.file.toLowerCase().includes(file.filename.toLowerCase()) || file.filename.toLowerCase().includes(f.file.toLowerCase())
                    ).length || 0;

                  return (
                    <button
                      key={file.filename}
                      className={`pr-file-tab ${selectedFileIndex === idx ? "pr-file-tab--active" : ""}`}
                      onClick={() => setSelectedFileIndex(idx)}
                    >
                      <span className={`file-status-indicator file-status-${file.status}`}>
                        {file.status[0].toUpperCase()}
                      </span>
                      <span className="pr-file-name">{file.filename}</span>
                      <span className="pr-file-delta">
                        +{file.additions} -{file.deletions}
                      </span>
                      {findingCount > 0 && (
                        <span className="pr-file-finding-badge" title={`${findingCount} AI findings on this file`}>
                          {findingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Findings for this file */}
            {fileFindings.length > 0 && (
              <div className="pr-file-findings-panel">
                <div className="pr-file-findings-header">
                  <div className="pr-finding-title-row">
                    <ShieldAlert size={16} className="text-red" />
                    <h4>AI Findings on {selectedFile?.filename}</h4>
                  </div>
                  <span className="pr-findings-count-pill">{fileFindings.length} issues flagged</span>
                </div>

                <div className="pr-findings-list">
                  {fileFindings.map((finding, idx) => (
                    <div
                      key={idx}
                      className={`pr-finding-item pr-finding-item--${finding.severity.toLowerCase()}`}
                    >
                      <div className="pr-finding-top">
                        <div className="pr-finding-tags">
                          <span className={`finding-sev-chip finding-sev-${finding.severity.toLowerCase()}`}>
                            {finding.severity}
                          </span>
                          <span className="finding-type-chip">{finding.type}</span>
                          <span className="finding-line-chip">Line ~{finding.line}</span>
                        </div>
                        <h5 className="pr-finding-name">{finding.title}</h5>
                      </div>

                      <p className="pr-finding-desc">{finding.description}</p>

                      {finding.suggestedPatch && (
                        <div className="pr-finding-patch">
                          <div className="pr-patch-label">Suggested Patch / Fix:</div>
                          <pre className="pr-patch-code">{finding.suggestedPatch}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diff Viewer */}
            <div className="pr-diff-viewer">
              <div className="pr-diff-toolbar">
                <div className="pr-diff-file-info">
                  <span className="pr-diff-file-name">{selectedFile?.filename}</span>
                  <span className="pr-diff-file-stats">
                    (+{selectedFile?.additions} / -{selectedFile?.deletions})
                  </span>
                </div>

                <button
                  className="button button-small"
                  onClick={() => handleSendToWorkspace(selectedFile?.patch, selectedFile?.filename)}
                  title="Open this file's patch in the Workspace Monaco editor"
                >
                  <Code2 size={13} />
                  Edit File in Workspace
                </button>
              </div>

              <div className="pr-patch-container">
                {selectedFile?.patch ? (
                  <pre className="pr-patch-lines">
                    {selectedFile.patch.split("\n").map((line, idx) => {
                      const isAdd = line.startsWith("+") && !line.startsWith("+++");
                      const isDel = line.startsWith("-") && !line.startsWith("---");
                      const isHunk = line.startsWith("@@");

                      let lineClass = "patch-line";
                      if (isAdd) lineClass += " patch-line--add";
                      if (isDel) lineClass += " patch-line--del";
                      if (isHunk) lineClass += " patch-line--hunk";

                      return (
                        <div key={idx} className={lineClass}>
                          <span className="patch-ln">{idx + 1}</span>
                          <span className="patch-text">{line}</span>
                        </div>
                      );
                    })}
                  </pre>
                ) : (
                  <div className="pr-diff-empty">
                    <p>No unified diff patch available for this file (possibly binary or empty file).</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
