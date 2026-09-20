namespace Wildfire.Api;

public static class FireValidator
{
    private const int Wgs84 = 4326;
    private const int WebMercator = 3857;
    private const int WebMercatorOldEsriId = 102100;

    private const double MaxLongitude = 180.0;
    private const double MaxLatitude = 90.0;
    private const double MaxEasting = 20037508.342789244;
    private const double MaxNorthing = 20048966.104014594;

    public static List<string> Validate(FireFeature? fire)
    {
        var errors = new List<string>();

        if (fire is null)
        {
            errors.Add("Feature entry is null.");
            return errors;
        }

        CheckIds(fire, errors);
        CheckGeometry(fire.Geometry, errors);

        // 'attributes.eventdate' is deliberately unchecked: the layer leaves it null on plenty of
        // records, so it is optional, and EventDateConverter already rejects anything that is not
        // a date. Any range rule beyond that would throw out legitimate rows.

        return errors;
    }

    private static void CheckIds(FireFeature fire, List<string> errors)
    {
        if (fire.Id is null)
        {
            errors.Add("'id' is required.");
        }

        if (fire.Attributes is null)
        {
            errors.Add("'attributes' is required.");
            return;
        }

        if (fire.Attributes.ObjectId is null)
        {
            errors.Add("'attributes.objectid' is required; it is the fire's primary key in the source layer.");
            return;
        }

        if (fire.Id is not null && fire.Id != fire.Attributes.ObjectId)
        {
            errors.Add($"'attributes.objectid' ({fire.Attributes.ObjectId}) must match 'id' ({fire.Id}).");
        }
    }

    private static void CheckGeometry(PointGeometry? geometry, List<string> errors)
    {
        if (geometry is null)
        {
            errors.Add("'geometry' is required.");
            return;
        }

        var wkid = geometry.SpatialReference?.Wkid;
        var systemIsKnown = false;

        if (wkid is null)
        {
            errors.Add(
                "'geometry.spatialReference.wkid' is required; coordinates without a declared " +
                "coordinate system cannot be interpreted.");
        }
        else if (wkid is Wgs84 or WebMercator or WebMercatorOldEsriId)
        {
            systemIsKnown = true;
        }
        else
        {
            errors.Add(
                $"Unsupported coordinate system 'wkid {wkid}'. Supported: {Wgs84} (WGS 84), " +
                $"{WebMercator} / {WebMercatorOldEsriId} (Web Mercator).");
        }

        var xIsUsable = CheckNumber(geometry.X, "geometry.x", errors);
        var yIsUsable = CheckNumber(geometry.Y, "geometry.y", errors);

        if (systemIsKnown && xIsUsable && yIsUsable)
        {
            CheckRange(wkid!.Value, geometry.X!.Value, geometry.Y!.Value, errors);
        }
    }

    private static bool CheckNumber(double? value, string name, List<string> errors)
    {
        if (value is null)
        {
            errors.Add($"'{name}' is required.");
            return false;
        }

        if (double.IsNaN(value.Value) || double.IsInfinity(value.Value))
        {
            errors.Add($"'{name}' must be a finite number.");
            return false;
        }

        return true;
    }

    private static void CheckRange(int wkid, double x, double y, List<string> errors)
    {
        if (wkid == Wgs84)
        {
            CheckLimit(x, MaxLongitude, "longitude", "degrees", "EPSG:4326 (WGS 84, degrees)", errors);
            CheckLimit(y, MaxLatitude, "latitude", "degrees", "EPSG:4326 (WGS 84, degrees)", errors);
        }
        else
        {
            CheckLimit(x, MaxEasting, "easting", "metres", "EPSG:3857 (Web Mercator, metres)", errors);
            CheckLimit(y, MaxNorthing, "northing", "metres", "EPSG:3857 (Web Mercator, metres)", errors);
        }
    }

    private static void CheckLimit(
        double value,
        double limit,
        string meaning,
        string units,
        string systemName,
        List<string> errors)
    {
        if (value < -limit || value > limit)
        {
            errors.Add(
                $"{meaning} {value} is outside the valid range [{-limit}, {limit}] {units} " +
                $"for {systemName}.");
        }
    }
}
