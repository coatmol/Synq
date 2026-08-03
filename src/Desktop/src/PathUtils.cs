namespace Desktop;

public static class PathUtils
{
    public static string? GetSafePath(string basePath, string relativePath)
    {
        if (string.IsNullOrEmpty(basePath) || string.IsNullOrEmpty(relativePath)) return null;
        relativePath = relativePath.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var combined = Path.Combine(basePath, relativePath);
        var root = Path.GetFullPath(basePath);
        if (!root.EndsWith(Path.DirectorySeparatorChar.ToString())) root += Path.DirectorySeparatorChar;
        var target = Path.GetFullPath(combined);
        if (target.StartsWith(root) || target == Path.GetFullPath(basePath)) return target;
        return null;
    }
}