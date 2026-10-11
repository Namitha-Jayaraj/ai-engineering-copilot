const http = require('http');

const sampleSessions = [
  {
    language: 'javascript',
    reviewMode: 'full',
    code: `function calculateCartTotal(cartItems, discountCode) {
  let total = 0;
  for (let i = 0; i <= cartItems.length; i++) {
    total += cartItems[i].price * cartItems[i].qty;
  }
  if (discountCode === "SUMMER20") {
    total = total * 0.8;
  }
  return Math.round(total * 100) / 100;
}`,
    score: 64,
    summary: 'Detected out-of-bounds array access in loop condition causing runtime TypeError, lack of null/empty validation for cartItems, and floating point rounding vulnerabilities.',
    issues: [
      {
        type: 'BUG',
        severity: 'HIGH',
        line: 3,
        description: 'Loop condition "i <= cartItems.length" causes an out-of-bounds index lookup on the final iteration.',
        suggestion: 'Change loop bound to "i < cartItems.length" or use "for (const item of cartItems)".'
      },
      {
        type: 'QUALITY',
        severity: 'MEDIUM',
        line: 1,
        description: 'No defensive guard for undefined, null, or empty cartItems argument.',
        suggestion: 'Provide default argument "cartItems = []" and validate with Array.isArray(cartItems).'
      },
      {
        type: 'PERFORMANCE',
        severity: 'LOW',
        line: 2,
        description: 'Imperative accumulation can be replaced with an idiomatic and clean array reduce.',
        suggestion: 'Use cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0).'
      }
    ],
    securityIssues: [
      'Discount code comparison lacks timing-safe evaluation and server-side coupon validity checks.'
    ],
    performanceIssues: [
      'Repeated property access inside loop without defensive destructuring or memoization.'
    ],
    suggestedTests: [
      'test("calculates standard item total without off-by-one crash", () => { ... })',
      'test("applies SUMMER20 20% discount correctly", () => { ... })',
      'test("handles empty cart without throwing TypeError", () => { ... })'
    ],
    fixedCode: `function calculateCartTotal(cartItems = [], discountCode = "") {
  if (!Array.isArray(cartItems)) return 0;
  let total = cartItems.reduce((acc, item) => {
    const price = Number(item?.price) || 0;
    const qty = Number(item?.qty) || 0;
    return acc + (price * qty);
  }, 0);

  if (typeof discountCode === "string" && discountCode.trim().toUpperCase() === "SUMMER20") {
    total *= 0.8;
  }

  return Math.round((total + Number.EPSILON) * 100) / 100;
}`,
    testStatus: 'PASS',
    testsPassed: 4,
    testsFailed: 0,
    testsTotal: 4,
    duration: '1.24s'
  },
  {
    language: 'typescript',
    reviewMode: 'security',
    code: `import express from "express";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

app.post("/api/user/profile", (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  const decoded: any = jwt.decode(token); // Vulnerability: decode without verification
  const query = "SELECT * FROM users WHERE id = '" + decoded.userId + "'"; // SQL Injection
  // db.query(query)...
  res.json({ status: "success", user: decoded });
});`,
    score: 38,
    summary: 'Critical security defects identified: jwt.decode used instead of jwt.verify allows arbitrary JWT payload forgery; unsanitized SQL string concatenation introduces high-risk SQL Injection.',
    issues: [
      {
        type: 'SECURITY',
        severity: 'CRITICAL',
        line: 9,
        description: 'jwt.decode does not verify cryptographic signature. Attackers can forge any claims.',
        suggestion: 'Replace with jwt.verify(token, process.env.JWT_SECRET) with proper error handling.'
      },
      {
        type: 'SECURITY',
        severity: 'CRITICAL',
        line: 10,
        description: 'Raw string concatenation in SQL statement creates SQL Injection vulnerability.',
        suggestion: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [decoded.userId]).'
      },
      {
        type: 'QUALITY',
        severity: 'MEDIUM',
        line: 9,
        description: 'Use of "any" type bypasses TypeScript type safety for decoded token claims.',
        suggestion: 'Define a strict TokenPayload interface and type the verified token.'
      }
    ],
    securityIssues: [
      'Unverified JWT token accepted via jwt.decode allows privilege escalation and identity spoofing.',
      'Direct string interpolation into database query allows SQL Injection exploitation.'
    ],
    performanceIssues: [],
    suggestedTests: [
      'it("rejects unsigned or tampered JWT tokens", async () => { ... })',
      'it("neutralizes SQL injection payload in userId", async () => { ... })'
    ],
    fixedCode: `import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";

interface AuthTokenPayload {
  userId: string;
  role: string;
}

const app = express();
app.use(express.json());

app.post("/api/user/profile", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = authHeader.substring(7);
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET as string) as AuthTokenPayload;
    // Parameterized query prevents SQL injection
    // const user = await db.query("SELECT id, name, email FROM users WHERE id = $1", [verified.userId]);
    return res.json({ status: "success", userId: verified.userId });
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
});`,
    testStatus: 'FAIL',
    testsPassed: 1,
    testsFailed: 2,
    testsTotal: 3,
    duration: '2.10s'
  },
  {
    language: 'python',
    reviewMode: 'performance',
    code: `def find_duplicate_transactions(transactions):
    duplicates = []
    for i in range(len(transactions)):
        for j in range(len(transactions)):
            if i != j and transactions[i]['id'] == transactions[j]['id']:
                if transactions[i] not in duplicates:
                    duplicates.append(transactions[i])
    return duplicates`,
    score: 52,
    summary: 'Suboptimal O(n^3) complexity caused by nested iterations and linear in-list lookup. Can be transformed to O(n) utilizing hash sets or dictionary grouping.',
    issues: [
      {
        type: 'PERFORMANCE',
        severity: 'HIGH',
        line: 4,
        description: 'Nested O(n^2) double loops combined with linear search "not in duplicates" yields O(n^3) overall complexity.',
        suggestion: 'Use a seen set with O(1) membership lookups to reduce algorithm to linear O(n).'
      },
      {
        type: 'QUALITY',
        severity: 'MEDIUM',
        line: 1,
        description: 'Missing type annotations and docstring explaining input requirements and return format.',
        suggestion: 'Add typing: "transactions: list[dict[str, Any]] -> list[dict[str, Any]]".'
      }
    ],
    securityIssues: [],
    performanceIssues: [
      'Catastrophic O(n^3) runtime scaling: scanning 10,000 transactions will freeze the execution thread.',
      'Unnecessary duplicate object allocations in memory.'
    ],
    suggestedTests: [
      'def test_find_duplicates_empty_input(): ...',
      'def test_find_duplicates_large_dataset_under_50ms(): ...'
    ],
    fixedCode: `from typing import Any

def find_duplicate_transactions(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_ids: set[Any] = set()
    duplicate_ids: set[Any] = set()
    duplicates: list[dict[str, Any]] = []

    for item in transactions:
        t_id = item.get('id')
        if t_id in seen_ids:
            if t_id not in duplicate_ids:
                duplicate_ids.add(t_id)
                duplicates.append(item)
        else:
            seen_ids.add(t_id)

    return duplicates`,
    testStatus: 'PASS',
    testsPassed: 5,
    testsFailed: 0,
    testsTotal: 5,
    duration: '0.85s'
  },
  {
    language: 'typescript',
    reviewMode: 'quality',
    code: `export async function fetchUserWithRetry(url: string, retries: number = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP error " + res.status);
      return await res.json();
    } catch (e) {
      attempt++;
      if (attempt >= retries) throw e;
    }
  }
}`,
    score: 82,
    summary: 'Well-structured retry mechanism. Minor enhancements recommended: incorporate exponential backoff with jitter, use AbortController signal for request timeouts, and avoid raw any return type.',
    issues: [
      {
        type: 'QUALITY',
        severity: 'LOW',
        line: 1,
        description: 'Generic return type "Promise<any>" reduces compile-time type safety.',
        suggestion: 'Make function generic: "<T>(url: string, retries?: number): Promise<T>".'
      },
      {
        type: 'PERFORMANCE',
        severity: 'MEDIUM',
        line: 9,
        description: 'Immediate retry without delay can flood failing servers (thundering herd problem).',
        suggestion: 'Introduce exponential backoff delay: await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 200)).'
      }
    ],
    securityIssues: [],
    performanceIssues: [
      'Immediate tight retry loop lacks backoff pacing, potentially exacerbating upstream rate limits.'
    ],
    suggestedTests: [
      'it("resolves on first successful try", async () => { ... })',
      'it("retries up to specified count on network failure", async () => { ... })',
      'it("throws after exhausting all retries", async () => { ... })'
    ],
    fixedCode: `export async function fetchWithRetry<T>(
  url: string,
  retries: number = 3,
  delayMs: number = 300
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(\`Request failed with status \${res.status}\`);
      return (await res.json()) as T;
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const backoff = delayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error("Exhausted retries");
}`,
    testStatus: 'PASS',
    testsPassed: 4,
    testsFailed: 0,
    testsTotal: 4,
    duration: '1.45s'
  },
  {
    language: 'javascript',
    reviewMode: 'full',
    code: `const crypto = require('crypto');

function hashPassword(password) {
  // MD5 is broken and insecure for password hashing
  return crypto.createHash('md5').update(password).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}`,
    score: 41,
    summary: 'Critical cryptographic defect: MD5 is vulnerable to collision attacks and rainbow tables. Plain string equality check is susceptible to timing attacks.',
    issues: [
      {
        type: 'SECURITY',
        severity: 'CRITICAL',
        line: 4,
        description: 'MD5 is cryptographically obsolete for password storage. Vulnerable to fast brute-force and rainbow table lookups.',
        suggestion: 'Use Argon2id, scrypt, or bcrypt with salt.'
      },
      {
        type: 'SECURITY',
        severity: 'HIGH',
        line: 8,
        description: 'Standard string equality comparison === is vulnerable to side-channel timing analysis.',
        suggestion: 'Use crypto.timingSafeEqual on buffer representations.'
      }
    ],
    securityIssues: [
      'MD5 password storage without salt enables instant precomputed rainbow table inversion.',
      'Timing side-channel vulnerability in password hash comparison.'
    ],
    performanceIssues: [],
    suggestedTests: [
      'test("hashes password with unique per-user salt", async () => { ... })',
      'test("validates matching password using timing-safe comparison", async () => { ... })'
    ],
    fixedCode: `const crypto = require('crypto');
const util = require('util');

const scryptAsync = util.promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)).toString('hex');
  return \`\${salt}:\${derivedKey}\`;
}

async function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedBuffer = await scryptAsync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}`,
    testStatus: 'PASS',
    testsPassed: 3,
    testsFailed: 0,
    testsTotal: 3,
    duration: '1.10s'
  }
];

async function seed() {
  console.log('Seeding', sampleSessions.length, 'audit sessions to http://localhost:5001/api/sessions ...');
  for (const session of sampleSessions) {
    await new Promise((resolve, reject) => {
      const payload = JSON.stringify(session);
      const req = http.request(
        'http://localhost:5001/api/sessions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log(`Saved session (${session.language} / ${session.reviewMode}) -> ID:`, JSON.parse(data).sessionId);
            resolve();
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
  console.log('Seeding completed successfully!');
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
