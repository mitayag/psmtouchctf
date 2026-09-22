import json
import re
from pathlib import Path

base = Path(__file__).resolve().parent.parent
json_path = base / "api" / "data" / "challenge_bank.json"
ts_path = base / "ui" / "src" / "services" / "challengeBank.ts"

FLAG_RE = re.compile(r"PSM\{[^}]+\}")

bank = json.loads(json_path.read_text())


def redact_flags(text: str) -> str:
    return FLAG_RE.sub("PSM{...}", text)


lines = [
    "import type { Challenge } from '../types';",
    "",
    "export const CHALLENGE_BANK: Challenge[] = [",
]

def clean_data(data):
    # Remove null attachment to match TypeScript type (undefined instead of null)
    if data.get("kind") == "phishing" and data.get("email", {}).get("attachment") is None:
        data = {**data, "email": {k: v for k, v in data["email"].items() if k != "attachment"}}
    # Strip answer metadata from the client-side bundle to prevent leakage.
    kind = data.get("kind")
    if kind == "phishing":
        data = {**data, "evidence": [{k: v for k, v in e.items() if k != "correct"} for e in data.get("evidence", [])]}
    elif kind == "logs":
        data = {**data, "logs": [{k: v for k, v in log.items() if k != "correct"} for log in data.get("logs", [])]}
    elif kind == "decode":
        data = {k: v for k, v in data.items() if k != "answer"}
    return data

for i, item in enumerate(bank):
    if i > 0:
        lines.append("")
    item_data = clean_data(item["data"])
    lines.append(f"  // {redact_flags(item['title'])}")
    lines.append("  {")
    lines.append(f"    id: '{item['id']}',")
    lines.append(f"    position: {item['position']},")
    lines.append(f"    type: '{item['type']}',")
    lines.append(f"    title: {json.dumps(redact_flags(item['title']))},")
    lines.append(f"    instruction: {json.dumps(redact_flags(item['instruction']))},")
    lines.append(f"    hint: {json.dumps(redact_flags(item['hint']))},")
    # Explanation is intentionally omitted from the client-side bank; it is
    # returned by the backend only after a challenge is solved or exhausted.
    lines.append("    data: ")
    data_json = json.dumps(item_data, indent=2)
    data_lines = data_json.splitlines()
    for dl in data_lines:
        lines.append("    " + dl)
    lines.append(",")
    lines.append("  },")

lines.extend([
    "];",
    "",
    "export function getAllChallenges(): Challenge[] {",
    "  return CHALLENGE_BANK.map((c) => ({ ...c }));",
    "}",
    "",
    "export function getChallengeById(id: string): Challenge | undefined {",
    "  return CHALLENGE_BANK.find((c) => c.id === id);",
    "}",
    "",
    "export function getChallengesByType(type: Challenge['type']): Challenge[] {",
    "  return CHALLENGE_BANK.filter((c) => c.type === type).map((c) => ({ ...c }));",
    "}",
    "",
])

ts_path.write_text("\n".join(lines) + "\n")
print(f"Generated {ts_path} with {len(bank)} challenges")
