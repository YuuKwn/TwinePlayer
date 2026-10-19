namespace TwinePlayer.Native.Core;

public static class SaveRules
{
    public const int MaxBytes = 50 * 1024 * 1024;
    public static string Filename(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var name = value.Trim();
        if (name.Length > 255 || name.Any(c => c < 32 || "<>:\"|?*/\\".Contains(c)) ||
            !name.EndsWith(".save", StringComparison.OrdinalIgnoreCase) || name.Length <= 5)
            throw new ArgumentException("Use a plain Windows filename ending in .save (maximum 255 characters).");
        var device = name.Split('.')[0].TrimEnd(' ', '.').ToUpperInvariant();
        if (device is "CON" or "PRN" or "AUX" or "NUL" ||
            (device.Length == 4 && (device.StartsWith("COM") || device.StartsWith("LPT")) && device[3] is >= '1' and <= '9'))
            throw new ArgumentException("The save filename is a reserved Windows device name.");
        return name;
    }
    public static string DirectoryFor(string gamePath) => Path.Combine(Path.GetDirectoryName(StoryFileRules.Normalize(gamePath))!, Path.GetFileNameWithoutExtension(gamePath) + "_saves");
    public static string PathFor(string gamePath, string filename) => Path.Combine(DirectoryFor(gamePath), Filename(filename));
    public static void ValidatePayload(ReadOnlyMemory<byte> bytes)
    {
        if (bytes.IsEmpty || bytes.Length > MaxBytes) throw new InvalidDataException("Save data must contain between 1 byte and 50 MiB.");
        var text = System.Text.Encoding.UTF8.GetString(bytes.Span).Trim();
        if (text.Length == 0 || text.Equals("null", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Save data contains no usable game state.");
    }
}

public sealed record SaveEntry(string Filename, long Bytes, DateTime ModifiedUtc)
{
    public override string ToString() => $"{Filename} · {ModifiedUtc.ToLocalTime():g} · {Bytes:N0} bytes";
}
