const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { exec } = require("child_process");
const fs = require("fs").promises;
const { Octokit } = require("@octokit/rest");

const DOWNLOAD_URL = "https://github.com/ipfs/kubo/releases/download/";
const SUPPORTED_PLATFORMS = ["linux-amd64", "darwin-amd64"];

/**
 * Find the path of the IPFS binary in the extracted folder.
 * @param {string} folderPath - Path to the extracted folder
 * @returns {Promise<string>} path to the IPFS binary
 */
async function findBinaryPath(folderPath) {
  const files = await fs.readdir(folderPath, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      const binaryPath = await findBinaryPath(path.join(folderPath, file.name));
      if (binaryPath) return binaryPath;
    } else if (file.name === "ipfs") {
      return folderPath;
    }
  }
  return null;
}

/**
 * Guess the platform based on the current OS and architecture.
 * @returns {string} platform string
 */
function guessPlatform() {
  const os = process.platform;
  const arch = process.arch;
  const platform = `${os}-${arch}`;
  const platformMappings = {
    "linux-x64": "linux-amd64",
    "darwin-x64": "darwin-amd64",
  };
  return platformMappings[platform] || platform;
}

/**
 * Get the latest IPFS release version.
 * @returns {Promise<string>} latest IPFS version
 */
async function getLatestIPFSVersion() {
  const octokit = new Octokit();
  const releases = await octokit.repos.listReleases({
    owner: "ipfs",
    repo: "kubo",
  });
  const latestRelease = releases.data.find((release) =>
    release.tag_name.startsWith("v")
  );
  if (!latestRelease) {
    throw new Error("No IPFS release found");
  }
  return latestRelease.tag_name.replace(/^v/, "");
}

/**
 * Download and extract IPFS binary.
 * @param {string} version - IPFS version
 * @param {string} platform - Target platform
 * @returns {Promise<string>} path to the extracted IPFS binary
 */
async function downloadAndExtractIPFS(version, platform) {
  const downloadUrl =
    `${DOWNLOAD_URL}v${version}/kubo_v${version}_${platform}.tar.gz`;
  const downloadPath = await tc.downloadTool(downloadUrl);
  const extractedPath = await tc.extractTar(downloadPath);
  return `${extractedPath}/kubo`;
}

async function run() {
  try {
    const platform = guessPlatform();
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    let version = core.getInput("version");
    if (version === "latest") {
      version = await getLatestIPFSVersion();
      core.info(`Latest IPFS release is v${version}`);
    } else {
      version = version.replace(/^v/, "");
    }

    const cachedPath = tc.find("ipfs", version, platform);
    const ipfsPath = cachedPath ||
      (await downloadAndExtractIPFS(version, platform));
    if (!cachedPath) {
      const binaryPath = await findBinaryPath(ipfsPath);
      if (!binaryPath) {
        throw new Error("IPFS binary not found in the extracted folder");
      }
      await tc.cacheDir(binaryPath, "ipfs", version);
    }

    const binaryPath = await findBinaryPath(ipfsPath);
    core.addPath(binaryPath);
    await fs.chmod(`${binaryPath}/ipfs`, 0o755);

    await exec("ipfs --version");
    core.info(`ipfs v${version} for ${platform} has been set up successfully`);
    await exec("ipfs --init");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
