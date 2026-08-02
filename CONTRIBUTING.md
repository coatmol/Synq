# Contributing to Synq

First off, thank you for considering contributing to Synq! It's people like you that make this tool great. 

## 🧠 What is Synq?
Synq is a local-first markdown editor and knowledge base with a custom peer-to-peer CRDT engine for real-time collaboration. The project consists of:
- **Desktop**: A Photino.NET wrapper serving as the native desktop shell.
- **Engine**: A custom C# CRDT implementation for decentralized state synchronization.
- **Client**: A React + Vite front-end for the markdown editor UI.

## 🛠️ Setting up your development environment

To build and run Synq locally, you will need:
- [.NET 10.0 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) (v18 or higher)
- A C# IDE (like JetBrains Rider, Visual Studio, or VS Code)

### Steps to Run:
1. **Clone the repository:**
   ```bash
   git clone https://github.com/coatmol/Synq.git
   cd Synq
   ```
2. **Install frontend dependencies:**
   ```bash
   cd src/Client
   npm install
   ```
3. **Run the frontend in Dev Mode:**
   ```bash
   npm run dev
   ```
4. **Run the Desktop App:**
   Open a new terminal and run the Photino application, passing the `--dev` flag so it connects to the Vite dev server instead of looking for built static files.
   ```bash
   cd src/Desktop
   dotnet run -- --dev
   ```

## 🐛 Found a Bug?
If you find a bug in the source code, you can help us by submitting an issue to our GitHub Repository. Even better, you can submit a Pull Request with a fix.

## ✨ Missing a Feature?
You can request a new feature by submitting an issue to our GitHub Repository. If you would like to implement it, an issue with a proposal must be submitted first, to be sure that we can use it.

## 🔄 Submitting a Pull Request
1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure the test suite passes.
4. Make sure your code lints.
5. Issue that pull request!

### Code Style Guidelines
- **C#**: We follow standard Microsoft C# coding conventions. Keep classes small and focused.
- **TypeScript/React**: We use ESLint and Prettier. Run `npm run lint` before committing.
- **CRDT Engine**: Changes to the `Engine` project must maintain deterministic state convergence. Please ensure robust unit tests are written for any networking or conflict-resolution logic.

## 🤝 Code of Conduct
By participating in this project, you agree to abide by our Code of Conduct. We expect all contributors to be respectful and constructive in their communication.
