const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { promisify } = require("util");
const { exec } = require("child_process");
const { chmod } = require("fs");
const { Octokit } = require("@octokit/rest");

const DOWNLOAD_URL = "https://github.com/ipfs/kubo/releases/download/";
const SUPPORTED_PLATFORMS = ["linux-amd64", "darwin-amd64"];

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

async function run() {
  try {
    const platform = guessPlatform();
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    let version = core.getInput("version");
    if (version === "latest") {
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
      version = latestRelease.tag_name.replace(/^v/, "");
      core.info(`Latest IPFS release is v${version}`);
    } else {
      version = version.replace(/^v/, "");
    }

    const downloadUrl =
      `${DOWNLOAD_URL}v${version}/kubo_v${version}_${platform}.tar.gz`;
    const cachedPath = tc.find("ipfs", version, platform);

    let ipfsPath;
    if (!cachedPath) {
      const downloadPath = await tc.downloadTool(downloadUrl);
      const extractedPath = await tc.extractTar(downloadPath);
      const binaryPath = `${extractedPath}/kubo`;
      ipfsPath = await tc.cacheDir(binaryPath, "ipfs", version);
    } else {
      ipfsPath = cachedPath;
    }

    core.addPath(ipfsPath + '/kubo');
    await promisify(chmod)(`${ipfsPath}/kubo/ipfs`, 0o755);

    await promisify(exec)("ipfs --version");
    core.info(
      `ipfs v${version} for ${platform} has been set up successfully`,
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
