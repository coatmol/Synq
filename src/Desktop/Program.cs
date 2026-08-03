using Desktop;
using Engine;
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

        app.MapGet("/api/sync/manifest", (SyncManager sync) => {
            return Results.Ok(sync.InitializeLocalFolder());
        });

        app.MapGet("/api/rawfile", (string filename, WorkspaceState state) => {
            var path = Path.Combine(state.CurrentFolder, filename);
            if (File.Exists(path))
            {
                return Results.Text(File.ReadAllText(path));
            }
            return Results.NotFound();
        });

        app.MapPost("/api/rawfile", async (HttpRequest req, WorkspaceState state, DocumentManager docManager, SyncManager sync) => {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = System.Text.Json.JsonDocument.Parse(body);
            var filename = data.RootElement.GetProperty("filename").GetString();
            var content = data.RootElement.GetProperty("content").GetString();
            
            var path = Path.Combine(state.CurrentFolder, filename!);
            await File.WriteAllTextAsync(path, content);
            docManager.GetOrCreateDocument(filename!);
            
            // Re-init local folder to update hashes
            sync.InitializeLocalFolder();
            return Results.Ok();
        });

        // File System REST Routes
        app.MapGet("/api/files", (WorkspaceState state) =>
        {
            var files = Directory.GetFiles(state.CurrentFolder, "*.md")
                                 .Select(Path.GetFileName)
                                 .ToArray();
            return Results.Ok(files);
        });

        app.MapPost("/api/files", async (HttpRequest req, WorkspaceState state) =>
        {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = System.Text.Json.JsonDocument.Parse(body);
            var filename = data.RootElement.GetProperty("filename").GetString();
            if (string.IsNullOrEmpty(filename)) return Results.BadRequest();
            if (!filename.EndsWith(".md")) filename += ".md";

            var filePath = Path.Combine(state.CurrentFolder, filename);
            if (!File.Exists(filePath))
            {
                await File.WriteAllTextAsync(filePath, "# " + filename.Replace(".md", ""));
            }
            return Results.Ok();
        });

        app.MapDelete("/api/files/{filename}", (string filename, WorkspaceState state) =>
        {
            var filePath = Path.Combine(state.CurrentFolder, filename);
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
            return Results.Ok();
        });

        app.MapGet("/api/peers", (LanDiscoveryService discovery) => {
            return Results.Ok(discovery.GetDiscoveredPeers());
        });

        app.MapPost("/api/connect", async (HttpRequest req, LanDiscoveryService discovery, Microsoft.AspNetCore.SignalR.IHubContext<DocumentHub> hubContext) => {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = System.Text.Json.JsonDocument.Parse(body);
            var ip = data.RootElement.GetProperty("ip").GetString();
            var port = data.RootElement.GetProperty("port").GetInt32();
            var success = await discovery.ConnectToPeerAsync(ip!, port, hubContext);
            return success ? Results.Ok() : Results.BadRequest();
        });

        app.MapGet("/api/share", (LanDiscoveryService discovery) => {
            discovery.BroadcastQuery();
            var host = System.Net.Dns.GetHostName();
            var ips = System.Net.Dns.GetHostEntry(host).AddressList
                .Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                .Select(a => a.ToString())
                .ToList();
            ips.Add("127.0.0.1"); // Always include localhost for testing
            return Results.Ok(new { ips = ips.Distinct(), port = discovery.Port });
        });

        app.MapGet("/api/settings", (WorkspaceState state) => {
            return Results.Ok(state.Settings);
        });

        app.MapPost("/api/settings", async (HttpRequest req, WorkspaceState state) => {
            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync();
            var data = System.Text.Json.JsonDocument.Parse(body);
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

        var server = app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        var addressFeature = server.Features.Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>();
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
        var startUrl = isDevelopment ? $"http://127.0.0.1:5173?backend={localServerUrl}" : $"{localServerUrl}?backend={localServerUrl}";

        var window = new PhotinoWindow()
            .SetTitle("Synq - Local-First Markdown Editor")
            .SetSize(1280, 800)
            .Center()
            .SetContextMenuEnabled(false)
            .SetDevToolsEnabled(true)
            .SetSmoothScrollingEnabled(true)
            .SetFileSystemAccessEnabled(true)
            .Load(startUrl);

        bool isMaximized = false;
        window.RegisterWebMessageReceivedHandler((sender, message) =>
        {
            var win = (PhotinoWindow)sender!;
            try
            {
                var msg = System.Text.Json.JsonDocument.Parse(message);
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
                        var paths = win.ShowOpenFolder();
                        if (paths != null && paths.Length > 0)
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            state.CurrentFolder = paths[0];
                            win.SendWebMessage("folderOpened");
                        }
                        break;
                    case "openRecent":
                        var recentPath = msg.RootElement.GetProperty("path").GetString();
                        if (!string.IsNullOrEmpty(recentPath) && Directory.Exists(recentPath))
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            state.CurrentFolder = recentPath;
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
                        var hubContext = app.Services.GetRequiredService<Microsoft.AspNetCore.SignalR.IHubContext<DocumentHub>>();
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