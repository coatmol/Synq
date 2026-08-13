using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Engine;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Velopack;
using Velopack.Sources;

namespace Desktop;

public static class ApiEndpoints
{
    public static void MapAll(WebApplication app)
    {
        VelopackApp.Build().Run();
        var updateManager = new UpdateManager(new GithubSource("https://github.com/coatmol/Synq", null, false));

        app.Use(async (context, next) =>
        {
            var state = context.RequestServices.GetRequiredService<WorkspaceState>();
            if (!string.IsNullOrEmpty(state.Settings.Password))
            {
                var isLocal = !state.IsHeadless && (context.Connection.RemoteIpAddress == null ||
                                                    IPAddress.IsLoopback(context.Connection.RemoteIpAddress) ||
                                                    context.Connection.RemoteIpAddress.ToString() ==
                                                    context.Connection.LocalIpAddress?.ToString());

                var isExcluded = (context.Request.Path.StartsWithSegments("/api/settings") &&
                                  context.Request.Method == "GET") ||
                                 (!context.Request.Path.StartsWithSegments("/api") &&
                                  !context.Request.Path.StartsWithSegments("/hub"));

                var isPeerEndpoint = context.Request.Path.StartsWithSegments("/api/sync/manifest") ||
                                     context.Request.Path.StartsWithSegments("/api/rawfile");

                var bypassAuth = isLocal && !isPeerEndpoint;

                if (!bypassAuth && !isExcluded)
                {
                    var token = "";
                    if (context.Request.Headers.TryGetValue("Authorization", out var authHeader) &&
                        authHeader.ToString().StartsWith("Bearer "))
                        token = authHeader.ToString().Substring(7);
                    else if (context.Request.Query.TryGetValue("access_token", out var queryToken))
                        token = queryToken.ToString();

                    if (token != state.Settings.Password)
                    {
                        context.Response.StatusCode = 401;
                        return;
                    }
                }
            }

            await next();
        });

        app.MapHub<DocumentHub>("/hub");

        app.MapGet("/api/document", (string filename, DocumentManager manager) =>
            Results.Ok(new { text = manager.GetOrCreateDocument(filename).ToString() }));

        app.MapGet("/api/sync/manifest", (SyncManager sync) => { return Results.Ok(sync.InitializeLocalFolder()); });

        app.MapGet("/api/rawfile", (string filename, WorkspaceState state) =>
        {
            var path = PathUtils.GetSafePath(state.CurrentFolder, filename);
            if (path != null && File.Exists(path)) return Results.Text(File.ReadAllText(path));
            return Results.NotFound();
        });

        app.MapPost("/api/files/update", async (HttpRequest req, WorkspaceState state, DocumentManager docManager,
            VersionControlManager vc, SyncManager sync, IHubContext<DocumentHub> hubContext) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var filename = data.RootElement.GetProperty("filename").GetString();
            var content = data.RootElement.GetProperty("content").GetString();

            var path = PathUtils.GetSafePath(state.CurrentFolder, filename!);
            if (path == null) return Results.BadRequest();

            var isDoc = filename!.EndsWith(".md") || filename.EndsWith(".excalidraw");
            if (File.Exists(path) && isDoc) await vc.CommitFileAsync(filename, "Auto-Save (Before Restore)");

            await File.WriteAllTextAsync(path, content!);
            var doc = docManager.GetOrCreateDocument(filename!);
            doc.OverwriteFromContent(content!);

            if (isDoc) await vc.CommitFileAsync(filename, state.Settings.Username);

            sync.InitializeLocalFolder();
            await hubContext.Clients.All.SendAsync("DocumentUpdated", filename, content);
            return Results.Ok();
        });

        app.MapPost("/api/files/restore", async (HttpRequest req, WorkspaceState state, DocumentManager docManager,
            VersionControlManager vc, SyncManager sync, IHubContext<DocumentHub> hubContext) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var filename = data.RootElement.GetProperty("filename").GetString();
            var content = data.RootElement.GetProperty("content").GetString();
            var commitId = data.RootElement.GetProperty("commitId").GetString();

            var path = PathUtils.GetSafePath(state.CurrentFolder, filename!);
            if (path == null) return Results.BadRequest();

            var isDoc = filename!.EndsWith(".md") || filename.EndsWith(".excalidraw");
            if (File.Exists(path) && isDoc) await vc.CommitFileAsync(filename, "Auto-Save (Before Restore)");

            await File.WriteAllTextAsync(path, content!);
            var doc = docManager.GetOrCreateDocument(filename!);
            doc.OverwriteFromContent(content!);

            if (isDoc) await vc.CommitFileAsync(filename, state.Settings.Username, $"Restored from {commitId}");

            sync.InitializeLocalFolder();
            await hubContext.Clients.All.SendAsync("DocumentUpdated", filename, content);
            return Results.Ok();
        });

        app.MapPost("/api/rawfile",
            async (HttpRequest req, WorkspaceState state, DocumentManager docManager, SyncManager sync,
                VersionControlManager vc) =>
            {
                using var reader = new StreamReader(req.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonDocument.Parse(body);
                var filename = data.RootElement.GetProperty("filename").GetString();
                var isDirectory = false;
                if (data.RootElement.TryGetProperty("isDirectory", out var isDirProp))
                    isDirectory = isDirProp.GetBoolean();

                var path = PathUtils.GetSafePath(state.CurrentFolder, filename!);
                if (path == null) return Results.BadRequest();

                var dir = isDirectory ? path : Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

                if (isDirectory)
                {
                    sync.InitializeLocalFolder();
                    return Results.Ok();
                }

                var content = data.RootElement.GetProperty("content").GetString();

                var isSynqHistory = filename!.StartsWith(".synq/history/") || filename.StartsWith(".synq\\history\\");
                var isCommitsJson = filename.EndsWith("commits.json");
                var isSynqIndex = filename == ".synq/file_index.json" || filename == ".synq\\file_index.json";

                if (isSynqIndex)
                {
                    await vc.MergeFileIndexAsync(content!);
                    sync.InitializeLocalFolder();
                    return Results.Ok();
                }

                if (isSynqHistory && isCommitsJson)
                {
                    var uuid = filename.Split(new[] { '/', '\\' })[2];
                    if (!Regex.IsMatch(uuid, "^[0-9a-f]{32}$")) return Results.BadRequest();
                    await vc.MergeCommitsJsonAsync(uuid, content!);
                    sync.InitializeLocalFolder();
                    return Results.Ok();
                }

                var isDoc = filename.EndsWith(".md") || filename.EndsWith(".excalidraw");

                if (File.Exists(path) && isDoc) await vc.CommitFileAsync(filename, "Auto-Save (Before Remote Push)");

                await File.WriteAllTextAsync(path, content!);
                var doc = docManager.GetOrCreateDocument(filename!);
                doc.OverwriteFromContent(content!);

                if (isDoc) await vc.CommitFileAsync(filename, "Auto-Save (Remote Push)");

                // Re-init local folder to update hashes
                sync.InitializeLocalFolder();
                return Results.Ok();
            });

        // File System REST Routes
        app.MapGet("/api/files", (WorkspaceState state) =>
        {
            var root = state.CurrentFolder;
            if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
                return Results.Ok(new { files = new string[0], folders = new string[0] });


            var searchPatterns = new[] { "*.md", "*.excalidraw" };

            var allFiles = searchPatterns.SelectMany(pattern =>
                Directory.GetFiles(root, pattern, SearchOption.AllDirectories)
                    .Where(f => !f.Contains(Path.DirectorySeparatorChar + ".synq" + Path.DirectorySeparatorChar) &&
                                !f.EndsWith(Path.DirectorySeparatorChar + ".synq"))
                    .Select(f => Path.GetRelativePath(root, f).Replace('\\', '/')));

            var allDirs = Directory.GetDirectories(root, "*", SearchOption.AllDirectories)
                .Where(d => !d.Contains(Path.DirectorySeparatorChar + ".synq" + Path.DirectorySeparatorChar) &&
                            !d.EndsWith(Path.DirectorySeparatorChar + ".synq"))
                .Select(d => Path.GetRelativePath(root, d).Replace('\\', '/'));

            var notebookName = new DirectoryInfo(root).Name;

            return Results.Ok(new { files = allFiles, folders = allDirs, notebookName });
        });

        app.MapPost("/api/files",
            async (HttpRequest req, WorkspaceState state, SyncManager sync, IHubContext<DocumentHub> hubContext) =>
            {
                using var reader = new StreamReader(req.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonDocument.Parse(body);
                var filename = data.RootElement.GetProperty("filename").GetString();
                if (string.IsNullOrEmpty(filename)) return Results.BadRequest();
                if (!filename.EndsWith(".md") && !filename.EndsWith(".excalidraw")) filename += ".md";

                var filePath = PathUtils.GetSafePath(state.CurrentFolder, filename);
                if (filePath == null) return Results.BadRequest();
                var dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

                if (!File.Exists(filePath))
                {
                    if (filename.EndsWith(".md"))
                        await File.WriteAllTextAsync(filePath, "# " + Path.GetFileNameWithoutExtension(filename));
                    else if (filename.EndsWith(".excalidraw"))
                        await File.WriteAllTextAsync(filePath,
                            "{\"type\":\"excalidraw\",\"version\":2,\"source\":\"https://excalidraw.com\",\"elements\":[],\"appState\":{\"gridSize\": 20, \"gridStep\": 5, \"gridModeEnabled\": true, \"viewBackgroundColor\":\"#ffffff\"}}");

                    var vc = req.HttpContext.RequestServices.GetService<VersionControlManager>();
                    if (vc != null) await vc.CommitFileAsync(filename, state.Settings.Username);
                }

                sync.InitializeLocalFolder();
                await hubContext.Clients.All.SendAsync("FileCreated", filename);
                var discovery = req.HttpContext.RequestServices.GetService<LanDiscoveryService>();
                if (discovery?.PeerConnection != null) _ = discovery.PeerConnection.SendAsync("FileCreated", filename);
                return Results.Ok();
            });

        app.MapDelete("/api/files/{*filename}", async (string filename, WorkspaceState state, SyncManager sync,
            IHubContext<DocumentHub> hubContext, HttpContext httpContext) =>
        {
            var relativeName = Uri.UnescapeDataString(filename);
            var filePath = PathUtils.GetSafePath(state.CurrentFolder, relativeName);
            if (filePath == null) return Results.BadRequest();

            var vc = httpContext.RequestServices.GetService<VersionControlManager>();
            if (vc != null)
            {
                await vc.CommitFileAsync(relativeName, state.Settings.Username);
                await vc.CommitDeletionAsync(relativeName, state.Settings.Username);
            }

            if (File.Exists(filePath)) File.Delete(filePath);
            sync.InitializeLocalFolder();
            await hubContext.Clients.All.SendAsync("ItemDeleted", relativeName);

            var discovery = httpContext.RequestServices.GetService<LanDiscoveryService>();
            if (discovery?.PeerConnection != null)
                _ = discovery.PeerConnection.SendAsync("ItemDeleted", relativeName);
            return Results.Ok();
        });

        app.MapPost("/api/folders",
            async (HttpRequest req, WorkspaceState state, SyncManager sync, IHubContext<DocumentHub> hubContext) =>
            {
                using var reader = new StreamReader(req.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonDocument.Parse(body);
                var path = data.RootElement.GetProperty("path").GetString();
                if (string.IsNullOrEmpty(path)) return Results.BadRequest();

                var dirPath = PathUtils.GetSafePath(state.CurrentFolder, path);
                if (dirPath == null) return Results.BadRequest();

                if (!Directory.Exists(dirPath)) Directory.CreateDirectory(dirPath);

                sync.InitializeLocalFolder();
                await hubContext.Clients.All.SendAsync("FolderCreated", path);
                var discovery = req.HttpContext.RequestServices.GetService<LanDiscoveryService>();
                if (discovery?.PeerConnection != null) _ = discovery.PeerConnection.SendAsync("FolderCreated", path);
                return Results.Ok();
            });

        app.MapDelete("/api/folders/{*path}", async (string path, WorkspaceState state, SyncManager sync,
            IHubContext<DocumentHub> hubContext, HttpContext httpContext) =>
        {
            var dirPath = PathUtils.GetSafePath(state.CurrentFolder, Uri.UnescapeDataString(path));
            if (dirPath == null) return Results.BadRequest();

            if (Directory.Exists(dirPath)) Directory.Delete(dirPath, true);
            sync.InitializeLocalFolder();
            await hubContext.Clients.All.SendAsync("ItemDeleted", Uri.UnescapeDataString(path));
            var discovery = httpContext.RequestServices.GetService<LanDiscoveryService>();
            if (discovery?.PeerConnection != null)
                _ = discovery.PeerConnection.SendAsync("ItemDeleted", Uri.UnescapeDataString(path));
            return Results.Ok();
        });

        app.MapPost("/api/files/rename",
            async (HttpRequest req, WorkspaceState state, SyncManager sync, IHubContext<DocumentHub> hubContext) =>
            {
                using var reader = new StreamReader(req.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonDocument.Parse(body);
                var oldPath = data.RootElement.GetProperty("oldPath").GetString()!;
                var newPath = data.RootElement.GetProperty("newPath").GetString()!;

                var oldAbs = PathUtils.GetSafePath(state.CurrentFolder, oldPath);
                var newAbs = PathUtils.GetSafePath(state.CurrentFolder, newPath);
                if (oldAbs == null || newAbs == null) return Results.BadRequest();

                if (File.Exists(oldAbs))
                {
                    var dir = Path.GetDirectoryName(newAbs);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    File.Move(oldAbs, newAbs);
                }
                else if (Directory.Exists(oldAbs))
                {
                    Directory.Move(oldAbs, newAbs);
                }

                var indexFile = Path.Combine(state.CurrentFolder, ".synq", "file_index.json");
                if (File.Exists(indexFile))
                {
                    var index = JsonSerializer.Deserialize<Dictionary<string, string>>(
                        await File.ReadAllTextAsync(indexFile));
                    if (index != null)
                    {
                        var keysToUpdate = index.Keys.Where(k => k == oldPath || k.StartsWith(oldPath + "/")).ToList();
                        var changed = false;
                        foreach (var key in keysToUpdate)
                        {
                            var uuid = index[key];
                            index.Remove(key);
                            var updatedKey = key == oldPath ? newPath : newPath + key.Substring(oldPath.Length);
                            index[updatedKey] = uuid;
                            changed = true;
                        }

                        if (changed)
                            await File.WriteAllTextAsync(indexFile,
                                JsonSerializer.Serialize(index, new JsonSerializerOptions { WriteIndented = true }));
                    }
                }

                sync.InitializeLocalFolder();
                await hubContext.Clients.All.SendAsync("ItemRenamed", oldPath, newPath);
                var discovery = req.HttpContext.RequestServices.GetService<LanDiscoveryService>();
                if (discovery?.PeerConnection != null)
                    _ = discovery.PeerConnection.SendAsync("ItemRenamed", oldPath, newPath);
                return Results.Ok();
            });

        app.MapPost("/api/files/open-native", async (HttpRequest req, WorkspaceState state) =>
        {
            if (!OperatingSystem.IsWindows()) return Results.BadRequest("Not supported on this OS");
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var path = data.RootElement.GetProperty("path").GetString()!;

            var absPath = PathUtils.GetSafePath(state.CurrentFolder, path);
            if (absPath == null) return Results.BadRequest();

            // TODO: Make this platform-independent
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"/select,\"{absPath}\"",
                UseShellExecute = true
            });
            return Results.Ok();
        });

        app.MapGet("/api/peers",
            (LanDiscoveryService discovery) => { return Results.Ok(discovery.GetDiscoveredPeers(true)); });

        app.MapPost("/api/connect",
            async (HttpRequest req, LanDiscoveryService discovery, IHubContext<DocumentHub> hubContext) =>
            {
                using var reader = new StreamReader(req.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonDocument.Parse(body);
                var ip = data.RootElement.GetProperty("ip").GetString();
                var port = data.RootElement.GetProperty("port").GetInt32();
                var success = await discovery.ConnectToPeerAsync(ip!, port, hubContext);
                return success ? Results.Ok() : Results.BadRequest();
            });

        app.MapPost("/api/peers/manual", async (HttpRequest req, LanDiscoveryService discovery, WorkspaceState state,
            IHubContext<DocumentHub> hubContext) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var ip = data.RootElement.GetProperty("ip").GetString();
            var port = data.RootElement.GetProperty("port").GetInt32();

            if (data.RootElement.TryGetProperty("password", out var pwdEl) && pwdEl.ValueKind != JsonValueKind.Null)
            {
                var pwdStr = pwdEl.GetString() ?? "";
                if (!string.IsNullOrEmpty(pwdStr))
                {
                    state.Settings.PeerPasswords[$"{ip}:{port}"] = pwdStr;
                    state.SaveSettings();
                }
            }

            var success = await discovery.ConnectToPeerAsync(ip!, port, hubContext);
            return success ? Results.Ok() : Results.BadRequest();
        });

        app.MapGet("/api/share", (LanDiscoveryService discovery) =>
        {
            discovery.BroadcastQuery();
            var host = Dns.GetHostName();
            var ips = Dns.GetHostEntry(host).AddressList
                .Where(a => a.AddressFamily == AddressFamily.InterNetwork)
                .Select(a => a.ToString())
                .ToList();
            ips.Add("127.0.0.1"); // Always include localhost for testing
            return Results.Ok(new { ips = ips.Distinct(), port = discovery.Port });
        });

        app.MapGet("/api/settings", (HttpContext context, WorkspaceState state, SyncManager sync) =>
        {
            var isLocal = !state.IsHeadless && (context.Connection.RemoteIpAddress == null ||
                                                IPAddress.IsLoopback(context.Connection.RemoteIpAddress) ||
                                                context.Connection.RemoteIpAddress.ToString() ==
                                                context.Connection.LocalIpAddress?.ToString());

            var networkId = "";
            if (!string.IsNullOrEmpty(state.CurrentFolder))
                networkId = sync.LoadManifest(state.CurrentFolder).WanNetworkId;

            if (isLocal)
                return Results.Ok(new
                {
                    username = state.Settings.Username,
                    password = state.Settings.Password,
                    recentFolders = state.Settings.RecentFolders,
                    wanNetworkId = networkId
                });

            return Results.Ok(new
            {
                username = state.Settings.Username,
                wanNetworkId = networkId
            });
        });

        app.MapPost("/api/settings", async (HttpRequest req, WorkspaceState state) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            if (data.RootElement.TryGetProperty("username", out var usernameEl))
                state.Settings.Username = usernameEl.GetString()!;
            if (data.RootElement.TryGetProperty("password", out var passwordEl))
                state.Settings.Password = passwordEl.GetString() ?? "";
            state.SaveSettings();

            return Results.Ok();
        });

        app.MapGet("/api/version", () =>
        {
            var version = Assembly.GetEntryAssembly()?
                              .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                          ?? Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "1.0.0";

            var cleanVersion = version.Split('+')[0];
            return Results.Ok(new { version = cleanVersion });
        });

        // STUN Diagnostic Status
        app.MapGet("/api/stun/status", (StunDiagnosticService stun) =>
            Results.Ok(stun.GetStatusReport()));

        // WAN Token Exchange
        app.MapPost("/api/wan/create-offer", async (WebRtcPeerManager wrtc) =>
        {
            var res = await wrtc.CreateOfferTokenAsync();
            return Results.Ok(new { token = res.Token, pendingId = res.PendingId });
        });

        app.MapPost("/api/wan/accept-offer", async (HttpRequest req, WebRtcPeerManager wrtc) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var offerToken = data.RootElement.GetProperty("token").GetString()!;
            var answerToken = await wrtc.AcceptOfferTokenAsync(offerToken);
            return Results.Ok(new { token = answerToken });
        });

        app.MapPost("/api/wan/complete-handshake", async (HttpRequest req, WebRtcPeerManager wrtc) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var answerToken = data.RootElement.GetProperty("token").GetString()!;
            var pendingId = data.RootElement.GetProperty("pendingId").GetString()!;
            await wrtc.CompleteHandshakeAsync(answerToken, pendingId);
            return Results.Ok();
        });

        app.MapGet("/api/wan/peers", (WebRtcPeerManager wrtc) =>
            Results.Ok(wrtc.GetConnectedWanPeers()));

        app.MapGet("/api/wan/known-peers", (WebRtcPeerManager wrtc, SyncManager sync, WorkspaceState state) =>
        {
            var folder = state.CurrentFolder;
            if (string.IsNullOrEmpty(folder)) return Results.Ok(new object[0]);

            var manifest = sync.LoadManifest(folder);
            var connectedPeers = wrtc.GetConnectedWanPeers()
                .ToDictionary(p => (string)p.GetType().GetProperty("id")!.GetValue(p)!);

            var result = new List<object>();

            // Add known peers
            foreach (var kp in manifest.KnownWanPeers.Values)
                if (connectedPeers.ContainsKey(kp.PeerId))
                {
                    result.Add(connectedPeers[kp.PeerId]);
                    connectedPeers.Remove(kp.PeerId);
                }
                else
                {
                    result.Add(new
                    {
                        id = kp.PeerId,
                        name = kp.Name,
                        status = "offline",
                        transport = "wan",
                        init = kp.PeerId.Length >= 2 ? kp.PeerId[..2].ToUpper() : "??"
                    });
                }

            // Add any newly connected peers not yet saved
            foreach (var p in connectedPeers.Values) result.Add(p);

            return Results.Ok(result);
        });

        app.MapGet("/api/update", async (HttpRequest req, WebRtcPeerManager wrtc) =>
        {
            if (!updateManager.IsInstalled)
                return Results.Ok(new
                    { updateAvailable = false, message = "Updates are disabled in local/uninstalled mode." });

            var updateInfo = await updateManager.CheckForUpdatesAsync();
            if (updateInfo is not null)
                return Results.Ok(!updateInfo.IsDowngrade
                    ? new
                    {
                        updateAvailable = true, latest = updateInfo.TargetFullRelease.Version.ToFullString(),
                        message = "An update is available."
                    }
                    : new { updateAvailable = false, message = "No updates available." });

            return Results.Ok(new { updateAvailable = false, message = "Failed to check for updates." });
        });

        app.MapPatch("/api/update", async (HttpRequest req, WebRtcPeerManager wrtc) =>
        {
            if (!updateManager.IsInstalled)
                return Results.BadRequest(
                    new { message = "Cannot apply updates when running locally (not installed)." });

            var updateInfo = await updateManager.CheckForUpdatesAsync();
            if (updateInfo is not null && !updateInfo.IsDowngrade)
                try
                {
                    await updateManager.DownloadUpdatesAsync(updateInfo);
                    updateManager.ApplyUpdatesAndRestart(updateInfo);
                }
                catch (Exception e)
                {
                    Console.WriteLine(e);
                    return Results.BadRequest(new { message = "Failed to apply update: " + e.Message });
                }

            return Results.BadRequest(new { message = "No updates available." });
        });

        app.MapPost("/api/commit", async (HttpRequest req, WorkspaceState state, VersionControlManager vc,
            SyncManager sync, LanDiscoveryService discovery) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            var fileName = data.RootElement.GetProperty("fileName").GetString()!;

            if (!fileName.EndsWith(".md") && !fileName.EndsWith(".excalidraw"))
                return Results.BadRequest(new
                    { message = "Invalid file type. Only .md and .excalidraw files are supported." });

            try
            {
                var commitId = await vc.CommitFileAsync(fileName, state.Settings.Username);
                if (commitId == null) return Results.NotFound();

                sync.InitializeLocalFolder();

                // Let peers know we have new commits
                if (discovery.PeerConnection != null)
                    _ = discovery.PeerConnection.SendAsync("FileCreated", ".synq/file_index.json");

                return Results.Ok();
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return Results.BadRequest(new { message = "Failed to commit changes: " + e.Message });
            }
        });

        app.MapGet("/api/commits", async (string? fileName, WorkspaceState state) =>
        {
            if (string.IsNullOrEmpty(state.CurrentFolder))
                return Results.Ok(new { commits = new List<CommitRecord>() });
            var dotSynq = Path.Combine(state.CurrentFolder, ".synq");
            var indexFile = Path.Combine(dotSynq, "file_index.json");
            if (!File.Exists(indexFile)) return Results.Ok(new { commits = new List<CommitRecord>() });

            var index = JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile));
            if (index == null) return Results.Ok(new { commits = new List<CommitRecord>() });

            var allCommits = new List<object>();

            if (!string.IsNullOrEmpty(fileName))
            {
                if (index.TryGetValue(fileName, out var uuid))
                {
                    var commitsFile = Path.Combine(dotSynq, "history", uuid, "commits.json");
                    if (File.Exists(commitsFile))
                    {
                        var history =
                            JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile));
                        if (history != null)
                            foreach (var c in history.Commits)
                                allCommits.Add(new
                                {
                                    commitId = c.CommitId, contentHash = c.ContentHash, parentId = c.ParentId,
                                    timestamp = c.Timestamp, authorName = c.AuthorName, message = c.Message,
                                    isDeleted = c.IsDeleted, fileName
                                });
                    }
                }
            }
            else
            {
                foreach (var kvp in index)
                {
                    var fName = kvp.Key;
                    var uuid = kvp.Value;
                    var commitsFile = Path.Combine(dotSynq, "history", uuid, "commits.json");
                    if (File.Exists(commitsFile))
                    {
                        var history =
                            JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile));
                        if (history != null)
                            foreach (var c in history.Commits)
                                allCommits.Add(new
                                {
                                    commitId = c.CommitId, contentHash = c.ContentHash, parentId = c.ParentId,
                                    timestamp = c.Timestamp, authorName = c.AuthorName, message = c.Message,
                                    isDeleted = c.IsDeleted, fileName = fName
                                });
                    }
                }
            }

            var sorted = allCommits.OrderByDescending(c => ((dynamic)c).timestamp).ToList();
            return Results.Ok(new { commits = sorted });
        });

        app.MapGet("/api/commit/content", async (string fileName, string commitId, WorkspaceState state) =>
        {
            if (string.IsNullOrEmpty(state.CurrentFolder)) return Results.NotFound();
            var dotSynq = Path.Combine(state.CurrentFolder, ".synq");
            var indexFile = Path.Combine(dotSynq, "file_index.json");
            if (!File.Exists(indexFile)) return Results.NotFound();

            var index = JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile));
            if (index == null || !index.TryGetValue(fileName, out var uuid)) return Results.NotFound();

            if (!Regex.IsMatch(commitId, "^([0-9a-f]{32})$"))
                return Results.BadRequest();

            var commitsFile = Path.Combine(dotSynq, "history", uuid, "commits.json");
            if (!File.Exists(commitsFile)) return Results.NotFound();
            var history = JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile));
            var commit = history?.Commits.FirstOrDefault(c => c.CommitId == commitId);
            if (commit == null) return Results.NotFound();
            if (commit.IsDeleted) return Results.Ok(new { content = "" });

            var objectFile = Path.Combine(dotSynq, "history", uuid, "objects", $"{commit.ContentHash}.bin");
            if (!File.Exists(objectFile)) return Results.NotFound();

            var bytes = await File.ReadAllBytesAsync(objectFile);
            var content = MarkdownCompressor.Decompress(bytes);
            return Results.Ok(new { content });
        });
    }
}

public class CommitRecord
{
    public string CommitId { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;
    public string? ParentId { get; set; }
    public long Timestamp { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
}

public class CommitHistory
{
    public string? Head { get; set; }
    public List<CommitRecord> Commits { get; set; } = new();
}