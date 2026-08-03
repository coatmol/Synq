using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Desktop;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Photino.NET;

namespace Synq;

internal class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
        });

        builder.Services.AddSingleton<WorkspaceState>();
        builder.Services.AddSingleton<DocumentManager>();
        builder.Services.AddSingleton<SyncManager>();
        builder.Services.AddSingleton<LanDiscoveryService>();

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowFrontend",
                p => p.WithOrigins("http://127.0.0.1:5173", "http://localhost:5173").AllowAnyHeader().AllowAnyMethod()
                    .AllowCredentials());
        });
        builder.Services.AddSignalR();

        var app = builder.Build();

        app.UseCors("AllowFrontend");

        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.MapHub<DocumentHub>("/hub");
        app.MapGet("/api/document", (string filename, DocumentManager manager) =>
            Results.Ok(new { text = manager.GetOrCreateDocument(filename).ToString() }));

        app.MapGet("/api/sync/manifest", (SyncManager sync) => { return Results.Ok(sync.InitializeLocalFolder()); });

        app.MapGet("/api/rawfile", (string filename, WorkspaceState state) =>
        {
            var path = Path.Combine(state.CurrentFolder, filename);
            if (File.Exists(path)) return Results.Text(File.ReadAllText(path));
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

                var path = Path.Combine(state.CurrentFolder, filename!);
                var dir = isDirectory ? path : Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

                if (isDirectory)
                {
                    sync.InitializeLocalFolder();
                    return Results.Ok();
                }

                var content = data.RootElement.GetProperty("content").GetString();
                await File.WriteAllTextAsync(path, content!);
                docManager.GetOrCreateDocument(filename!);

                // Re-init local folder to update hashes
                sync.InitializeLocalFolder();
                return Results.Ok();
            });

        // File System REST Routes
        app.MapGet("/api/files", (WorkspaceState state) =>
        {
            var root = state.CurrentFolder;
            var allFiles = Directory.GetFiles(root, "*.md", SearchOption.AllDirectories)
                .Where(f => !f.Contains(Path.DirectorySeparatorChar + ".synq" + Path.DirectorySeparatorChar) &&
                            !f.EndsWith(Path.DirectorySeparatorChar + ".synq"))
                .Select(f => Path.GetRelativePath(root, f).Replace('\\', '/'));

            var allDirs = Directory.GetDirectories(root, "*", SearchOption.AllDirectories)
                .Where(d => !d.Contains(Path.DirectorySeparatorChar + ".synq" + Path.DirectorySeparatorChar) &&
                            !d.EndsWith(Path.DirectorySeparatorChar + ".synq"))
                .Select(d => Path.GetRelativePath(root, d).Replace('\\', '/'));

            return Results.Ok(new { files = allFiles, folders = allDirs });
        });

        app.MapPost("/api/files",
            async (HttpRequest req, WorkspaceState state, SyncManager sync, IHubContext<DocumentHub> hubContext) =>
            {
                using var reader = new StreamReader(req.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonDocument.Parse(body);
                var filename = data.RootElement.GetProperty("filename").GetString();
                if (string.IsNullOrEmpty(filename)) return Results.BadRequest();
                if (!filename.EndsWith(".md")) filename += ".md";

                var filePath = PathUtils.GetSafePath(state.CurrentFolder, filename);
                if (filePath == null) return Results.BadRequest();
                var dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

                if (!File.Exists(filePath))
                    await File.WriteAllTextAsync(filePath, "# " + Path.GetFileNameWithoutExtension(filename));
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

        app.MapGet("/api/settings", (WorkspaceState state) => { return Results.Ok(state.Settings); });

        app.MapPost("/api/settings", async (HttpRequest req, WorkspaceState state) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonDocument.Parse(body);
            if (data.RootElement.TryGetProperty("username", out var usernameEl))
            {
                state.Settings.Username = usernameEl.GetString()!;
                state.SaveSettings();
            }

            return Results.Ok();
        });

        // If the user navigates to a route (like /settings), serve index.html
        app.MapFallbackToFile("index.html");

        // Start the ASP.NET Core web server on a local port in the background
        const string bindUrl = "http://0.0.0.0:0";
        app.Urls.Add(bindUrl); // Explicitly bind to port 0 (random)
        app.StartAsync().GetAwaiter().GetResult();

        var server = app.Services.GetRequiredService<IServer>();
        var addressFeature = server.Features.Get<IServerAddressesFeature>();
        var serverUrl = addressFeature!.Addresses.First();
        var uri = new Uri(serverUrl.Replace("[::]", "0.0.0.0"));
        var localServerUrl = $"http://127.0.0.1:{uri.Port}";
        var discoveryService = app.Services.GetRequiredService<LanDiscoveryService>();
        discoveryService.Start(uri.Port);

        using (var httpClient = new HttpClient())
        {
            var serverReady = false;
            while (!serverReady)
                try
                {
                    var response = httpClient.GetAsync(localServerUrl + "/api/files").GetAwaiter().GetResult();
                    serverReady = true;
                }
                catch
                {
                    // Server isn't up yet, wait 50ms and try again
                    Thread.Sleep(50);
                }
        }

        // Launch Photino Native Desktop Window
        var isDevelopment = args.Contains("--dev");
        var startUrl = isDevelopment
            ? $"http://127.0.0.1:5173?backend={localServerUrl}"
            : $"{localServerUrl}?backend={localServerUrl}";

        var window = new PhotinoWindow()
            .SetTitle("Synq - Local-First Markdown Editor")
            .SetSize(1280, 800)
            .Center()
            .SetContextMenuEnabled(false)
            .SetDevToolsEnabled(true)
            .SetSmoothScrollingEnabled(true)
            .SetFileSystemAccessEnabled(true)
            .Load(startUrl);

        var isMaximized = false;
        window.RegisterWebMessageReceivedHandler((sender, message) =>
        {
            var win = (PhotinoWindow)sender!;
            try
            {
                var msg = JsonDocument.Parse(message);
                var action = msg.RootElement.GetProperty("action").GetString();
                switch (action)
                {
                    case "close":
                        win.Close();
                        break;
                    case "minimize":
                        win.SetMinimized(true);
                        break;
                    case "maximize":
                        isMaximized = !isMaximized;
                        win.SetMaximized(isMaximized);
                        break;
                    case "openFolder":
                        _ = discoveryService.DisconnectFromPeerAsync();
                        var paths = win.ShowOpenFolder();
                        if (paths != null && paths.Length > 0)
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            state.CurrentFolder = paths[0];
                            discoveryService.StartAdvertising();
                            win.SendWebMessage("folderOpened");
                        }

                        break;
                    case "closeFolder":
                        _ = discoveryService.DisconnectFromPeerAsync();
                        discoveryService.StopAdvertising();
                        var stateToClear = app.Services.GetRequiredService<WorkspaceState>();
                        stateToClear.CurrentFolder = string.Empty;
                        win.SendWebMessage("folderClosed");
                        break;
                    case "openRecent":
                        _ = discoveryService.DisconnectFromPeerAsync();
                        var recentPath = msg.RootElement.GetProperty("path").GetString();
                        if (!string.IsNullOrEmpty(recentPath) && Directory.Exists(recentPath))
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            state.CurrentFolder = recentPath;
                            discoveryService.StartAdvertising();
                            win.SendWebMessage("folderOpened");
                        }
                        else
                        {
                            win.SendWebMessage("folderError");
                        }

                        break;
                    case "connectPeer":
                        var ip = msg.RootElement.GetProperty("ip").GetString();
                        var port = msg.RootElement.GetProperty("port").GetInt32();
                        var discovery = app.Services.GetRequiredService<LanDiscoveryService>();
                        var hubContext = app.Services.GetRequiredService<IHubContext<DocumentHub>>();
                        Task.Run(() => discovery.ConnectToPeerAsync(ip!, port, hubContext));
                        win.SendWebMessage("connectSuccess");
                        break;
                }
            }
            catch
            {
                // Fallback for simple string messages
                switch (message)
                {
                    case "close":
                        win.Close();
                        break;
                    case "minimize":
                        win.SetMinimized(true);
                        break;
                    case "maximize":
                        isMaximized = !isMaximized;
                        win.SetMaximized(isMaximized);
                        break;
                }
            }
        });

        window.WindowClosing += (sender, e) =>
        {
            discoveryService.Stop();
            app.StopAsync().GetAwaiter().GetResult();
            return false;
        };

        window.WaitForClose();
    }
}