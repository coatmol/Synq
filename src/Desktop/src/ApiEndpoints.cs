using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace Desktop;

public static class ApiEndpoints
{
    public static void MapAll(WebApplication app)
    {
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

        app.MapPost("/api/rawfile",
            async (HttpRequest req, WorkspaceState state, DocumentManager docManager, SyncManager sync) =>
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
                await File.WriteAllTextAsync(path, content!);
                var doc = docManager.GetOrCreateDocument(filename!);
                doc.OverwriteFromContent(content!);

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
            var filePath = PathUtils.GetSafePath(state.CurrentFolder, Uri.UnescapeDataString(filename));
            if (filePath == null) return Results.BadRequest();

            if (File.Exists(filePath)) File.Delete(filePath);
            sync.InitializeLocalFolder();
            await hubContext.Clients.All.SendAsync("ItemDeleted", Uri.UnescapeDataString(filename));
            var discovery = httpContext.RequestServices.GetService<LanDiscoveryService>();
            if (discovery?.PeerConnection != null)
                _ = discovery.PeerConnection.SendAsync("ItemDeleted", Uri.UnescapeDataString(filename));
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

            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"/select,\"{absPath}\"",
                UseShellExecute = true
            });
            return Results.Ok();
        });

        app.MapGet("/api/peers",
            (LanDiscoveryService discovery) => { return Results.Ok(discovery.GetDiscoveredPeers()); });

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

        app.MapGet("/api/settings", (HttpContext context, WorkspaceState state) =>
        {
            var isLocal = !state.IsHeadless && (context.Connection.RemoteIpAddress == null ||
                                                IPAddress.IsLoopback(context.Connection.RemoteIpAddress) ||
                                                context.Connection.RemoteIpAddress.ToString() ==
                                                context.Connection.LocalIpAddress?.ToString());

            if (isLocal)
                return Results.Ok(state.Settings);

            return Results.Ok(new
            {
                username = state.Settings.Username
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
            var version = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "1.0.0";
            return Results.Ok(new { version });
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
    }
}