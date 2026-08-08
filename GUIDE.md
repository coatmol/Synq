# Synq User Guide
### FAQ and Markdown Cheat Sheet

## FAQ

### How to join/invite via LAN
1. Ensure both devices are connected to the same local network (Wi-Fi or Ethernet).
2. Open Synq on both devices.
3. Synq automatically discovers peers using mDNS. In the top right corner of the window, click on the **LAN Peers** network icon.
4. You should see the other device listed in the discovered peers panel.
5. Click on the peer to establish a direct connection and begin syncing your workspace.

### How to join/invite through the internet
1. Open Synq on the host device and click on the **WAN Peers** icon (the globe symbol).
2. Click on **Create Invite** to generate a secure, one-time WAN token.
3. Share this token with your peer through a secure messaging channel.
4. On the receiving device, click the **WAN Peers** icon, select **Accept Invite**, and paste the token.
5. Synq will negotiate a connection using STUN servers to punch through NATs and establish a direct peer-to-peer link over the internet.

---

## Markdown Cheat Sheet

Synq features a robust Markdown editor with rich text support. Here is a quick reference:

### Headers
```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

### Text Formatting
```markdown
**Bold text**
*Italic text*
***Bold and italic***
~~Strikethrough~~
```

### Lists
**Unordered Lists:**
```markdown
* Item 1
* Item 2
  * Sub-item A
```

**Ordered Lists:**
```markdown
1. First item
2. Second item
```

### Links & Images
```markdown
[Visit GitHub](https://github.com/coatmol/Synq)
![Image Alt Text](https://example.com/image.jpg)
```

### Wiki Links
Synq supports wiki links for quickly navigating between files:
```markdown
[[filename]]
[[filename.md]]
[[folder/filename]]
```
Clicking on these links will automatically open the corresponding file in your workspace. If no extension is provided, `.md` is automatically appended.

### Excalidraw Whiteboards
Synq supports natively embedding Excalidraw whiteboards directly into your markdown documents.
To create a whiteboard, create a file ending in `.excalidraw` (using the new sketch button). To embed it in your markdown document, simply link to it:
```markdown
[[diagram.excalidraw]]
```
The diagram will render as a live, inline SVG within your markdown file. You can double-click the diagram to open it for editing, or place your text cursor over the link to reveal the original text.

### Tables
```markdown
| Header 1 | Header 2 | Header 3 |
| :--- | :---: | ---: |
| Left-aligned | Centered | Right-aligned |
| Row 2 | Content | More content |
```

### Task Lists
```markdown
- [x] Completed task
- [ ] Incomplete task
```

### Horizontal Rules
Use three or more hyphens, asterisks, or underscores to create a horizontal line.
```markdown
---
```

### Blockquotes
```markdown
> This is a blockquote.
> It can span multiple lines.
```

### Code
**Inline code:** Use single backticks: `const sync = true;`

**Code blocks:** Use triple backticks and specify the language:
\```javascript
function syncNodes() {
  console.log("Syncing...");
}
\```

### Mathematics (LaTeX)
Synq natively supports LaTeX math rendering via KaTeX.
**Inline math:** Wrap with a single `$` symbol: `$E = mc^2$`
**Block math:** Wrap with double `$$` symbols:
```markdown
$$
\frac{n!}{k!(n-k)!} = \binom{n}{k}
$$
```
