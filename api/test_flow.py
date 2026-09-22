import httpx
import json
import os

BASE = "http://localhost:8000"
KIOSK = "kiosk-test"

BANK = json.load(open(os.path.join(os.path.dirname(__file__), "data", "challenge_bank.json")))
BANK_BY_TITLE = {c["title"]: c for c in BANK}


def correct_answer_for(challenge):
    data = challenge["data"]
    kind = data["kind"]
    if kind == "decode":
        return data["answer"]
    key = "evidence" if kind == "phishing" else "logs"
    return [x["id"] for x in data[key] if x.get("correct")]


client = httpx.Client(headers={"kiosk-credential": KIOSK})

# Create session
r = client.post(f"{BASE}/api/v1/sessions", json={
    "alias": "ByteBandit",
    "publish_consent": True,
    "accessibility_mode": "standard",
    "kiosk_credential": KIOSK,
})
print("create", r.status_code)
session = r.json()
print(json.dumps({k: session[k] for k in ['id','state','current_position']}, indent=2))

# Begin
r = client.post(f"{BASE}/api/v1/sessions/{session['id']}/begin")
print("begin", r.status_code)

# Answer challenges
for i in range(3):
    r = client.get(f"{BASE}/api/v1/sessions/{session['id']}")
    s = r.json()
    current = next(c for c in s['challenges'] if c['position'] == s['current_position'])
    print(f"Challenge {current['position']}: {current['type']} - {current['title']}")

    answer = correct_answer_for(BANK_BY_TITLE[current['title']])

    r = client.post(f"{BASE}/api/v1/sessions/{session['id']}/answers", json={
        "idempotency_key": f"ans-{i}",
        "answer": answer,
    })
    print("answer", r.status_code, r.json())

# Capture flag
r = client.get(f"{BASE}/api/v1/sessions/{session['id']}")
s = r.json()
print("before capture", s['state'], s['score'], s['solved_count'])
flag = f"PSM{{{session['id'].split('-')[0]}}}"
r = client.post(f"{BASE}/api/v1/sessions/{session['id']}/capture", json={
    "idempotency_key": "cap-1",
    "flag": flag,
})
print("capture", r.status_code, r.json())

# Results
r = client.get(f"{BASE}/api/v1/sessions/{session['id']}/results")
print("results", r.status_code, r.json())
