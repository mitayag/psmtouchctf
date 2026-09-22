import type { Challenge } from '../types';

export const CHALLENGE_BANK: Challenge[] = [
  // Phishing Hunt: Display Name Trap
  {
    id: 'phishing-display-name',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: Display Name Trap",
    instruction: "This email asks you to review a budget spreadsheet. Your company uses example.com. Tap the two signs this is phishing.",
    hint: "The friendly display name can hide a very different sender address.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "Finance Team <finance@example-finance-update.com>",
        "to": "employee@example.com",
        "subject": "Action required: Q3 budget review",
        "body": "Hi,\n\nPlease review the Q3 budget spreadsheet and confirm your line items by end of day.\n\nOpen document: https://example-finance-update.com/budget-review\n\nThank you,\nFinance Team"
      },
      "evidence": [
        {
          "id": "ev-domain",
          "label": "Sender domain does not match company domain",
          "detail": "finance@example-finance-update.com vs. example.com"
        },
        {
          "id": "ev-link",
          "label": "Link points to a look-alike domain",
          "detail": "https://example-finance-update.com/budget-review"
        },
        {
          "id": "ev-https",
          "label": "Link uses HTTPS",
          "detail": "The URL begins with https://"
        }
      ]
    }
,
  },

  // Phishing Hunt: Hostname Hijack
  {
    id: 'phishing-url-hostname',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: Hostname Hijack",
    instruction: "A message says your package delivery failed. The real courier is shipfast.example. Tap the two warning signs.",
    hint: "Look at the sender domain and the actual link destination \u2014 not the link text.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "ShipFast Delivery <no-reply@shipfast-notify.xyz>",
        "to": "you@home.example",
        "subject": "Delivery failed: reschedule now",
        "body": "We attempted to deliver your package but no one was available.\n\nReschedule here: https://shipfast-example-reschedule.xyz/track?id=8821\n\nIf you do not reschedule within 24 hours, the package will be returned to sender."
      },
      "evidence": [
        {
          "id": "ev-sender",
          "label": "Sender domain is unrelated to real courier",
          "detail": "shipfast-notify.xyz vs. shipfast.example"
        },
        {
          "id": "ev-host",
          "label": "Link goes to a fake domain, not the real one",
          "detail": "shipfast-example-reschedule.xyz"
        },
        {
          "id": "ev-24h",
          "label": "24-hour return warning",
          "detail": "'will be returned to sender'"
        }
      ]
    }
,
  },

  // Phishing Hunt: Shared Doc Login
  {
    id: 'phishing-document-share',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: Shared Doc Login",
    instruction: "A colleague apparently shared a document. Your org uses docs.example.com. Tap the two signs this is phishing.",
    hint: "Check the sender domain and where the button actually links.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "Docs Example <no-reply@docs-example-share.co>",
        "to": "you@example.com",
        "subject": "Jamie shared 'Project Plan.xlsx' with you",
        "body": "Jamie has shared a document with you.\n\n[Open in Docs]\n\nThis link will expire in 24 hours."
      },
      "evidence": [
        {
          "id": "ev-from",
          "label": "Sender domain is not the real file-sharing domain",
          "detail": "docs-example-share.co vs. docs.example.com"
        },
        {
          "id": "ev-button",
          "label": "Button links to a fake login site",
          "detail": "Link points to docs-example-share.co"
        },
        {
          "id": "ev-expire",
          "label": "Link expiration note",
          "detail": "'This link will expire in 24 hours'"
        }
      ]
    }
,
  },

  // Phishing Hunt: Payment Detail Change
  {
    id: 'phishing-payment-change',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: Payment Detail Change",
    instruction: "A vendor email asks you to update bank account details for invoices. Tap the two strongest signs this is a scam.",
    hint: "Payment changes by email should always be verified through a separate trusted channel.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "Vendor Solutions <billing@vendor-portal-pay.com>",
        "to": "accounts@example.com",
        "subject": "Urgent: Update remittance account for October invoice",
        "body": "Dear Accounts Team,\n\nWe are updating our banking details. Please remit the October invoice to the new account below.\n\nNew account: 4000-1234-5678\nSWIFT: FAKEUS33\n\nConfirm once updated."
      },
      "evidence": [
        {
          "id": "ev-domain",
          "label": "Sender domain does not match known vendor",
          "detail": "vendor-portal-pay.com vs. vendor-solutions.example"
        },
        {
          "id": "ev-payment",
          "label": "Unverified payment-detail change request",
          "detail": "New bank account sent by email"
        },
        {
          "id": "ev-urgent",
          "label": "Urgent subject line",
          "detail": "'Urgent: Update remittance account'"
        }
      ]
    }
,
  },

  // Phishing Hunt: QR Code Redirection
  {
    id: 'phishing-qr-code',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: QR Code Redirection",
    instruction: "A text says your account is locked and includes a QR code linking to unlock-bank-now.xyz. Tap the two warnings.",
    hint: "A real bank will never ask you to scan a QR code from an unexpected text.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "Bank-Alert",
        "to": "you@mobile.example",
        "subject": "Account access suspended",
        "body": "Your online banking has been locked due to suspicious activity.\n\nScan the QR code or visit the link below to verify immediately:\n\nhttps://unlock-bank-now.xyz/verify\n\nFailure to verify within 1 hour will result in permanent account closure."
      },
      "evidence": [
        {
          "id": "ev-qr",
          "label": "QR code resolves to an unrelated domain",
          "detail": "unlock-bank-now.xyz"
        },
        {
          "id": "ev-unlock",
          "label": "Unexpected account-lock demand with urgency",
          "detail": "'verify within 1 hour'"
        },
        {
          "id": "ev-sender",
          "label": "Sender label 'Bank-Alert'",
          "detail": "Text message sender ID"
        }
      ]
    }
,
  },

  // Phishing Hunt: Unexpected MFA Approval
  {
    id: 'phishing-mfa-request',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: Unexpected MFA Approval",
    instruction: "You get a push notification to approve a login you did not initiate from an unknown city. What should you do?",
    hint: "Unexpected MFA approvals mean someone else may have your password.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "Auth Service <security@auth.example>",
        "to": "you@example.com",
        "subject": "Login approval request",
        "body": "We received a login request for your account.\n\nLocation: Unknown city, overseas\nDevice: Unknown Windows PC\nIP: 203.0.113.77\n\nTap APPROVE to continue, or DENY if this was not you."
      },
      "evidence": [
        {
          "id": "ev-unknown",
          "label": "Login from an unfamiliar location and device",
          "detail": "Unknown city / Unknown Windows PC"
        },
        {
          "id": "ev-deny",
          "label": "Best action is to deny and change password",
          "detail": "Unexpected MFA request should be denied"
        },
        {
          "id": "ev-approve",
          "label": "Button to approve the login",
          "detail": "'Tap APPROVE to continue'"
        }
      ]
    }
,
  },

  // Phishing Hunt: Fake Tech Support
  {
    id: 'phishing-tech-support',
    position: 0,
    type: 'phishing',
    title: "Phishing Hunt: Fake Tech Support",
    instruction: "An email warns your PC has 27 viruses and provides a support number. Tap the two signs of a tech-support scam.",
    hint: "Real antivirus alerts come from installed software, not unsolicited emails.",
    data: 
    {
      "kind": "phishing",
      "email": {
        "from": "PC Security Center <alerts@secure-pc-center.net>",
        "to": "you@home.example",
        "subject": "CRITICAL: 27 viruses detected on your PC",
        "body": "WARNING!\n\nOur system detected 27 viruses on your computer. Your personal files, passwords, and banking information are at risk.\n\nCall Microsoft Certified Support immediately:\n+1-800-NOT-REAL\n\nDo not shut down your computer or the infection will spread."
      },
      "evidence": [
        {
          "id": "ev-viruses",
          "label": "Impossible virus count detected by email",
          "detail": "'27 viruses detected' via email"
        },
        {
          "id": "ev-phone",
          "label": "Unsolicited support phone number",
          "detail": "+1-800-NOT-REAL"
        },
        {
          "id": "ev-noshut",
          "label": "Instruction not to shut down",
          "detail": "'Do not shut down your computer'"
        }
      ]
    }
,
  },

  // Log Detective: Failed Then Successful
  {
    id: 'logs-brute-success',
    position: 0,
    type: 'logs',
    title: "Log Detective: Failed Then Successful",
    instruction: "Which source IP shows a successful login after repeated failed attempts?",
    hint: "Look for a cluster of failures from one source followed by a success from the same source.",
    data: 
    {
      "kind": "logs",
      "question": "Which source IP shows a successful login after repeated failed attempts?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "09:12:10",
          "source": "vpn-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=admin ip=198.51.100.10 reason=bad_password"
        },
        {
          "id": "log-2",
          "timestamp": "09:12:14",
          "source": "vpn-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=admin ip=203.0.113.42 reason=bad_password"
        },
        {
          "id": "log-3",
          "timestamp": "09:12:18",
          "source": "vpn-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=admin ip=203.0.113.42 reason=bad_password"
        },
        {
          "id": "log-4",
          "timestamp": "09:12:22",
          "source": "vpn-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=admin ip=203.0.113.42 reason=bad_password"
        },
        {
          "id": "log-5",
          "timestamp": "09:12:45",
          "source": "vpn-01",
          "event": "LOGIN_SUCCESS",
          "detail": "user=admin ip=203.0.113.42 mfa=ok"
        },
        {
          "id": "log-6",
          "timestamp": "09:15:03",
          "source": "vpn-01",
          "event": "LOGIN_SUCCESS",
          "detail": "user=admin ip=198.51.100.10 mfa=ok"
        }
      ]
    }
,
  },

  // Log Detective: Password Spray
  {
    id: 'logs-password-spray',
    position: 0,
    type: 'logs',
    title: "Log Detective: Password Spray",
    instruction: "An attacker tries one password against many accounts. Select the events that match a password-spray pattern.",
    hint: "Password spraying uses one common password against many usernames from the same source.",
    data: 
    {
      "kind": "logs",
      "question": "Which events show a password-spray pattern?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "11:03:01",
          "source": "sso-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=alice ip=198.51.100.55 reason=bad_password"
        },
        {
          "id": "log-2",
          "timestamp": "11:03:03",
          "source": "sso-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=bob ip=198.51.100.55 reason=bad_password"
        },
        {
          "id": "log-3",
          "timestamp": "11:03:05",
          "source": "sso-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=carol ip=198.51.100.55 reason=bad_password"
        },
        {
          "id": "log-4",
          "timestamp": "11:03:07",
          "source": "sso-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=dave ip=198.51.100.55 reason=bad_password"
        },
        {
          "id": "log-5",
          "timestamp": "11:03:09",
          "source": "sso-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=eve ip=198.51.100.55 reason=bad_password"
        },
        {
          "id": "log-6",
          "timestamp": "11:04:12",
          "source": "sso-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=alice ip=198.51.100.10 reason=bad_password"
        }
      ]
    }
,
  },

  // Log Detective: Stale Service Credential
  {
    id: 'logs-stale-credential',
    position: 0,
    type: 'logs',
    title: "Log Detective: Stale Service Credential",
    instruction: "A service account is failing to authenticate. Select the logs that indicate a stale credential after a password rotation.",
    hint: "A service account failing at regular intervals from a known source usually means an old password.",
    data: 
    {
      "kind": "logs",
      "question": "Which logs indicate a stale service credential?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "02:00:00",
          "source": "backup-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=svc_backup ip=10.0.0.5 reason=bad_password"
        },
        {
          "id": "log-2",
          "timestamp": "02:15:00",
          "source": "backup-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=svc_backup ip=10.0.0.5 reason=bad_password"
        },
        {
          "id": "log-3",
          "timestamp": "02:30:00",
          "source": "backup-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=svc_backup ip=10.0.0.5 reason=bad_password"
        },
        {
          "id": "log-4",
          "timestamp": "02:45:00",
          "source": "backup-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=svc_backup ip=10.0.0.5 reason=bad_password"
        },
        {
          "id": "log-5",
          "timestamp": "02:50:11",
          "source": "vpn-01",
          "event": "LOGIN_FAILURE",
          "detail": "user=svc_backup ip=203.0.113.88 reason=bad_password"
        }
      ]
    }
,
  },

  // Log Detective: Privileged Group Change
  {
    id: 'logs-privileged-group',
    position: 0,
    type: 'logs',
    title: "Log Detective: Privileged Group Change",
    instruction: "Select the events that show suspicious privileged-group activity outside a maintenance window.",
    hint: "Out-of-hours group changes for sensitive roles are more concerning than daytime ones.",
    data: 
    {
      "kind": "logs",
      "question": "Which events show suspicious privileged-group activity?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "03:22:05",
          "source": "iam-01",
          "event": "GROUP_MEMBER_ADD",
          "detail": "group=Domain Admins user=temp_admin actor=jsmith"
        },
        {
          "id": "log-2",
          "timestamp": "03:22:18",
          "source": "vpn-01",
          "event": "LOGIN_SUCCESS",
          "detail": "user=temp_admin ip=203.0.113.12 mfa=none"
        },
        {
          "id": "log-3",
          "timestamp": "09:00:00",
          "source": "iam-01",
          "event": "GROUP_MEMBER_ADD",
          "detail": "group=HelpDesk user=newhire actor=svc_provisioner maintenance_window=approved"
        },
        {
          "id": "log-4",
          "timestamp": "09:05:22",
          "source": "sso-01",
          "event": "LOGIN_SUCCESS",
          "detail": "user=newhire ip=10.0.0.20 mfa=ok"
        }
      ]
    }
,
  },

  // Log Detective: Security Log Cleared
  {
    id: 'logs-log-cleared',
    position: 0,
    type: 'logs',
    title: "Log Detective: Security Log Cleared",
    instruction: "Select the events that show logging was tampered with outside an approved window.",
    hint: "Audit-log changes are themselves logged. Compare the action time to the maintenance window.",
    data: 
    {
      "kind": "logs",
      "question": "Which events show unauthorized log tampering?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "03:14:02",
          "source": "audit-01",
          "event": "CONFIG_CHANGE",
          "detail": "user=eve action=PAUSE_AUDIT_LOG"
        },
        {
          "id": "log-2",
          "timestamp": "03:14:08",
          "source": "audit-01",
          "event": "LOG_PURGE",
          "detail": "user=eve records=last_24h"
        },
        {
          "id": "log-3",
          "timestamp": "03:15:11",
          "source": "vpn-01",
          "event": "LOGIN_SUCCESS",
          "detail": "user=eve ip=198.51.100.77 mfa=ok"
        },
        {
          "id": "log-4",
          "timestamp": "09:00:00",
          "source": "audit-01",
          "event": "CONFIG_CHANGE",
          "detail": "user=system action=ROTATE_LOGS maintenance_window=approved"
        }
      ]
    }
,
  },

  // Log Detective: Bulk File Download
  {
    id: 'logs-bulk-download',
    position: 0,
    type: 'logs',
    title: "Log Detective: Bulk File Download",
    instruction: "A user normally downloads about 5 files per day. Select the events that indicate data exfiltration.",
    hint: "Compare the volume and timing of downloads to the baseline.",
    data: 
    {
      "kind": "logs",
      "question": "Which events show unexpected bulk file downloads?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "14:02:01",
          "source": "docs-01",
          "event": "FILE_ACCESS",
          "detail": "user=bob file=Q1_Report.pdf"
        },
        {
          "id": "log-2",
          "timestamp": "14:02:05",
          "source": "docs-01",
          "event": "BULK_DOWNLOAD_START",
          "detail": "user=bob files=2847"
        },
        {
          "id": "log-3",
          "timestamp": "14:02:58",
          "source": "docs-01",
          "event": "BULK_DOWNLOAD_COMPLETE",
          "detail": "user=bob files=2847 size=1.9GB"
        },
        {
          "id": "log-4",
          "timestamp": "14:15:33",
          "source": "docs-01",
          "event": "FILE_ACCESS",
          "detail": "user=bob file=Vacation_Policy.pdf"
        }
      ]
    }
,
  },

  // Log Detective: Suspicious Scheduled Task
  {
    id: 'logs-scheduled-task',
    position: 0,
    type: 'logs',
    title: "Log Detective: Suspicious Scheduled Task",
    instruction: "A new scheduled task runs a script from a temp directory. Select the events that reveal this persistence technique.",
    hint: "Legitimate tasks run from managed paths. A task from C:\\Temp is suspicious.",
    data: 
    {
      "kind": "logs",
      "question": "Which events reveal a suspicious scheduled task?",
      "logs": [
        {
          "id": "log-1",
          "timestamp": "21:43:10",
          "source": "tasksvc-01",
          "event": "TASK_CREATE",
          "detail": "user=mallory task=UpdateHelper trigger=daily"
        },
        {
          "id": "log-2",
          "timestamp": "21:43:12",
          "source": "tasksvc-01",
          "event": "TASK_ACTION",
          "detail": "action=powershell.exe -File C:\\Temp\\update.ps1"
        },
        {
          "id": "log-3",
          "timestamp": "21:44:00",
          "source": "tasksvc-01",
          "event": "TASK_RUN",
          "detail": "task=UpdateHelper exit=0"
        },
        {
          "id": "log-4",
          "timestamp": "09:00:00",
          "source": "tasksvc-01",
          "event": "TASK_RUN",
          "detail": "task=BackupJob exit=0"
        }
      ]
    }
,
  },

  // Decode the Flag: Base64
  {
    id: 'decode-base64',
    position: 0,
    type: 'decode',
    title: "Decode the Flag: Base64",
    instruction: "Decode this Base64 string to find the flag.",
    hint: "Base64 uses A-Z, a-z, 0-9, +, /, and = padding. You can decode it with any tool.",
    data: 
    {
      "kind": "decode",
      "prompt": "Base64: UFNNe0pZWX0=",
      "placeholder": "PSM{...}",
      "tokens": [
        {
          "id": "t1",
          "value": "PSM{"
        },
        {
          "id": "t2",
          "value": "}"
        }
      ]
    }
,
  },

  // Decode the Flag: Hexadecimal
  {
    id: 'decode-hex',
    position: 0,
    type: 'decode',
    title: "Decode the Flag: Hexadecimal",
    instruction: "Each pair of hex digits is one ASCII character. Decode the flag.",
    hint: "50=P, 53=S, 4D=M. Use a hex-to-ASCII converter or decode by hand.",
    data: 
    {
      "kind": "decode",
      "prompt": "Hex: 50 53 4D 7B 57 45 42 7D",
      "placeholder": "PSM{...}",
      "tokens": [
        {
          "id": "t1",
          "value": "PSM{"
        },
        {
          "id": "t2",
          "value": "}"
        }
      ]
    }
,
  },

  // Decode the Flag: Binary ASCII
  {
    id: 'decode-binary',
    position: 0,
    type: 'decode',
    title: "Decode the Flag: Binary ASCII",
    instruction: "Each group of 8 bits is an ASCII character. Decode the flag using the lookup table.",
    hint: "Use the binary lookup table to convert each 8-bit group to its character.",
    data: 
    {
      "kind": "decode",
      "prompt": "Binary: 01010000 01010011 01001101 01111011 01001110 01000101 01010100 01111101",
      "placeholder": "PSM{...}",
      "tokens": [
        {
          "id": "t1",
          "value": "PSM{"
        },
        {
          "id": "t2",
          "value": "}"
        }
      ],
      "binaryLookup": {
        "01000001": "A",
        "01000010": "B",
        "01000011": "C",
        "01000100": "D",
        "01000101": "E",
        "01000110": "F",
        "01000111": "G",
        "01001000": "H",
        "01001001": "I",
        "01001010": "J",
        "01001011": "K",
        "01001100": "L",
        "01001101": "M",
        "01001110": "N",
        "01001111": "O",
        "01010000": "P",
        "01010001": "Q",
        "01010010": "R",
        "01010011": "S",
        "01010100": "T",
        "01010101": "U",
        "01010110": "V",
        "01010111": "W",
        "01011000": "X",
        "01011001": "Y",
        "01011010": "Z",
        "01111011": "{",
        "01111101": "}",
        "01011111": "_"
      }
    }
,
  },

  // Decode the Flag: URL Encoding
  {
    id: 'decode-url',
    position: 0,
    type: 'decode',
    title: "Decode the Flag: URL Encoding",
    instruction: "URL encoding uses % followed by hex digits for special characters. Decode the flag.",
    hint: "%7B is '{' and %7D is '}'. %5F is '_'.",
    data: 
    {
      "kind": "decode",
      "prompt": "URL-encoded: PSM%7BVPN%7D",
      "placeholder": "PSM{...}",
      "tokens": [
        {
          "id": "t1",
          "value": "PSM{"
        },
        {
          "id": "t2",
          "value": "}"
        }
      ]
    }
,
  },

  // Decode the Flag: Caesar Cipher
  {
    id: 'decode-caesar',
    position: 0,
    type: 'decode',
    title: "Decode the Flag: Caesar Cipher",
    instruction: "Each letter is shifted forward by 3. Shift it back to reveal the flag.",
    hint: "To undo a shift of 3, move each letter back 3 places. T becomes Q, H becomes E.",
    data: 
    {
      "kind": "decode",
      "prompt": "Ciphertext: TUX{BRXN} (shift back by 3)",
      "placeholder": "PSM{...}",
      "tokens": [
        {
          "id": "t1",
          "value": "PSM{"
        },
        {
          "id": "t2",
          "value": "}"
        }
      ]
    }
,
  },

  // Decode the Flag: Symbol Substitution
  {
    id: 'decode-substitution',
    position: 0,
    type: 'decode',
    title: "Decode the Flag: Symbol Substitution",
    instruction: "Each symbol stands for one letter using the legend. Decode the flag.",
    hint: "Use the legend to replace each symbol with its letter.",
    data: 
    {
      "kind": "decode",
      "prompt": "Symbols: @ # $ { & ^ + }",
      "placeholder": "PSM{...}",
      "tokens": [
        {
          "id": "t1",
          "value": "PSM{"
        },
        {
          "id": "t2",
          "value": "}"
        }
      ],
      "substitutionLegend": {
        "@": "P",
        "#": "S",
        "$": "M",
        "{": "{",
        "&": "K",
        "^": "E",
        "+": "Y",
        "}": "}"
      }
    }
,
  },
];

export function getAllChallenges(): Challenge[] {
  return CHALLENGE_BANK.map((c) => ({ ...c }));
}

export function getChallengeById(id: string): Challenge | undefined {
  return CHALLENGE_BANK.find((c) => c.id === id);
}

export function getChallengesByType(type: Challenge['type']): Challenge[] {
  return CHALLENGE_BANK.filter((c) => c.type === type).map((c) => ({ ...c }));
}

