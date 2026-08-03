using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.SignalR;
using Photino.NET;

namespace Desktop;

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

        ApiEndpoints.MapAll(app);

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
            .SetIconFile(Path.Combine(AppContext.BaseDirectory, "SynqWhite.ico"))
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

                            if (msg.RootElement.TryGetProperty("peer", out var peerEl) &&
                                peerEl.ValueKind != JsonValueKind.Null)
                            {
                                var peerIp = peerEl.GetProperty("ip").GetString();
                                var peerPort = peerEl.GetProperty("port").GetInt32();
                                var pwd = "";
                                if (peerEl.TryGetProperty("password", out var pwdEl) &&
                                    pwdEl.ValueKind != JsonValueKind.Null)
                                    pwd = pwdEl.GetString() ?? "";

                                if (!string.IsNullOrEmpty(pwd))
                                {
                                    state.Settings.PeerPasswords[$"{peerIp}:{peerPort}"] = pwd;
                                    state.SaveSettings();
                                }

                                var ctx = app.Services.GetRequiredService<IHubContext<DocumentHub>>();
                                _ = discoveryService.ConnectToPeerAsync(peerIp!, peerPort, ctx);
                            }
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

                            if (msg.RootElement.TryGetProperty("peer", out var peerEl) &&
                                peerEl.ValueKind != JsonValueKind.Null)
                            {
                                var peerIp = peerEl.GetProperty("ip").GetString();
                                var peerPort = peerEl.GetProperty("port").GetInt32();
                                var pwd = "";
                                if (peerEl.TryGetProperty("password", out var pwdEl) &&
                                    pwdEl.ValueKind != JsonValueKind.Null)
                                    pwd = pwdEl.GetString() ?? "";

                                if (!string.IsNullOrEmpty(pwd))
                                {
                                    state.Settings.PeerPasswords[$"{peerIp}:{peerPort}"] = pwd;
                                    state.SaveSettings();
                                }

                                var ctx = app.Services.GetRequiredService<IHubContext<DocumentHub>>();
                                _ = discoveryService.ConnectToPeerAsync(peerIp!, peerPort, ctx);
                            }
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