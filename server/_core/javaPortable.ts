import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pipeline } from "node:stream";
import { execSync } from "node:child_process";

const streamPipeline = promisify(pipeline);

interface JavaVersion {
  version: number;
  downloadUrl: string;
  filename: string;
}

const JAVA_VERSIONS: Record<number, JavaVersion> = {
  21: {
    version: 21,
    downloadUrl: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_linux_hotspot_21.0.2_13.tar.gz",
    filename: "java-21-linux.tar.gz",
  },
  17: {
    version: 17,
    downloadUrl: "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz",
    filename: "java-17-linux.tar.gz",
  },
  11: {
    version: 11,
    downloadUrl: "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.21%2B9/OpenJDK11U-jdk_x64_linux_hotspot_11.0.21_9.tar.gz",
    filename: "java-11-linux.tar.gz",
  },
};

const JAVA_PORTABLE_DIR = path.join(process.cwd(), ".java-portable");

/**
 * Get or download a portable Java version
 * @param version Java major version (11, 17, 21)
 * @returns Path to Java executable
 */
export async function getPortableJava(version: number = 21): Promise<string> {
  const versionInfo = JAVA_VERSIONS[version];
  if (!versionInfo) {
    throw new Error(`Java ${version} not supported. Available: ${Object.keys(JAVA_VERSIONS).join(", ")}`);
  }

  // Ensure portable directory exists
  if (!fs.existsSync(JAVA_PORTABLE_DIR)) {
    fs.mkdirSync(JAVA_PORTABLE_DIR, { recursive: true });
  }

  const versionDir = path.join(JAVA_PORTABLE_DIR, `java-${version}`);
  const javaExecutable = process.platform === "win32"
    ? path.join(versionDir, "bin", "java.exe")
    : path.join(versionDir, "bin", "java");

  // If Java already exists, return it
  if (fs.existsSync(javaExecutable)) {
    return javaExecutable;
  }

  // Download and extract Java
  console.log(`[Java Portable] Downloading Java ${version}...`);
  const archivePath = path.join(JAVA_PORTABLE_DIR, versionInfo.filename);

  try {
    // Download
    const response = await axios({
      url: versionInfo.downloadUrl,
      method: "GET",
      responseType: "stream",
      timeout: 300000, // 5 minutes
    });

    await streamPipeline(response.data, fs.createWriteStream(archivePath));
    console.log(`[Java Portable] Downloaded Java ${version}`);

    // Extract
    console.log(`[Java Portable] Extracting Java ${version}...`);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    if (process.platform === "win32") {
      // Use built-in tar for Windows
      try {
        execSync(`tar -xzf "${archivePath}" -C "${versionDir}"`, { stdio: "inherit" });
      } catch {
        throw new Error("Failed to extract Java on Windows. Please ensure tar is available.");
      }
    } else {
      // Use tar on Linux/macOS
      execSync(`tar -xzf "${archivePath}" -C "${versionDir}"`, { stdio: "inherit" });
    }

    // Move extracted contents to versionDir root
    const extractedDirs = fs.readdirSync(versionDir);
    const jdkDir = extractedDirs.find(d => d.startsWith("jdk-") || d.startsWith("openjdk-"));
    if (jdkDir) {
      const jdkPath = path.join(versionDir, jdkDir);
      const contents = fs.readdirSync(jdkPath);
      for (const item of contents) {
        const src = path.join(jdkPath, item);
        const dst = path.join(versionDir, item);
        if (fs.existsSync(dst)) {
          fs.rmSync(dst, { recursive: true });
        }
        fs.renameSync(src, dst);
      }
      fs.rmSync(jdkPath, { recursive: true });
    }

    // Clean up archive
    fs.unlinkSync(archivePath);
    console.log(`[Java Portable] Java ${version} ready at ${javaExecutable}`);

    // Make executable on Unix
    if (process.platform !== "win32") {
      fs.chmodSync(javaExecutable, 0o755);
    }

    return javaExecutable;
  } catch (error) {
    // Clean up on failure
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    if (fs.existsSync(versionDir)) fs.rmSync(versionDir, { recursive: true });
    throw new Error(`Failed to setup Java ${version}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get installed Java versions
 */
export function getInstalledJavaVersions(): number[] {
  if (!fs.existsSync(JAVA_PORTABLE_DIR)) return [];
  const versions: number[] = [];
  for (const dir of fs.readdirSync(JAVA_PORTABLE_DIR)) {
    const match = dir.match(/java-(\d+)/);
    if (match) {
      const version = parseInt(match[1]);
      const javaExe = process.platform === "win32"
        ? path.join(JAVA_PORTABLE_DIR, dir, "bin", "java.exe")
        : path.join(JAVA_PORTABLE_DIR, dir, "bin", "java");
      if (fs.existsSync(javaExe)) {
        versions.push(version);
      }
    }
  }
  return versions.sort((a, b) => b - a);
}

/**
 * Delete a portable Java version
 */
export function deletePortableJava(version: number): boolean {
  const versionDir = path.join(JAVA_PORTABLE_DIR, `java-${version}`);
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true });
    return true;
  }
  return false;
}

/**
 * Get Java version string
 */
export async function getJavaVersionString(javaPath: string): Promise<string> {
  try {
    const output = execSync(`"${javaPath}" -version`, { encoding: "utf8", stdio: "pipe" });
    return output || "Unknown";
  } catch (e) {
    const output = (e as any).stderr || (e as any).stdout || "Unknown";
    return output.toString();
  }
}
