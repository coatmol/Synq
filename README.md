# Synq

> A high-performance, local-first collaborative engine and peer-to-peer document workspace with zero server dependencies.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![.NET](https://img.shields.io/badge/.NET-10.0-512BD4.svg)
![React](https://img.shields.io/badge/React-19.0-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6.svg)

**Synq** is a zero-trust, local-first application built to demonstrate state synchronization over decentralized peer-to-peer networks. Instead of relying on a centralized database or cloud backend to resolve concurrent edits, Synq implements a custom Conflict-Free Replicated Data Type (CRDT) engine in C#. Nodes discover each other automatically on local networks, establish direct peer-to-peer socket connections, and merge state changes deterministically without ever exposing data to a cloud provider.

---

## Key Features

* **Zero-Server Architecture:** No central database, backend API, or cloud service required. The client *is* the server.
* **Deterministic Conflict Resolution:** Mathematical guarantees ensure all peers eventually converge on the exact same document state regardless of network latency, packet reordering, or offline duration.
* **Offline-First Storage:** Local-first state persistence backed by a lightweight file-system database. You retain 100% ownership of your data offline.
* **Zero-Configuration Discovery:** Automatic peer discovery across local Wi-Fi and LAN networks using Multicast DNS (mDNS).
* **Native Desktop Experience:** OS-independent lightweight desktop wrapper powered by Photino, combining native C# backend execution with a modern React UI.

---

## System Architecture

Synq operates as a hybrid peer-to-peer system. Each running instance of the app hosts a embedded ASP.NET Core process running locally on `localhost`. The React front-end never touches the external internet—it communicates exclusively with its local host process over HTTP/WebSockets, while the host manages all peer discovery and raw TCP socket streaming.