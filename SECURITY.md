# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue to report a security vulnerability.**

If you discover a security vulnerability in Synq, we appreciate your help in disclosing it responsibly. Public disclosure before a fix is available puts all users at risk.

### How to Report

1. **GitHub Security Advisories (Preferred):**
   Go to the [Security Advisories](https://github.com/coatmol/Synq/security/advisories/new) page and create a new private advisory. This is the fastest and most secure way to reach us.

2. **Email:**
   If you're unable to use GitHub Security Advisories, you may email the maintainers directly. Please include `[SECURITY]` in the subject line. Contact information can be found on the maintainer's GitHub profile.

### What to Include

To help us triage and fix the issue quickly, please provide:

- A clear description of the vulnerability
- Steps to reproduce the issue
- The affected component (e.g., CRDT engine, peer sync, SignalR hub, API endpoints)
- The potential impact (e.g., data loss, unauthorized access, remote code execution)
- Any suggested fixes or mitigations, if you have them

### What to Expect

- **Acknowledgment:** We will acknowledge receipt of your report within **48 hours**.
- **Updates:** We will keep you informed of our progress toward a fix.
- **Disclosure:** We will coordinate with you on a public disclosure timeline once a fix is available. We aim to resolve critical vulnerabilities within **7 days**.
- **Credit:** Unless you prefer to remain anonymous, we will credit you in the release notes and security advisory.

### Scope

The following are in scope for security reports:

- The Synq Desktop application
- The Synq Headless Server
- The CRDT engine (`Engine` project)
- The SignalR hub and HTTP API endpoints
- Peer-to-peer authentication and sync protocol
- Docker container configuration

### Out of Scope

- Vulnerabilities in third-party dependencies (please report these to the respective projects)
- Issues requiring physical access to an already-authenticated machine
- Social engineering attacks

---

Thank you for helping keep Synq and its users safe.
