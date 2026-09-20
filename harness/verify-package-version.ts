import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { getPackageVersion } from "./src/agent-backend/package-version";

const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package-lock.json"), "utf8"));
const expectedOpenAI = lock.packages?.["node_modules/openai"]?.version;
assert.equal(typeof expectedOpenAI, "string", "openai version missing from package-lock.json");
const actualOpenAI = getPackageVersion("openai");
assert.equal(actualOpenAI, expectedOpenAI, `OpenAI SDK version mismatch: ${actualOpenAI} !== ${expectedOpenAI}`);
assert.match(actualOpenAI!, /^\d+\.\d+\.\d+(?:[-+].*)?$/);

const expectedAnthropic = lock.packages?.["node_modules/@anthropic-ai/sdk"]?.version;
const actualAnthropic = getPackageVersion("@anthropic-ai/sdk");
assert.equal(typeof actualAnthropic, "string", "Anthropic SDK version should also resolve through package main entry");
if (typeof expectedAnthropic === "string") assert.equal(actualAnthropic, expectedAnthropic);

console.log(`Package version resolution verified: openai=${actualOpenAI}, anthropic=${actualAnthropic}`);
