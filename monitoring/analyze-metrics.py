#!/usr/bin/env python3
"""
Advanced metrics analysis tool for Game WebSocket Server
Provides detailed insights and recommendations
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

PROMETHEUS_URL = "http://localhost:9090/api/v1"
GRAFANA_URL = "http://localhost:3000"

class MetricsAnalyzer:
    def __init__(self):
        self.issues = []
        self.recommendations = []
        
    def query(self, query: str) -> Dict:
        """Query Prometheus"""
        try:
            response = requests.get(
                f"{PROMETHEUS_URL}/query",
                params={'query': query},
                timeout=5
            )
            return response.json()
        except Exception as e:
            print(f"❌ Error querying Prometheus: {e}")
            return {}
    
    def query_range(self, query: str, minutes: int = 5) -> Dict:
        """Query Prometheus with time range"""
        try:
            end = datetime.now()
            start = end - timedelta(minutes=minutes)
            response = requests.get(
                f"{PROMETHEUS_URL}/query_range",
                params={
                    'query': query,
                    'start': start.timestamp(),
                    'end': end.timestamp(),
                    'step': '15s'
                },
                timeout=5
            )
            return response.json()
        except Exception as e:
            print(f"❌ Error querying Prometheus: {e}")
            return {}
    
    def get_value(self, result: Dict) -> float:
        """Extract value from Prometheus result"""
        try:
            if result.get('data', {}).get('result'):
                return float(result['data']['result'][0]['value'][1])
        except (KeyError, IndexError, ValueError):
            pass
        return 0.0
    
    def get_values_by_label(self, result: Dict, label: str = 'type') -> Dict[str, float]:
        """Extract values by label from Prometheus result"""
        values = {}
        try:
            for item in result.get('data', {}).get('result', []):
                label_value = item.get('metric', {}).get(label, 'unknown')
                value = float(item['value'][1])
                values[label_value] = value
        except (KeyError, ValueError):
            pass
        return values
    
    def analyze_connections(self):
        """Analyze WebSocket connections"""
        print("\n" + "="*60)
        print("📡 CONNECTION ANALYSIS")
        print("="*60)
        
        active = self.get_value(self.query("websocket_active_connections"))
        total = self.get_value(self.query("websocket_total_connections"))
        errors = self.get_value(self.query("websocket_connection_errors_total"))
        
        print(f"Active Connections: {int(active)}")
        print(f"Total Connections: {int(total)}")
        print(f"Connection Errors: {int(errors)}")
        
        if active > 50:
            self.issues.append("High number of active connections (>50)")
            self.recommendations.append(
                "Consider implementing connection limits or load balancing"
            )
        
        if errors > 0:
            error_rate = self.get_value(
                self.query("rate(websocket_connection_errors_total[5m])")
            )
            print(f"Error Rate: {error_rate:.2f}/sec")
            if error_rate > 0.1:
                self.issues.append(f"Connection error rate: {error_rate:.2f}/sec")
    
    def analyze_message_rates(self):
        """Analyze message rates"""
        print("\n" + "="*60)
        print("📨 MESSAGE RATE ANALYSIS")
        print("="*60)
        
        # Received messages
        received = self.get_values_by_label(
            self.query("rate(websocket_messages_received_total[1m])")
        )
        
        print("\n📥 Received (per second):")
        for msg_type, rate in sorted(received.items(), key=lambda x: x[1], reverse=True):
            print(f"  {msg_type:20s}: {rate:8.2f}/sec")
            
            # Check for issues
            if msg_type == "update" and rate > 20:
                self.issues.append(f"High update rate: {rate:.1f}/sec per connection")
                self.recommendations.append(
                    f"Reduce update frequency in multiplayer client (currently ~{1000/rate:.0f}ms)"
                )
        
        # Sent messages
        sent = self.get_values_by_label(
            self.query("rate(websocket_messages_sent_total[1m])")
        )
        
        print("\n📤 Sent (per second):")
        total_sent = 0
        for msg_type, rate in sorted(sent.items(), key=lambda x: x[1], reverse=True):
            print(f"  {msg_type:20s}: {rate:8.2f}/sec")
            total_sent += rate
            
            if msg_type == "playerUpdate" and rate > 50:
                self.issues.append(f"CRITICAL: playerUpdate rate: {rate:.1f}/sec")
                self.recommendations.append(
                    "PlayerUpdate broadcasts are multiplied by player count - this is causing network saturation"
                )
        
        print(f"\n  {'TOTAL':20s}: {total_sent:8.2f}/sec")
        
        if total_sent > 100:
            self.issues.append(f"Very high total message rate: {total_sent:.1f}/sec")
    
    def analyze_bandwidth(self):
        """Analyze bandwidth usage"""
        print("\n" + "="*60)
        print("🌐 BANDWIDTH ANALYSIS")
        print("="*60)
        
        bytes_sent = self.get_value(self.query("rate(websocket_bytes_sent_total[1m])"))
        bytes_recv = self.get_value(self.query("rate(websocket_bytes_received_total[1m])"))
        
        kb_sent = bytes_sent / 1024
        mb_sent = bytes_sent / 1024 / 1024
        kb_recv = bytes_recv / 1024
        
        print(f"Sent:     {kb_sent:8.2f} KB/sec ({mb_sent:.3f} MB/sec)")
        print(f"Received: {kb_recv:8.2f} KB/sec")
        print(f"Total:    {(kb_sent + kb_recv):8.2f} KB/sec")
        
        # Calculate per-connection bandwidth
        active_conns = self.get_value(self.query("websocket_active_connections"))
        if active_conns > 0:
            per_conn_sent = kb_sent / active_conns
            print(f"\nPer Connection: {per_conn_sent:8.2f} KB/sec sent")
            
            if per_conn_sent > 50:
                self.issues.append(f"High per-connection bandwidth: {per_conn_sent:.1f} KB/sec")
        
        # Critical thresholds
        if mb_sent > 1:
            self.issues.append(f"CRITICAL: Bandwidth exceeds 1 MB/sec ({mb_sent:.2f} MB/sec)")
            self.recommendations.append(
                "This will saturate most home internet connections. "
                "Consider implementing message throttling and compression."
            )
        elif kb_sent > 500:
            self.issues.append(f"High bandwidth usage: {kb_sent:.1f} KB/sec")
            self.recommendations.append(
                "Optimize message payloads and reduce update frequency"
            )
    
    def analyze_broadcasts(self):
        """Analyze broadcast patterns"""
        print("\n" + "="*60)
        print("📢 BROADCAST ANALYSIS")
        print("="*60)
        
        broadcast_rate = self.get_value(
            self.query("rate(websocket_broadcasts_sent_total[1m])")
        )
        avg_recipients = self.get_value(
            self.query("rate(websocket_broadcast_recipients_sum[1m]) / rate(websocket_broadcast_recipients_count[1m])")
        )
        
        print(f"Broadcast Rate: {broadcast_rate:.2f}/sec")
        print(f"Avg Recipients: {avg_recipients:.1f} players")
        
        # Calculate effective message rate (broadcasts * recipients)
        effective_rate = broadcast_rate * avg_recipients
        print(f"Effective Rate: {effective_rate:.1f} messages/sec")
        print(f"  (each broadcast creates {avg_recipients:.0f} individual messages)")
        
        if effective_rate > 100:
            self.issues.append(f"CRITICAL: Effective broadcast rate: {effective_rate:.1f}/sec")
            self.recommendations.append(
                "Implement spatial partitioning: only broadcast to nearby players"
            )
            self.recommendations.append(
                "Use interest management: players only receive updates for visible objects"
            )
        
        # Analyze distribution
        p95 = self.get_value(
            self.query("histogram_quantile(0.95, rate(websocket_broadcast_recipients_bucket[5m]))")
        )
        print(f"95th percentile recipients: {p95:.1f}")
    
    def analyze_performance(self):
        """Analyze message processing performance"""
        print("\n" + "="*60)
        print("⚡ PERFORMANCE ANALYSIS")
        print("="*60)
        
        # Get processing durations by type
        durations = self.get_values_by_label(
            self.query("histogram_quantile(0.95, rate(websocket_message_processing_duration_seconds_bucket[5m]))")
        )
        
        print("\n95th Percentile Processing Time:")
        for msg_type, duration in sorted(durations.items(), key=lambda x: x[1], reverse=True):
            ms = duration * 1000
            print(f"  {msg_type:20s}: {ms:6.2f}ms")
            
            if ms > 100:
                self.issues.append(f"Slow processing for {msg_type}: {ms:.1f}ms")
                self.recommendations.append(
                    f"Optimize {msg_type} message handler"
                )
    
    def analyze_sessions(self):
        """Analyze game sessions"""
        print("\n" + "="*60)
        print("🎮 SESSION ANALYSIS")
        print("="*60)
        
        active = self.get_value(self.query("game_active_sessions"))
        total = self.get_value(self.query("game_total_sessions"))
        
        print(f"Active Sessions: {int(active)}")
        print(f"Total Created: {int(total)}")
        
        if active > 0:
            avg_players = self.get_value(
                self.query("histogram_quantile(0.50, rate(game_players_per_session_bucket[5m]))")
            )
            print(f"Median Players/Session: {avg_players:.1f}")
    
    def analyze_go_runtime(self):
        """Analyze Go runtime metrics"""
        print("\n" + "="*60)
        print("🔧 GO RUNTIME ANALYSIS")
        print("="*60)
        
        # Goroutines
        goroutines = self.get_value(self.query("go_goroutines"))
        print(f"\nGoroutines: {int(goroutines)}")
        
        if goroutines > 5000:
            self.issues.append(f"CRITICAL: Very high goroutines: {int(goroutines)}")
            self.recommendations.append("Goroutine leak detected - check for blocked channels or missing context cancellation")
        elif goroutines > 1000:
            self.issues.append(f"High goroutines: {int(goroutines)}")
            self.recommendations.append("Monitor goroutine count for potential leaks")
        
        # Memory
        heap_inuse = self.get_value(self.query("go_memstats_heap_inuse_bytes"))
        heap_alloc = self.get_value(self.query("go_memstats_alloc_bytes"))
        sys_mem = self.get_value(self.query("go_memstats_sys_bytes"))
        
        print(f"\nMemory:")
        print(f"  Heap In Use:  {heap_inuse / 1024 / 1024:8.2f} MB")
        print(f"  Allocated:    {heap_alloc / 1024 / 1024:8.2f} MB")
        print(f"  System:       {sys_mem / 1024 / 1024:8.2f} MB")
        
        # Check for memory growth
        heap_growth = self.get_value(self.query("rate(go_memstats_heap_inuse_bytes[5m])"))
        if heap_growth > 100000:  # More than 100KB/sec growth
            self.issues.append(f"Memory growing: {heap_growth / 1024:.1f} KB/sec")
            self.recommendations.append("Possible memory leak - monitor heap growth over time")
        
        # CPU
        cpu_usage = self.get_value(self.query("rate(process_cpu_seconds_total[1m])"))
        print(f"\nCPU Usage: {cpu_usage * 100:6.2f}%")
        
        if cpu_usage > 0.8:
            self.issues.append(f"High CPU usage: {cpu_usage * 100:.1f}%")
            self.recommendations.append("CPU bottleneck detected - optimize hot paths")
        
        # GC stats
        gc_rate = self.get_value(self.query("rate(go_gc_duration_seconds_count[1m])"))
        alloc_rate = self.get_value(self.query("rate(go_memstats_alloc_bytes_total[1m])"))
        
        print(f"\nGarbage Collection:")
        print(f"  GC Rate:      {gc_rate:8.2f} times/min")
        print(f"  Alloc Rate:   {alloc_rate / 1024 / 1024:8.2f} MB/sec")
        
        if gc_rate > 20:
            self.issues.append(f"High GC rate: {gc_rate:.1f} times/min")
            self.recommendations.append("Too many allocations - consider object pooling")
    
    def calculate_optimization_potential(self):
        """Calculate potential savings from optimizations"""
        print("\n" + "="*60)
        print("💰 OPTIMIZATION POTENTIAL")
        print("="*60)
        
        current_bandwidth = self.get_value(
            self.query("rate(websocket_bytes_sent_total[1m])")
        ) / 1024 / 1024
        
        # Estimate savings
        print("\nEstimated bandwidth reduction potential:")
        
        scenarios = [
            ("Reduce update rate to 10/sec", 0.5, "50%"),
            ("Implement delta compression", 0.3, "30%"),
            ("Use binary protocol instead of JSON", 0.4, "40%"),
            ("Spatial partitioning (only nearby)", 0.6, "60%"),
        ]
        
        for scenario, reduction, pct in scenarios:
            saved = current_bandwidth * reduction
            new_bandwidth = current_bandwidth * (1 - reduction)
            print(f"\n  {scenario}:")
            print(f"    Current: {current_bandwidth:.2f} MB/sec")
            print(f"    After:   {new_bandwidth:.2f} MB/sec")
            print(f"    Saved:   {saved:.2f} MB/sec ({pct})")
    
    def print_summary(self):
        """Print summary of issues and recommendations"""
        print("\n" + "="*60)
        print("📋 SUMMARY")
        print("="*60)
        
        if self.issues:
            print(f"\n🚨 {len(self.issues)} Issues Found:")
            for i, issue in enumerate(self.issues, 1):
                print(f"  {i}. {issue}")
        else:
            print("\n✅ No critical issues detected!")
        
        if self.recommendations:
            print(f"\n💡 {len(self.recommendations)} Recommendations:")
            for i, rec in enumerate(self.recommendations, 1):
                print(f"  {i}. {rec}")
        
        print(f"\n📊 Grafana Dashboard: {GRAFANA_URL}")
        print(f"🔍 Prometheus: {PROMETHEUS_URL.replace('/api/v1', '')}")
        print()

def main():
    print("🔍 Game Server Metrics Analysis")
    print("=" * 60)
    
    # Check connectivity
    try:
        response = requests.get(f"{PROMETHEUS_URL}/query", params={'query': '1'}, timeout=2)
        if response.status_code != 200:
            print("❌ Cannot connect to Prometheus")
            print("Make sure the monitoring stack is running:")
            print("  docker-compose -f docker-compose.monitoring.yml up -d")
            return
    except Exception as e:
        print(f"❌ Cannot connect to Prometheus: {e}")
        return
    
    print("✅ Connected to Prometheus\n")
    
    # Run analysis
    analyzer = MetricsAnalyzer()
    
    analyzer.analyze_connections()
    analyzer.analyze_message_rates()
    analyzer.analyze_bandwidth()
    analyzer.analyze_broadcasts()
    analyzer.analyze_performance()
    analyzer.analyze_sessions()
    analyzer.analyze_go_runtime()
    analyzer.calculate_optimization_potential()
    analyzer.print_summary()

if __name__ == "__main__":
    main()
