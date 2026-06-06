import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const OWNER  = "KyokaAizen665";
const REPO   = "Yuzuki-Md-V2";
const BRANCH = "main";

// Directories / files to never push
const EXCLUDE = new Set([
  ".git", "node_modules", "bot_session", ".npm", ".cache",
  "zipFile.zip", "push.sh", ".upm", ".config",
  ".local", ".agents", ".replit", "attached_assets",
]);

function ghClient() {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN env var is not set");
  return axios.create({
    baseURL: "https://api.github.com",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function isBinary(buf) {
  const sample = buf.slice(0, 8000);
  for (const byte of sample) if (byte === 0) return true;
  return false;
}

function collectFiles(dir, base = "") {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (EXCLUDE.has(entry) || entry.startsWith(".git")) continue;
    const full = path.join(dir, entry);
    const rel  = base ? `${base}/${entry}` : entry;
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, rel));
    } else if (stat.isFile()) {
      results.push({ full, rel });
    }
  }
  return results;
}

// Files/dirs that should never be overwritten by a pull
const PULL_EXCLUDE = new Set([
  ".git", "node_modules", "bot_session", ".npm", ".cache",
  ".local", ".agents", ".replit", "attached_assets",
  "zipFile.zip", "push.sh",
]);

/**
 * Pull all files from the latest GitHub commit and overwrite local copies.
 * Preserves node_modules, bot_session, and all Replit-internal dirs.
 * @returns {{ commitSha: string, url: string, filesCount: number }}
 */
export async function pullFromGitHub() {
  const gh = ghClient();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 1 ── Get HEAD commit SHA
  const { data: refData } = await gh.get(
    `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`
  );
  const headSha = refData.object.sha;

  // 2 ── Get full recursive tree
  const { data: treeData } = await gh.get(
    `/repos/${OWNER}/${REPO}/git/trees/${headSha}?recursive=1`
  );

  const blobs = treeData.tree.filter(item => item.type === "blob");

  // 3 ── Filter out excluded paths
  const toDownload = blobs.filter(({ path: p }) => {
    const topLevel = p.split("/")[0];
    return !PULL_EXCLUDE.has(topLevel) && !topLevel.startsWith(".git");
  });

  // 4 ── Download and write each file in batches
  const BATCH = 5;
  let written = 0;

  for (let i = 0; i < toDownload.length; i += BATCH) {
    const batch = toDownload.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ path: relPath, sha }) => {
      const { data: blobData } = await gh.get(
        `/repos/${OWNER}/${REPO}/git/blobs/${sha}`
      );
      const content  = Buffer.from(blobData.content, "base64");
      const fullPath = path.join(ROOT, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
      written++;
    }));
    if (i + BATCH < toDownload.length) await sleep(200);
  }

  return {
    commitSha:  headSha,
    url: `https://github.com/${OWNER}/${REPO}/commit/${headSha}`,
    filesCount: written,
  };
}

/**
 * Fetch the last N commits from the GitHub repo.
 * @param {number} [count=5]
 * @returns {Array<{sha,message,author,date}>}
 */
export async function getChangelog(count = 5) {
  const gh = ghClient();
  const { data } = await gh.get(
    `/repos/${OWNER}/${REPO}/commits?sha=${BRANCH}&per_page=${count}`
  );
  return data.map(c => ({
    sha:     c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author:  c.commit.author.name,
    date:    new Date(c.commit.author.date).toLocaleDateString(),
  }));
}

/**
 * Push all workspace source files to GitHub via the Git Data API.
 * @param {string} commitMessage
 * @returns {{ commitSha: string, url: string, filesCount: number }}
 */
export async function pushToGitHub(commitMessage = "Update from Yuzuki MD") {
  const gh = ghClient();

  // 1 ── Get the current HEAD commit SHA
  const { data: refData } = await gh.get(
    `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`
  );
  const headSha = refData.object.sha;

  // 2 ── Get base tree SHA from HEAD commit
  const { data: headCommit } = await gh.get(
    `/repos/${OWNER}/${REPO}/git/commits/${headSha}`
  );
  const baseTreeSha = headCommit.tree.sha;

  // 3 ── Collect local files
  const files = collectFiles(ROOT);

  // 4 ── Create blobs in small sequential batches with delay to avoid rate limits
  const treeItems = [];
  const BATCH = 4;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const blobs = await Promise.all(batch.map(async ({ full, rel }) => {
      const buf     = fs.readFileSync(full);
      const binary  = isBinary(buf);
      const content = buf.toString(binary ? "base64" : "utf-8");
      const { data } = await gh.post(`/repos/${OWNER}/${REPO}/git/blobs`, {
        content,
        encoding: binary ? "base64" : "utf-8",
      });
      return { path: rel, mode: "100644", type: "blob", sha: data.sha };
    }));
    treeItems.push(...blobs);
    if (i + BATCH < files.length) await sleep(300); // 300ms between batches
  }

  // 5 ── Create a new tree on top of the base
  const { data: newTree } = await gh.post(
    `/repos/${OWNER}/${REPO}/git/trees`,
    { base_tree: baseTreeSha, tree: treeItems }
  );

  // 6 ── Create the commit
  const { data: newCommit } = await gh.post(
    `/repos/${OWNER}/${REPO}/git/commits`,
    {
      message: commitMessage,
      tree:    newTree.sha,
      parents: [headSha],
      author: {
        name:  "Yuzuki Bot",
        email: "bot@yuzuki.md",
        date:  new Date().toISOString(),
      },
    }
  );

  // 7 ── Advance the branch ref
  await gh.patch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha:   newCommit.sha,
    force: false,
  });

  return {
    commitSha:  newCommit.sha,
    url: `https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`,
    filesCount: files.length,
  };
}
