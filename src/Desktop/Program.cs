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

        // Register Core State and Background Network Service
        builder.Services.AddSingleton<TextSequence>(_ => new TextSequence(Environment.MachineName));
        builder.Services.AddHostedService<LanDiscoveryService>();

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
        app.MapGet("/api/document", (TextSequence sequence) => Results.Ok(new { text = sequence.ToString() }));

        // If the user navigates to a route (like /settings), serve index.html
        app.MapFallbackToFile("index.html");

        // Start the ASP.NET Core web server on a local port in the background
        const string serverUrl = "http://127.0.0.1:5000";
        app.Urls.Add(serverUrl); // Explicitly bind to this port
        app.StartAsync().GetAwaiter().GetResult();

        using (var httpClient = new HttpClient())
        {
            var serverReady = false;
            while (!serverReady)
                try
                {
                    var response = httpClient.GetAsync(serverUrl).GetAwaiter().GetResult();
                    if (response.IsSuccessStatusCode)
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
        var startUrl = isDevelopment ? "http://127.0.0.1:5173" : serverUrl;

        var window = new PhotinoWindow()
            .SetTitle("Synq - Local-First Markdown Editor")
            .SetFileSystemAccessEnabled(true)
            .SetSize(1280, 800)
            .Center()
            .Load(startUrl);

        window.WindowClosing += (sender, e) =>
        {
            app.StopAsync().GetAwaiter().GetResult();
            return false;
        };

        window.WaitForClose();
    }
}