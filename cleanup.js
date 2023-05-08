const core = require("@actions/core");
const fs = require("fs").promises;

async function cleanup() {
  try {
    const tmpDir = core.getState("tmpDir");

    if (tmpDir) {
      core.info(`Cleaning up temporary IPFS directory: ${tmpDir}`);
      await fs.rm(tmpDir, { recursive: true });
    } else {
      core.warning("Temporary IPFS directory not found");
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

cleanup();
