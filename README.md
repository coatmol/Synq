<div align="center">
  <img src="Assets/SynqWhite.png" alt="Synq Logo" width="128" />
  <h1>Synq</h1>
</div>

> A high-performance, local-first markdown editor and peer-to-peer knowledge workspace with zero server dependencies.

[![CI](https://github.com/coatmol/Synq/actions/workflows/ci.yml/badge.svg)](https://github.com/coatmol/Synq/actions/workflows/ci.yml)
[![CodeQL](https://github.com/coatmol/Synq/actions/workflows/codeql.yml/badge.svg)](https://github.com/coatmol/Synq/actions/workflows/codeql.yml)
[![Windows](https://img.shields.io/github/actions/workflow/status/coatmol/Synq/release.yml?label=Windows&logo=windows)](https://github.com/coatmol/Synq/actions/workflows/release.yml)
[![macOS](https://img.shields.io/github/actions/workflow/status/coatmol/Synq/release.yml?label=macOS&logo=apple)](https://github.com/coatmol/Synq/actions/workflows/release.yml)
[![Linux](https://img.shields.io/github/actions/workflow/status/coatmol/Synq/release.yml?label=Linux&logo=linux)](https://github.com/coatmol/Synq/actions/workflows/release.yml)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![.NET](https://img.shields.io/badge/.NET-10.0-512BD4.svg)
![React](https://img.shields.io/badge/React-19.0-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6.svg)

**Synq** is a zero-trust, local-first markdown editor and personal knowledge base built for absolute data sovereignty. Designed for taking interconnected notes and managing large collections of markdown documents locally, Synq gives you full ownership over your thoughts in plain text—with zero telemetry, zero tracking, and no required accounts.

Instead of relying on a centralized database or cloud backend to resolve concurrent edits between devices, Synq implements a custom Conflict-Free Replicated Data Type (CRDT) engine in C#. Nodes (your devices) discover each other automatically on local networks, establish direct peer-to-peer socket connections, and merge state changes deterministically. Your data never leaves your machine, ensuring your private notes remain entirely insulated from corporate cloud providers and data harvesting.

---

## Key Features

* **Absolute Privacy & Data Sovereignty:** Your data is completely air-gapped from the cloud. No analytics, no telemetry, no mandatory sign-ups, and no middleman servers.
* **Advanced Markdown Editor:** A frictionless, focused writing environment with robust support for markdown, bi-directional linking, and networked thought organization.
* **Hierarchical File Management:** Full support for deeply nested folders, drag-and-drop organization, and a multi-tabbed interface for editing multiple documents concurrently.
* **Native Context Operations:** Right-click context menus for renaming, deleting, and natively opening files directly within the OS explorer.
* **Zero-Server Architecture:** No central database, backend API, or cloud service required. The client *is* the server.
* **Headless Server Node:** Deploy Synq as an always-on, UI-free container on your NAS or homelab to provide a 24/7 persistent peer.
* **Deterministic Conflict Resolution:** Mathematical guarantees ensure all peers eventually converge on the exact same document state regardless of network latency, packet reordering, or offline duration.
* **Offline-First Storage:** Local-first state persistence backed by a lightweight file-system database. You retain 100% ownership of your data offline.
* **Zero-Configuration Discovery:** Automatic peer discovery across local Wi-Fi and LAN networks using Multicast DNS (mDNS).
* **Native Desktop Experience:** OS-independent lightweight desktop wrapper powered by Photino, combining native C# backend execution with a modern React UI.

---

## System Architecture

Synq operates as a strictly local peer-to-peer system. Each running instance of the app hosts an embedded ASP.NET Core process running on `localhost`. The React front-end is completely isolated and never touches the external internet—it communicates exclusively with its local host process over HTTP/WebSockets. The host manages all peer discovery, markdown file I/O, and raw TCP socket streaming strictly between your local network devices, completely bypassing internet relays that could otherwise collect network metadata.

---

## Installation & Downloads

Synq is available in two distinct flavors: the full **Desktop Application** and the **Headless Server** node.

### 1. Desktop Application
The primary way to use Synq. A lightning-fast, native desktop application with an embedded markdown editor.

- **Pre-compiled Binaries (Recommended):** Download the latest `.zip` for Windows, macOS, or Linux from the [Releases page](https://github.com/coatmol/Synq/releases). No installation required; just extract and run!
- **From Source:**

```bash
git clone https://github.com/coatmol/Synq.git
cd Synq
dotnet run --project src/Desktop
```

### 2. Headless Server (For Homelabs)
A persistent, always-on peer designed specifically for the self-hosting and homelab community. It runs the exact same P2P CRDT sync engine as the desktop client, but without any graphical interface. By running this on a NAS, Raspberry Pi, or home server, you guarantee that your notes have a 24/7 backup target and a highly-available network node. 

> **Important Security Disclaimer (Temporary):** The Synq engine is strictly local-first and expects to run on trusted local area networks (LAN, WireGuard, Tailscale). The API currently has **no authentication**. Do not expose the headless server to the public internet!

- **Via Docker (Recommended for Servers):**
  Synq Server is fully containerized. For the mDNS auto-discovery to work properly on your local network, you should run the container using host networking.

```bash
docker run -d \
  --name synq-server \
  --network host \
  -v /path/to/your/notes:/data \
  -e port=5000 \
  ghcr.io/coatmol/synq:latest
```

- **Pre-compiled Binaries:** Download the `Synq-Server-*` `.zip` from the [Releases page](https://github.com/coatmol/Synq/releases).
- **From Source:**

```bash
git clone https://github.com/coatmol/Synq.git
cd Synq
# Set your sync directory
export folder=/home/user/notes
dotnet run --project src/Server
```