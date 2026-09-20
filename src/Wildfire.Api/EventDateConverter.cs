using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wildfire.Api;

/// <summary>
/// Reads the layer's <c>eventdate</c> in either shape the field arrives in, and always writes
/// it back as ISO 8601 UTC.
/// </summary>
/// <remarks>
/// ArcGIS hands an <c>esriFieldTypeDate</c> to JavaScript as epoch milliseconds
/// (<c>"eventdate": 1758326400000</c>), which a plain <see cref="DateTimeOffset"/> rejects. The
/// map page converts to an ISO string before posting, but Swagger, curl and anything replaying
/// raw ArcGIS output do not - so both are accepted rather than 400-ing the whole request.
/// </remarks>
public sealed class EventDateConverter : JsonConverter<DateTimeOffset?>
{
    public override DateTimeOffset? Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.Null:
                return null;

            case JsonTokenType.Number when reader.TryGetInt64(out var epochMilliseconds):
                return DateTimeOffset.FromUnixTimeMilliseconds(epochMilliseconds);

            case JsonTokenType.String:
                var text = reader.GetString();

                if (string.IsNullOrWhiteSpace(text))
                {
                    return null;
                }

                if (DateTimeOffset.TryParse(
                        text,
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                        out var parsed))
                {
                    return parsed;
                }

                throw new JsonException(
                    $"'eventdate' string '{text}' is not a date. Use ISO 8601, " +
                    "for example 2024-09-20T13:45:00Z.");

            default:
                throw new JsonException(
                    $"'eventdate' must be an ISO 8601 string or epoch milliseconds, " +
                    $"but was {reader.TokenType}.");
        }
    }

    public override void Write(
        Utf8JsonWriter writer,
        DateTimeOffset? value,
        JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }

        writer.WriteStringValue(value.Value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));
    }
}
