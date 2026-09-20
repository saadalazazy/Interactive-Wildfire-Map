namespace Wildfire.Api;

public static class FiresEndpoints
{
    public static void MapFiresEndpoints(this IEndpointRouteBuilder routes)
    {
        var fires = routes.MapGroup("/api/fires").WithTags("Fires");

        // An empty pattern keeps the route at "/api/fires"; "/" would register "/api/fires/".
        fires.MapPost("", SaveFires)
             .WithName("SaveFires")
             .WithSummary("Saves the features selected on the map into saved_fires.json.")
             .Produces<SaveResult>()
             .ProducesValidationProblem();

        fires.MapGet("", GetFires)
             .WithName("GetFires")
             .WithSummary("Returns everything currently stored in saved_fires.json.")
             .Produces<IReadOnlyList<FireFeature>>();
    }

    private static IResult SaveFires(List<FireFeature>? fires, FireStore store)
    {
        if (fires is null || fires.Count == 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["$"] = new[] { "Request body must be a non-empty JSON array of features." }
            });
        }

        var errors = new Dictionary<string, string[]>();

        for (var i = 0; i < fires.Count; i++)
        {
            var problems = FireValidator.Validate(fires[i]);

            if (problems.Count > 0)
            {
                errors[$"$[{i}]"] = problems.ToArray();
            }
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        return Results.Ok(store.Save(fires));
    }

    private static IResult GetFires(FireStore store)
    {
        return Results.Ok(store.GetAll());
    }

}
