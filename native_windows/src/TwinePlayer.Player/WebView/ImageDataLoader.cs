using System.Net;
using System.Text;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Player;

public static class ImageDataLoader
{
    private static readonly HttpClient Http = new(new HttpClientHandler { UseCookies = false, MaxAutomaticRedirections = 5, AutomaticDecompression = DecompressionMethods.All }) { Timeout = TimeSpan.FromSeconds(15) };
    public static async Task<byte[]> ReadAsync(StoryImageAddress address, CancellationToken token = default)
    {
        if (address.Kind == "data")
        {
            var comma = address.Source.IndexOf(','); var header = address.Source[..comma]; var payload = address.Source[(comma + 1)..];
            var bytes = header.EndsWith(";base64", StringComparison.OrdinalIgnoreCase) ? Convert.FromBase64String(payload) : Encoding.UTF8.GetBytes(Uri.UnescapeDataString(payload));
            if (bytes.Length is <= 0 or > StoryImageRules.MaxBytes) throw new InvalidDataException("Image data is empty or exceeds 50 MiB.");
            return bytes;
        }
        if (address.Kind != "remote") throw new ArgumentException("This image requires its story browser context.");
        using var response = await Http.GetAsync(address.Source, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > StoryImageRules.MaxBytes) throw new InvalidDataException("Remote image exceeds 50 MiB.");
        await using var stream = await response.Content.ReadAsStreamAsync(token).ConfigureAwait(false);
        using var output = new MemoryStream(); var buffer = new byte[65536];
        int count;
        while ((count = await stream.ReadAsync(buffer, token).ConfigureAwait(false)) > 0)
        {
            if (output.Length + count > StoryImageRules.MaxBytes) throw new InvalidDataException("Remote image exceeds 50 MiB.");
            output.Write(buffer, 0, count);
        }
        if (output.Length == 0) throw new InvalidDataException("Remote image is empty.");
        return output.ToArray();
    }
}
