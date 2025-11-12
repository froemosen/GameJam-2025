# Go Runtime Metrics in Dashboard

## New Panels Added (4 panels)

### 1. **Go Goroutines** 🔄
- **Metric:** `go_goroutines`
- **Shows:** Number of active goroutines
- **Healthy Range:** 10-100 for this application
- **Warning:** >1000 goroutines may indicate goroutine leak
- **Critical:** >5000 goroutines

**What to look for:**
- Steady number = good
- Slowly climbing = potential goroutine leak
- Spikes during activity = normal

---

### 2. **Go Memory Usage** 💾
- **Metrics:**
  - `go_memstats_alloc_bytes` - Currently allocated memory
  - `go_memstats_sys_bytes` - Total system memory
  - `go_memstats_heap_inuse_bytes` - Heap memory in use

**Healthy Pattern:**
- Sawtooth pattern (allocate → GC → drop → repeat)
- Memory should not continuously climb

**Warning Signs:**
- Continuous upward trend = memory leak
- Very high heap usage = need to optimize allocations

---

### 3. **CPU Usage** ⚡
- **Metric:** `rate(process_cpu_seconds_total[1m])`
- **Shows:** CPU usage as percentage (0.0-1.0 = 0%-100%)
- **Healthy Range:** <0.3 (30%) at moderate load

**What to look for:**
- Spikes during broadcasts = normal
- Sustained high usage = optimization needed
- Compare with message rates to find bottlenecks

---

### 4. **Go GC & Allocation Rate** 🗑️
- **Metrics:**
  - `rate(go_gc_duration_seconds_count[1m])` - GC frequency
  - `rate(go_memstats_alloc_bytes_total[1m])` - Memory allocation rate

**Healthy Pattern:**
- GC rate: 1-10 times per minute
- Allocation rate: depends on traffic

**Optimization:**
- High GC rate + high allocation = too many temporary objects
- Consider object pooling for frequently allocated types

---

## All Available Go Metrics

The Prometheus Go client automatically exports these metrics:

### Goroutines & Threads
- `go_goroutines` - Number of goroutines
- `go_threads` - Number of OS threads

### Memory Stats
- `go_memstats_alloc_bytes` - Bytes allocated and in use
- `go_memstats_sys_bytes` - Bytes obtained from system
- `go_memstats_heap_alloc_bytes` - Heap allocated bytes
- `go_memstats_heap_sys_bytes` - Heap system bytes
- `go_memstats_heap_idle_bytes` - Heap idle bytes
- `go_memstats_heap_inuse_bytes` - Heap in-use bytes
- `go_memstats_heap_released_bytes` - Heap released to OS
- `go_memstats_heap_objects` - Number of allocated objects
- `go_memstats_stack_inuse_bytes` - Stack in-use bytes
- `go_memstats_stack_sys_bytes` - Stack system bytes
- `go_memstats_mspan_inuse_bytes` - MSpan in-use bytes
- `go_memstats_mspan_sys_bytes` - MSpan system bytes
- `go_memstats_mcache_inuse_bytes` - MCache in-use bytes
- `go_memstats_mcache_sys_bytes` - MCache system bytes

### Garbage Collection
- `go_memstats_gc_sys_bytes` - GC system bytes
- `go_memstats_last_gc_time_seconds` - Last GC time
- `go_memstats_next_gc_bytes` - Next GC target bytes
- `go_gc_duration_seconds` - GC pause duration (histogram)

### Allocations
- `go_memstats_alloc_bytes_total` - Total bytes allocated (counter)
- `go_memstats_mallocs_total` - Total mallocs
- `go_memstats_frees_total` - Total frees
- `go_memstats_lookups_total` - Total pointer lookups

### Process Metrics
- `process_cpu_seconds_total` - Total CPU time
- `process_max_fds` - Maximum file descriptors
- `process_open_fds` - Open file descriptors
- `process_resident_memory_bytes` - Resident memory
- `process_virtual_memory_bytes` - Virtual memory
- `process_start_time_seconds` - Process start time

---

## How to Use These Metrics

### Scenario 1: Memory Leak Detection
```
1. Check: go_memstats_heap_inuse_bytes over 1 hour
2. If continuously climbing → memory leak
3. Look for: goroutine leak (go_goroutines also climbing)
4. Action: Profile with pprof to find leak source
```

### Scenario 2: CPU Bottleneck
```
1. Check: process_cpu_seconds_total rate
2. If high (>80%) → CPU bound
3. Cross-reference with: websocket_messages_sent_total
4. Action: Optimize hot paths, reduce allocations
```

### Scenario 3: GC Pressure
```
1. Check: go_gc_duration_seconds_count rate
2. If >20/min → too many allocations
3. Check: go_memstats_alloc_bytes_total rate
4. Action: Use object pooling, reduce temporary allocations
```

### Scenario 4: Goroutine Leak
```
1. Check: go_goroutines over time
2. Steady increase → goroutine leak
3. Common causes:
   - Blocked channels (no reader/writer)
   - Missing context cancellation
   - Infinite loops
4. Action: Add timeouts, use context.WithTimeout
```

---

## Dashboard Layout

The dashboard now has **14 panels** organized as:

**Row 1: Connections**
- Active Connections (gauge)
- Message Rates (stacked)

**Row 2: Network**
- Bandwidth
- Broadcasts

**Row 3: Performance**
- Message Processing Latency
- Sessions

**Row 4: Health**
- Errors
- Connection Errors

**Row 5: Go Runtime (NEW)**
- Go Goroutines
- Go Memory Usage
- CPU Usage
- Go GC & Allocation Rate

---

## Accessing the Dashboard

1. **Grafana UI:** http://localhost:3000
   - Username: `admin`
   - Password: `admin`
   - Dashboard: "Game WebSocket Metrics"

2. **Direct Link:**
   http://localhost:3000/d/game-websocket/game-websocket-metrics

3. **Prometheus (raw metrics):**
   http://localhost:9090

---

## Quick Health Check Queries

Run these in the analysis script or Grafana:

### Is server healthy?
```promql
# Goroutines not growing
delta(go_goroutines[5m]) < 10

# Memory not leaking  
rate(go_memstats_heap_inuse_bytes[5m]) < 1000000

# CPU reasonable
rate(process_cpu_seconds_total[1m]) < 0.5
```

### Performance OK?
```promql
# Message rate under control
sum(rate(websocket_messages_sent_total[1m])) < 100

# Bandwidth reasonable
rate(websocket_bytes_sent_total[1m]) < 1000000

# Low error rate
rate(websocket_connection_errors_total[1m]) < 0.1
```

---

## Alerting Thresholds (Future)

If you want to set up alerts:

```yaml
# High goroutines
- alert: HighGoroutines
  expr: go_goroutines > 1000
  for: 5m

# Memory leak
- alert: MemoryLeak
  expr: rate(go_memstats_heap_inuse_bytes[15m]) > 0
  for: 30m

# High CPU
- alert: HighCPU
  expr: rate(process_cpu_seconds_total[1m]) > 0.8
  for: 10m

# High GC pressure
- alert: HighGC
  expr: rate(go_gc_duration_seconds_count[1m]) > 20
  for: 5m
```

---

## Next Steps

1. **Restart Grafana** to load new panels:
   ```bash
   docker-compose -f docker-compose.monitoring.yml restart grafana
   ```

2. **View dashboard:**
   Open http://localhost:3000 and navigate to the dashboard

3. **Monitor during load test:**
   Run the game with multiple players and watch the metrics

4. **Analyze trends:**
   ```bash
   python3 analyze-metrics.py
   ```

The Go runtime metrics will help you understand server performance at a deeper level! 🚀
