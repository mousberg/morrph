import { readFile } from "node:fs/promises";
import path from "node:path";
import { Morpher } from "@/components/Morpher";

// The loop the page opens with, in order. More can be dropped in on the page.
const START = ["openai-chatgpt.svg", "claude.svg", "gemini.svg"];

export default async function Home() {
  const sources = await Promise.all(START.map((file) => readFile(path.join(process.cwd(), "icons", file), "utf8")));
  return <Morpher sources={sources} />;
}
