# Synq

> A high-performance, local-first markdown editor and peer-to-peer knowledge workspace with zero server dependencies.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![.NET](https://img.shields.io/badge/.NET-10.0-512BD4.svg)
![React](https://img.shields.io/badge/React-19.0-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6.svg)
[![CI](https://github.com/coatmol/Synq/actions/workflows/ci.yml/badge.svg)](https://github.com/coatmol/Synq/actions/workflows/ci.yml)
[![CodeQL](https://github.com/coatmol/Synq/actions/workflows/codeql.yml/badge.svg)](https://github.com/coatmol/Synq/actions/workflows/codeql.yml)

**Synq** is a zero-trust, local-first markdown editor and personal knowledge base built for absolute data sovereignty. Designed for taking interconnected notes and managing large collections of markdown documents locally, Synq gives you full ownership over your thoughts in plain text—with zero telemetry, zero tracking, and no required accounts.

Instead of relying on a centralized database or cloud backend to resolve concurrent edits between devices, Synq implements a custom Conflict-Free Replicated Data Type (CRDT) engine in C#. Nodes (your devices) discover each other automatically on local networks, establish direct peer-to-peer socket connections, and merge state changes deterministically. Your data never leaves your machine, ensuring your private notes remain entirely insulated from corporate cloud providers and data harvesting.

---

## Key Features

* **Absolute Privacy & Data Sovereignty:** Your data is completely air-gapped from the cloud. No analytics, no telemetry, no mandatory sign-ups, and no middleman servers.
* **Advanced Markdown Editor:** A frictionless, focused writing environment with robust support for markdown, bi-directional linking, and networked thought organization.
* **Zero-Server Architecture:** No central database, backend API, or cloud service required. The client *is* the server.
* **Deterministic Conflict Resolution:** Mathematical guarantees ensure all peers eventually converge on the exact same document state regardless of network latency, packet reordering, or offline duration.
* **Offline-First Storage:** Local-first state persistence backed by a lightweight file-system database. You retain 100% ownership of your data offline.
* **Zero-Configuration Discovery:** Automatic peer discovery across local Wi-Fi and LAN networks using Multicast DNS (mDNS).
* **Native Desktop Experience:** OS-independent lightweight desktop wrapper powered by Photino, combining native C# backend execution with a modern React UI.

---

## System Architecture

Synq operates as a strictly local peer-to-peer system. Each running instance of the app hosts an embedded ASP.NET Core process running on `localhost`. The React front-end is completely isolated and never touches the external internet—it communicates exclusively with its local host process over HTTP/WebSockets. The host manages all peer discovery, markdown file I/O, and raw TCP socket streaming strictly between your local network devices, completely bypassing internet relays that could otherwise collect network metadata.