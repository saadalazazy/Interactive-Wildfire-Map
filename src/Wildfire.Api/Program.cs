using Microsoft.OpenApi.Models;
using Wildfire.Api;

const string FrontendCorsPolicy = "frontend";

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Wildfire API",
        Version = "v1",
        Description =
            "Receives the wildfire features selected on the map and stores them in saved_fires.json."
    });
});

// The page is served from a different origin (Live Server, file://, ...) than the API,
// so the browser needs an explicit CORS grant before it will let fetch() POST here.
builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy => policy
        .AllowAnyOrigin()
        .AllowAnyHeader()
        .AllowAnyMethod());
});

// FireStore needs a file path, so it cannot be activated implicitly by the DI container.
builder.Services.AddSingleton(services =>
{
    var configuration = services.GetRequiredService<IConfiguration>();
    var environment = services.GetRequiredService<IHostEnvironment>();
    var logger = services.GetRequiredService<ILogger<FireStore>>();

    var configuredPath = configuration["FireStore:FilePath"] ?? "saved_fires.json";

    var filePath = Path.IsPathRooted(configuredPath)
        ? configuredPath
        : Path.Combine(environment.ContentRootPath, configuredPath);

    return new FireStore(filePath, logger);
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors(FrontendCorsPolicy);

app.MapFiresEndpoints();

app.Run();
