# PSM TouchCTF Challenge Sources

This document maps each challenge to the credible source that informed its design. All scenarios are fictional simulations grounded in real security concepts; they are not copies of certification banks, proprietary CTF questions, or real incident evidence.

Review date: 2026-09-21

| Challenge ID | Type | Source | Concept Supported | How the Scenario Was Adapted |
|---|---|---|---|---|
| phishing-display-name | Phishing Hunt | NIST, "Phishing" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing | Suspicious source email address hidden behind a display name | A spoofed "Finance Team" display name conceals a mismatched sender domain. Players identify that the real domain differs from the company's legitimate domain. |
| phishing-url-hostname | Phishing Hunt | NIST, "Phishing" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing | Misleading URL / link text mismatch | A delivery-failure message uses link text that resembles a real courier but points to a look-alike domain, demonstrating that visible text does not guarantee destination. |
| phishing-document-share | Phishing Hunt | NIST, "Phishing" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing | Unexpected document-sharing login prompts | A fake document-share notification invites login to a non-company domain, illustrating credential-harvesting via fake collaboration tools. |
| phishing-payment-change | Phishing Hunt | NIST, "Phishing" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing | Payment-detail changes require independent verification | A vendor requests new banking details by email. Players learn to verify such changes through a separate trusted channel, not email reply. |
| phishing-qr-code | Phishing Hunt | NIST, "Phishing" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing | QR-code phishing with hidden destination | A text message includes a QR code whose decoded destination is an unrelated domain, showing that QR codes can route anywhere. |
| phishing-mfa-request | Phishing Hunt | NIST, "Multi-Factor Authentication" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/multi-factor-authentication | Unexpected MFA approval requests | An unsolicited push login request from an unfamiliar location demonstrates that attackers may already have a password and seek MFA bypass. |
| phishing-tech-support | Phishing Hunt | NIST, "Phishing" (Small Business Cybersecurity Corner), https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing | Fake technical-support instructions | A scary virus-count email with a support number and shutdown instruction mirrors tech-support scam patterns. |
| logs-brute-success | Log Detective | Microsoft, "Data science for cybersecurity: A probabilistic time series model for detecting RDP inbound brute-force attacks" (Microsoft Security Blog, 2019), https://www.microsoft.com/en-us/security/blog/2019/12/18/data-science-for-cybersecurity-a-probabilistic-time-series-model-for-detecting-rdp-inbound-brute-force-attacks/ | Failed sign-ins followed by a correlated successful login | Logs show repeated LOGIN_FAILURE events for admin from one IP, then a LOGIN_SUCCESS from the same IP, matching brute-force success indicators described by Microsoft. |
| logs-password-spray | Log Detective | Microsoft, "Data science for cybersecurity..." (2019) | Password-spray pattern across many accounts | One source attempts the same password against five different usernames in rapid succession, distinguishing spraying from single-account brute force. |
| logs-stale-credential | Log Detective | Microsoft, "Data science for cybersecurity..." (2019); Azure SecurityEvent examples, https://learn.microsoft.com/en-us/azure/azure-monitor/reference/queries/securityevent | Rhythmic failures from a known service source | A service account fails at regular 15-minute intervals from the legitimate backup server, indicating a stale credential rather than an attack. |
| logs-privileged-group | Log Detective | Microsoft Learn, "Members added to security groups" query example, https://learn.microsoft.com/en-us/azure/azure-monitor/reference/queries/securityevent | Unexpected privileged-group membership changes | An analyst adds an account to Domain Admins outside the maintenance window, then logs in from an unusual IP, demonstrating privilege escalation. |
| logs-log-cleared | Log Detective | Microsoft Learn, "Devices with Security Log Cleared" query example, https://learn.microsoft.com/en-us/azure/azure-monitor/reference/queries/securityevent | Security-log clearing outside approved maintenance | A user pauses audit logging and purges records at 03:14, outside the approved window, versus an expected system log rotation. |
| logs-bulk-download | Log Detective | Microsoft SecurityEvent analytic patterns; general data-exfiltration detection concepts | Unusual file-download volume relative to baseline | A user downloads 2,847 files in under a minute, far exceeding a stated daily baseline, indicating possible exfiltration. |
| logs-scheduled-task | Log Detective | Microsoft SecurityEvent examples; Windows Task Scheduler event semantics | Suspicious scheduled-task creation with contextual evidence | A new scheduled task runs PowerShell from a temp directory, a common persistence technique, contrasted with a legitimate managed backup job. |
| decode-base64 | Decode the Flag | RFC 4648, "The Base16, Base32, and Base64 Data Encodings", https://www.rfc-editor.org/info/rfc4648/ | Base64 decoding | A short Base64 string encodes a flag fragment. Players decode it and learn that Base64 is a representation, not encryption. |
| decode-hex | Decode the Flag | RFC 4648, "Base16 Encoding" (hex), https://www.rfc-editor.org/info/rfc4648/ | Hexadecimal / Base16 decoding | Pairs of hex digits are mapped to ASCII characters to reveal a short code. |
| decode-binary | Decode the Flag | RFC 4648 illustrations of binary-to-base encoding, https://www.rfc-editor.org/info/rfc4648/ | Binary ASCII decoding | Groups of 8 bits represent ASCII characters. A general lookup aid covers A-Z, braces, and underscore. |
| decode-url | Decode the Flag | RFC 3986 / RFC 4648 encoding concepts; URL percent-encoding mechanics | URL percent-decoding | Percent-encoded hex bytes are decoded to reveal the flag fragment. |
| decode-caesar | Decode the Flag | Classical substitution-cipher concept (Caesar cipher) | Caesar shift with supplied shift value | Players shift letters backward by the supplied amount. The explanation notes this is substitution, not secure encryption. |
| decode-substitution | Decode the Flag | Classical substitution-cipher concept | Symbol substitution with complete legend | A one-to-one symbol-to-letter legend is provided; players substitute symbols to read the flag. |

## Source verification notes

- NIST phishing guidance was reviewed on 2026-09-21 and emphasizes verifying requests through known contact information, inspecting source addresses, and recognizing that email is not the only phishing vector.
- Microsoft SecurityEvent query examples were reviewed on 2026-09-21 and provide accurate Windows event semantics for failed logons (4625), successful logons (4624), group changes (4728, 4732, 4756), and log clearing (1102).
- Microsoft brute-force analysis was reviewed on 2026-09-21 and supports the use of failed-login timing, source IP, and successful-follow-on-login signals.
- RFC 4648 was reviewed on 2026-09-21 and defines Base16, Base32, and Base64 encodings used in the decode challenges.

## Pedagogical stance

- HTTPS, professional formatting, and familiar sender display names are **not** treated as proof of legitimacy.
- Imperfect grammar and urgency are **not** standalone proof of phishing; questions ask for the strongest evidence or safest action.
- A successful login after failures is **not** by itself proof of compromise; log questions ask which sequence most warrants investigation and supply enough context for one defensible answer.
- Encoding challenges explicitly note that encoding is not encryption and does not protect secrets.
