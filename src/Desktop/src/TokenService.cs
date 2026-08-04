using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace Desktop;

public class TokenService
{
    public static string Compress(TokenPayload payload)
    {
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);

        using var output = new MemoryStream();
        using (var brotli = new BrotliStream(output, CompressionLevel.SmallestSize))
        {
            brotli.Write(bytes);
        }

        return Convert.ToBase64String(output.ToArray())
            .Replace('+', '-').Replace('/', '_').TrimEnd('='); // URL-safe
    }

    public static TokenPayload? Decompress(string token)
    {
        try
        {
            // Restore standard Base64
            var b64 = token.Replace('-', '+').Replace('_', '/');
            switch (b64.Length % 4)
            {
                case 2: b64 += "=="; break;
                case 3: b64 += "="; break;
            }

            var compressed = Convert.FromBase64String(b64);
            using var input = new MemoryStream(compressed);
            using var brotli = new BrotliStream(input, CompressionMode.Decompress);
            using var output = new MemoryStream();
            brotli.CopyTo(output);

            var json = Encoding.UTF8.GetString(output.ToArray());
            return JsonSerializer.Deserialize<TokenPayload>(json);
        }
        catch
        {
            return null;
        }
    }

    public record TokenPayload(string Sdp, string PeerId, string? WorkspaceId = null);
}