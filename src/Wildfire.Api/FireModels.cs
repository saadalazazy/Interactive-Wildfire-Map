using System.Text.Json.Serialization;

namespace Wildfire.Api;
public sealed record FireFeature
{
    [JsonPropertyName("id")]
    public long? Id { get; init; }

    [JsonPropertyName("attributes")]
    public FireAttributes? Attributes { get; init; }

    [JsonPropertyName("geometry")]
    public PointGeometry? Geometry { get; init; }
}

public sealed record FireAttributes
{
    [JsonPropertyName("objectid")]
    public long? ObjectId { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }

    [JsonPropertyName("eventtype")]
    public int? EventType { get; init; }

    [JsonPropertyName("eventTypeLabel")]
    public string? EventTypeLabel { get; init; }

    // The attribute puts the converter on the property itself, so it applies to both the
    // ASP.NET Core pipeline and FireStore's own serializer options.
    [JsonPropertyName("eventdate")]
    [JsonConverter(typeof(EventDateConverter))]
    public DateTimeOffset? EventDate { get; init; }
}

public sealed record PointGeometry
{
    [JsonPropertyName("x")]
    public double? X { get; init; }

    [JsonPropertyName("y")]
    public double? Y { get; init; }

    [JsonPropertyName("spatialReference")]
    public SpatialReference? SpatialReference { get; init; }
}

public sealed record SpatialReference
{
    [JsonPropertyName("wkid")]
    public int? Wkid { get; init; }
}
public sealed record SaveResult(int Added, int Updated, int TotalSaved);
