const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { exec } = require("child_process");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");
const { Octokit } = require("@octokit/rest");

const DOWNLOAD_URL = "https://github.com/ipfs/kubo/releases/download/";
const SUPPORTED_PLATFORMS = ["linux-amd64", "darwin-amd64"];

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

async function downloadAndExtractIPFS(version, platform) {
  const downloadUrl =
    `${DOWNLOAD_URL}v${version}/kubo_v${version}_${platform}.tar.gz`;
  const downloadPath = await tc.downloadTool(downloadUrl);
  const extractedPath = await tc.extractTar(downloadPath);
  return { extractedPath, downloadPath };
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
    let ipfsPath;

    if (cachedPath) {
      ipfsPath = cachedPath;
    } else {
      const { extractedPath, downloadPath } = await downloadAndExtractIPFS(
        version,
        platform,
      );
      const binaryPath = await findBinaryPath(extractedPath);
      if (!binaryPath) {
        throw new Error("IPFS binary not found in the extracted folder");
      }
      ipfsPath = await tc.cacheDir(binaryPath, "ipfs", version);

      // Clean up downloaded archive
      await fs.unlink(downloadPath);

      // Clean up extracted folder
      await fs.rmdir(extractedPath, { recursive: true });
    }

    const binaryPath = await findBinaryPath(ipfsPath);
    core.addPath(binaryPath);
    await fs.chmod(`${binaryPath}/ipfs`, 0o755);

    await exec("ipfs --version");
    core.info(`ipfs v${version} for ${platform} has been set up successfully`);

    try {
      const tmpDir = await fs.mkdtemp(`${os.tmpdir()}${path.sep}`);
      core.exportVariable("IPFS_PATH", tmpDir);
      core.saveState("tmpDir", tmpDir);
    } catch (error) {
      core.setFailed(
        `Failed to create temporary IPFS directory: ${error.message}`,
      );
      return;
    }

    exec("ipfs init", (error, stdout, stderr) => {
      if (error) {
        core.setFailed(`ipfs init failed: ${error.message}`);
        return;
      }
      console.log(`IPFS init output: ${stdout}`);
      exec("ipfs config show", (error, stdout, stderr) => {
        if (error) {
          core.setFailed(`ipfs config show failed: ${error.message}`);
          return;
        }
        console.log(`IPFS config: ${stdout}`);
      });
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
