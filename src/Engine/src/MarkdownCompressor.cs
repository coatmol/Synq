using System.IO.Compression;
using System.Text;

namespace Engine;

public static class MarkdownCompressor
{
    public static byte[] Compress(string text)
    {
        var inputBytes = Encoding.UTF8.GetBytes(text);
        using var outputStream = new MemoryStream();

        using (var brotliStream = new BrotliStream(outputStream, CompressionLevel.Optimal))
        {
            brotliStream.Write(inputBytes, 0, inputBytes.Length);
        }

        return outputStream.ToArray();
    }

    public static string Decompress(byte[] compressedBytes)
    {
        using var inputStream = new MemoryStream(compressedBytes);
        using var outputStream = new MemoryStream();
        using (var brotliStream = new BrotliStream(inputStream, CompressionMode.Decompress))
        {
            brotliStream.CopyTo(outputStream);
        }

        return Encoding.UTF8.GetString(outputStream.ToArray());
    }
}