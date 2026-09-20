using System.Text.Encodings.Web;
using System.Text.Json;

namespace Wildfire.Api;

public sealed class FireStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly object _lock = new();

    private readonly ILogger<FireStore> _logger;

    public FireStore(string filePath, ILogger<FireStore> logger)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            throw new ArgumentException(
                "File path cannot be null or empty.",
                nameof(filePath));
        }

        FilePath = filePath;
        _logger = logger;
    }

    public string FilePath { get; }

    public IReadOnlyList<FireFeature> GetAll()
    {
        lock (_lock)
        {
            return ReadFile();
        }
    }

    public SaveResult Save(IReadOnlyList<FireFeature> fires)
    {
        ArgumentNullException.ThrowIfNull(fires);

        lock (_lock)
        {
            var saved = ReadFileBeforeSaving();
            var result = Merge(saved, fires);
            WriteFile(saved);

            return result;
        }
    }

    private static SaveResult Merge(
        List<FireFeature> saved,
        IReadOnlyList<FireFeature> incoming)
    {
        var added = 0;
        var updated = 0;

        foreach (var fire in incoming)
        {
            var position = saved.FindIndex(
                existing => existing.Id == fire.Id);

            if (position >= 0)
            {
                saved[position] = fire;
                updated++;
            }
            else
            {
                saved.Add(fire);
                added++;
            }
        }

        return new SaveResult(added, updated, saved.Count);
    }

    private List<FireFeature> ReadFile()
    {
        var json = File.Exists(FilePath)
            ? File.ReadAllText(FilePath)
            : null;

        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<FireFeature>();
        }

        return JsonSerializer.Deserialize<List<FireFeature>>(
                   json,
                   JsonOptions)
               ?? new List<FireFeature>();
    }

    private List<FireFeature> ReadFileBeforeSaving()
    {
        try
        {
            return ReadFile();
        }
        catch (JsonException ex)
        {
            var damagedPath =
                $"{FilePath}.corrupt-{DateTime.UtcNow:yyyyMMdd-HHmmss}";

            File.Move(FilePath, damagedPath, overwrite: true);

            _logger.LogError(
                ex,
                "Could not read {FilePath}. It has been kept as {DamagedPath} and a new file will be started.",
                FilePath,
                damagedPath);

            return new List<FireFeature>();
        }
    }

    private void WriteFile(List<FireFeature> fires)
    {
        var folder = Path.GetDirectoryName(FilePath);

        if (!string.IsNullOrEmpty(folder))
        {
            Directory.CreateDirectory(folder);
        }

        var temporaryPath = $"{FilePath}.tmp";

        File.WriteAllText(
            temporaryPath,
            JsonSerializer.Serialize(fires, JsonOptions));

        File.Move(
            temporaryPath,
            FilePath,
            overwrite: true);
    }
}