const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { promisify } = require("util");
const { exec } = require("child_process");
const { chmod } = require("fs");
const { Octokit } = require("@octokit/rest");

const DOWNLOAD_URL = "https://github.com/ipfs/kubo/releases/download/";
const SUPPORTED_PLATFORMS = ["linux-x86_64", "darwin-x86_64"];

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

    const filename = `ipfs`;
    const downloadUrl = `${DOWNLOAD_URL}v${version}/${filename}-${platform}`;
    const cachedPath = tc.find("ipfs", version, platform);

    let ipfsPath;
    if (!cachedPath) {
      const downloadPath = await tc.downloadTool(downloadUrl);
      ipfsPath = await tc.cacheFile(
        downloadPath,
        filename,
        "ipfs",
        version,
      );
    } else {
      ipfsPath = cachedPath;
    }

    core.addPath(ipfsPath);
    await promisify(chmod)(`${ipfsPath}/ipfs`, 0o755);

    await promisify(exec)("ipfs --version");
    core.info(
      `ipfs v${version} for ${platform} has been set up successfully`,
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
