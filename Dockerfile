FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

# Install Node.js and Bun for frontend build
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g bun

WORKDIR /src

# Copy project files
COPY src/Engine/Engine.csproj src/Engine/
COPY src/Server/Server.csproj src/Server/
COPY src/Client/package.json src/Client/
# We need Desktop/src because Server.csproj dynamically links to it
COPY src/Desktop/src src/Desktop/src
RUN dotnet restore src/Server/Server.csproj

# Copy the rest of the engine, server, and client source
COPY src/Engine src/Engine/
COPY src/Server src/Server/
COPY src/Client src/Client/

# Build and Publish the headless server
RUN dotnet publish src/Server/Server.csproj -c Release -r linux-x64 --self-contained true -p:PublishSingleFile=true -o /app/publish

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0
WORKDIR /app
COPY --from=build /app/publish .

# Persistent storage for markdown notes
VOLUME /data
ENV folder=/data
ENV port=5000

EXPOSE 5000
ENTRYPOINT ["./Server"]
