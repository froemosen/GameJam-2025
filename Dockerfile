# Multi-stage build for Go backend
FROM golang:1.23-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY internal ./internal
COPY main.go .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o server main.go

# Final stage - minimal image
FROM alpine:latest

RUN apk --no-cache add ca-certificates wget

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .

# Copy static assets
COPY assets ./assets
COPY src ./src
COPY index.html .

# Expose port
EXPOSE 5500

# Run the server
CMD ["./server"]
