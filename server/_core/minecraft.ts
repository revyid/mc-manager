import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pipeline } from "node:stream";

const streamPipeline = promisify(pipeline);

const JAVA_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META_URL = "https://meta.fabricmc.net/v2";
const PAPER_API = "https://api.papermc.io/v2";
const PURPUR_API = "https://api.purpurmc.org/v2";

export type ServerType = "java" | "bedrock" | "fabric" | "paper" | "purpur" | "spigot" | "forge" | "neoforge";

export interface McVersion {
  id: string;
  type: string;
  releaseTime: string;
  url?: string;
}

export async function getJavaVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get(JAVA_MANIFEST_URL);
    return data.versions
      .filter((v: any) => v.type === "release" || v.type === "snapshot")
      .slice(0, 50);
  } catch {
    return [];
  }
}

export async function getFabricVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get(`${FABRIC_META_URL}/versions/game`);
    return data
      .filter((v: any) => v.stable)
      .slice(0, 30)
      .map((v: any) => ({ id: v.version, type: "fabric", releaseTime: new Date().toISOString() }));
  } catch {
    return [];
  }
}

export async function getPaperVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get(`${PAPER_API}/projects/paper`);
    return data.versions
      .slice()
      .reverse()
      .slice(0, 30)
      .map((v: string) => ({ id: v, type: "release", releaseTime: "" }));
  } catch {
    return [];
  }
}

export async function getPurpurVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get(`${PURPUR_API}/purpur`);
    return data.versions
      .slice()
      .reverse()
      .slice(0, 30)
      .map((v: string) => ({ id: v, type: "release", releaseTime: "" }));
  } catch {
    return [];
  }
}

// Spigot & Forge don't have public CDN APIs so we expose BuildTools / installer instructions
export async function getSpigotVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get(JAVA_MANIFEST_URL);
    return data.versions
      .filter((v: any) => v.type === "release")
      .slice(0, 30)
      .map((v: any) => ({ id: v.id, type: "release", releaseTime: v.releaseTime }));
  } catch {
    return [];
  }
}

export async function getForgeVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get("https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json");
    // Returns object keyed by MC version
    const entries = Object.keys(data).reverse().slice(0, 30);
    return entries.map((v) => ({ id: v, type: "release", releaseTime: "" }));
  } catch {
    return [];
  }
}

export async function getNeoForgeVersions(): Promise<McVersion[]> {
  try {
    const { data } = await axios.get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml", { responseType: "text" });
    const matches = (data as string).match(/<version>([\d.]+)<\/version>/g) || [];
    return matches
      .map((m) => m.replace(/<\/?version>/g, ""))
      .filter((v) => !v.includes("beta") && !v.includes("rc"))
      .reverse()
      .slice(0, 30)
      .map((v) => ({ id: v, type: "release", releaseTime: "" }));
  } catch {
    return [];
  }
}

export async function getBedrockVersions(): Promise<McVersion[]> {
  return [{ id: "latest", type: "release", releaseTime: new Date().toISOString() }];
}

export async function getVersionsByType(type: ServerType): Promise<McVersion[]> {
  switch (type) {
    case "java": return getJavaVersions();
    case "fabric": return getFabricVersions();
    case "paper": return getPaperVersions();
    case "purpur": return getPurpurVersions();
    case "spigot": return getSpigotVersions();
    case "forge": return getForgeVersions();
    case "neoforge": return getNeoForgeVersions();
    case "bedrock": return getBedrockVersions();
    default: return [];
  }
}

export async function downloadServerJar(versionId: string, type: ServerType, targetDir: string): Promise<string> {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  if (type === "java") {
    const { data: manifest } = await axios.get(JAVA_MANIFEST_URL);
    const version = manifest.versions.find((v: any) => v.id === versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);
    const { data: versionData } = await axios.get(version.url);
    const downloadUrl = versionData.downloads.server.url;
    const targetPath = path.join(targetDir, "server.jar");
    const response = await axios({ url: downloadUrl, method: "GET", responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(targetPath));
    return targetPath;
  }

  if (type === "fabric") {
    const { data: loaders } = await axios.get(`${FABRIC_META_URL}/versions/loader/${versionId}`);
    if (!loaders?.length) throw new Error(`No Fabric loader found for ${versionId}`);
    const loaderVersion = loaders[0].loader.version;
    const { data: installers } = await axios.get(`${FABRIC_META_URL}/versions/installer`);
    const installerVersion = installers[0].version;
    const downloadUrl = `${FABRIC_META_URL}/versions/loader/${versionId}/${loaderVersion}/${installerVersion}/server/jar`;
    const targetPath = path.join(targetDir, "server.jar");
    const response = await axios({ url: downloadUrl, method: "GET", responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(targetPath));
    return targetPath;
  }

  if (type === "paper") {
    const { data: builds } = await axios.get(`${PAPER_API}/projects/paper/versions/${versionId}/builds`);
    const latest = builds.builds[builds.builds.length - 1];
    const jar = latest.downloads.application.name;
    const downloadUrl = `${PAPER_API}/projects/paper/versions/${versionId}/builds/${latest.build}/downloads/${jar}`;
    const targetPath = path.join(targetDir, "server.jar");
    const response = await axios({ url: downloadUrl, method: "GET", responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(targetPath));
    return targetPath;
  }

  if (type === "purpur") {
    const downloadUrl = `${PURPUR_API}/purpur/${versionId}/latest/download`;
    const targetPath = path.join(targetDir, "server.jar");
    const response = await axios({ url: downloadUrl, method: "GET", responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(targetPath));
    return targetPath;
  }

  if (type === "spigot") {
    // Spigot requires BuildTools — drop a readme instead
    const readme = `Spigot requires BuildTools to compile.\nRun: java -jar BuildTools.jar --rev ${versionId}\nDownload BuildTools: https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar`;
    fs.writeFileSync(path.join(targetDir, "README_SPIGOT.txt"), readme);
    // Download BuildTools for convenience
    const btPath = path.join(targetDir, "BuildTools.jar");
    const response = await axios({ url: "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar", method: "GET", responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(btPath));
    return btPath;
  }

  if (type === "forge" || type === "neoforge") {
    // Return installer instructions
    const note = `${type === "forge" ? "Forge" : "NeoForge"} requires running the installer.\nVersion: ${versionId}\nDownload from: ${type === "forge" ? "https://files.minecraftforge.net" : "https://neoforged.net"}`;
    fs.writeFileSync(path.join(targetDir, `README_${type.toUpperCase()}.txt`), note);
    return path.join(targetDir, `README_${type.toUpperCase()}.txt`);
  }

  if (type === "bedrock") {
    const BEDROCK_SERVICES_URL = "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links";
    const { data } = await axios.get(BEDROCK_SERVICES_URL);
    const link = data.result.links.find((l: any) => l.downloadType === "serverBedrockWindows");
    if (!link) throw new Error("Bedrock download link not found");
    const targetPath = path.join(targetDir, "bedrock-server.zip");
    const response = await axios({ url: link.downloadUrl, method: "GET", responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(targetPath));
    return targetPath;
  }

  throw new Error(`Unknown server type: ${type}`);
}
